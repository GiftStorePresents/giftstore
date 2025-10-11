// src/routes/authMagic.ts
import { Router, type Request, type Response } from "express";
import { prisma } from "../lib/prisma";
import crypto from "crypto";
import { addMinutes } from "date-fns";
import { sendMail } from "../lib/mailer";
import { setAuthCookie } from "../middleware/requireAuth";

// Spójne opcje dla ciasteczka koszyka
const CART_COOKIE = "cartId";
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 dni
};

// Prosta walidacja e-maila
function isEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export const authMagic: Router = Router();

/**
 * POST /api/auth/magic/start  { email }
 * Tworzy jednorazowy token i wysyła link logowania na e-mail.
 */
authMagic.post("/start", async (req: Request, res: Response) => {
  try {
    const { email } = (req.body || {}) as { email?: string };
    if (!email) return res.status(400).json({ error: "Email required" });

    const normalized = email.trim().toLowerCase();
    if (!isEmail(normalized)) {
      return res.status(400).json({ error: "Podaj poprawny e-mail." });
    }

    // Throttling: jeśli w ciągu ostatnich 60s był niewykorzystany token — odmów
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
    const recent = await prisma.magicLinkToken.findFirst({
      where: {
        email: normalized,
        createdAt: { gt: oneMinuteAgo },
        usedAt: null,
        purpose: "login",
      },
      orderBy: { createdAt: "desc" },
    });
    if (recent) {
      return res.status(429).json({ error: "Poczekaj chwilę przed wysłaniem kolejnego linku." });
    }

    // Wyczyść stare niewykorzystane tokeny dla tego e-maila
    await prisma.magicLinkToken.deleteMany({
      where: { email: normalized, usedAt: null, purpose: "login" },
    });

    // Wygeneruj nowy token ważny 15 min
    const token = crypto.randomBytes(24).toString("hex");
    const expiresAt = addMinutes(new Date(), 15);

    await prisma.magicLinkToken.create({
      data: {
        email: normalized,
        token,
        purpose: "login",
        expiresAt,
      },
    });

    const siteURL = process.env.SITE_URL || "http://localhost:3000";
    const link = `${siteURL}/magic?token=${token}`;

    try {
      await sendMail(
        normalized,
        "Twój link logowania – Gift Store",
        `<p>Kliknij, aby się zalogować:</p>
         <p><a href="${link}">${link}</a></p>
         <p>Link ważny 15 minut.</p>`
      );
    } catch (e) {
      console.warn("[magic/start] mail error:", e);
    }

    return res.json({ ok: true, message: "Wysłaliśmy link logowania na e-mail." });
  } catch (e) {
    console.error("[magic/start] error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

/**
 * POST /api/auth/magic/consume  { token }
 * Weryfikuje token; tworzy usera jeśli nie istnieje; ustawia verifiedAt; loguje (JWT cookie);
 * scala koszyk gościa do usera i ustawia cartId cookie.
 */
authMagic.post("/consume", async (req: Request, res: Response) => {
  try {
    const { token } = (req.body || {}) as { token?: string };
    if (!token) return res.status(400).json({ error: "Token required" });

    const rec = await prisma.magicLinkToken.findUnique({ where: { token } });
    if (!rec || rec.usedAt || rec.expiresAt < new Date() || rec.purpose !== "login") {
      return res.status(400).json({ error: "Invalid or expired token" });
    }

    const email = rec.email;

    // Jeśli user nie istnieje — tworzymy (bez hasła), od razu weryfikujemy
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          verifiedAt: new Date(),
        },
      });
    } else if (!user.verifiedAt) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { verifiedAt: new Date() },
      });
    }

    // Oznacz token jako zużyty
    await prisma.magicLinkToken.update({
      where: { token },
      data: { usedAt: new Date() },
    });

    // Pobierz tokenVersion i wystaw JWT
    const userRow = await (prisma as any).user.findUnique({
      where: { id: user.id },
      select: { tokenVersion: true },
    });
    const tokenVersion: number = (userRow?.tokenVersion as number | undefined) ?? 0;

    setAuthCookie(res, { sub: user.id, v: tokenVersion });

    // Koszyk: upewnij się, że istnieje, a jeśli był koszyk gościa — scal
    let userCart = await prisma.cart.findFirst({ where: { userId: user.id } });
    if (!userCart) userCart = await prisma.cart.create({ data: { userId: user.id } });

    const guestCartId = (req as any).cookies?.[CART_COOKIE] as string | undefined;
    if (guestCartId && guestCartId !== userCart.id) {
      const guest = await prisma.cart.findUnique({
        where: { id: guestCartId },
        include: { items: true },
      });
      if (guest && guest.items.length) {
        const current = await prisma.cart.findUnique({
          where: { id: userCart.id },
          include: { items: true },
        });
        const byVariant = new Map(current!.items.map((it) => [it.variantId, it]));
        for (const gi of guest.items) {
          const existing = byVariant.get(gi.variantId);
          if (existing) {
            await prisma.cartItem.update({
              where: { id: existing.id },
              data: { qty: existing.qty + gi.qty },
            });
          } else {
            await prisma.cartItem.create({
              data: { cartId: userCart.id, variantId: gi.variantId, qty: gi.qty },
            });
          }
        }
        await prisma.cartItem.deleteMany({ where: { cartId: guest.id } });
        await prisma.cart.delete({ where: { id: guest.id } });
      }
    }

    // Ustaw aktualny cartId cookie dla zalogowanego usera
    res.cookie(CART_COOKIE, userCart.id, COOKIE_OPTS);

    // Zwróć usera (jak /login)
    return res.json({
      user: { id: user.id, email: user.email, name: user.name ?? null, role: (user as any).role ?? "USER" },
    });
  } catch (e) {
    console.error("[magic/consume] error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

export default authMagic;
