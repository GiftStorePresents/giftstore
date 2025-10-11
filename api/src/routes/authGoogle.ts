// src/routes/authGoogle.ts
import { Router, type Request, type Response } from "express";
import passport from "passport";
import "../lib/passport"; // rejestracja strategii Google
import { prisma } from "../lib/prisma";
import { setAuthCookie } from "../middleware/requireAuth";

const authGoogle: Router = Router(); // jawna adnotacja typu

// Spójne opcje dla ciasteczka koszyka
const CART_COOKIE = "cartId";
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 dni
};

const SITE_URL = (process.env.SITE_URL || "http://localhost:3000").replace(/\/+$/, "");

// Proste scalanie koszyków (guest -> user)
async function mergeCarts(userCartId: string, guestCartId?: string) {
  if (!guestCartId || guestCartId === userCartId) return;

  const guest = await prisma.cart.findUnique({
    where: { id: guestCartId },
    include: { items: true },
  });
  if (!guest || guest.items.length === 0) return;

  const userCart = await prisma.cart.findUnique({
    where: { id: userCartId },
    include: { items: true },
  });
  if (!userCart) return;

  const byVariant = new Map(userCart.items.map((it) => [it.variantId, it]));

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

// 1) Start: /api/auth/google
authGoogle.get(
  "/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
    prompt: "select_account",
    session: false,
  })
);

// 2) Callback: /api/auth/google/callback
authGoogle.get(
  "/google/callback",
  passport.authenticate("google", {
    session: false,
    failureRedirect: "/api/auth/google/failure",
  }),
  async (req: Request, res: Response) => {
    try {
      // lib/passport.ts powinien ustawić req.user
      const pUser = req.user as { id: string; email: string; name?: string | null } | undefined;
      if (!pUser) {
        return res.redirect(`${SITE_URL}/login?error=oauth_no_user`);
      }

      // Pobierz tokenVersion z DB (może nie być w typach)
      const userRow = await (prisma as any).user.findUnique({
        where: { id: pUser.id },
        select: { tokenVersion: true },
      });
      const tokenVersion: number = (userRow?.tokenVersion as number | undefined) ?? 0;

      // Ustaw JWT (NOWA sygnatura -> payload obiektowy)
      setAuthCookie(res, { sub: pUser.id, v: tokenVersion });

      // Upewnij się, że user ma koszyk
      let userCart = await prisma.cart.findFirst({ where: { userId: pUser.id } });
      if (!userCart) userCart = await prisma.cart.create({ data: { userId: pUser.id } });

      // Scal z koszykiem gościa (jeśli istniał)
      const guestCartId = (req as any).cookies?.[CART_COOKIE] as string | undefined;
      if (guestCartId) await mergeCarts(userCart.id, guestCartId);

      // Ustaw cartId cookie
      res.cookie(CART_COOKIE, userCart.id, COOKIE_OPTS);

      // Redirect do FE — po zalogowaniu
      return res.redirect(`${SITE_URL}/?login=success`);
    } catch (e) {
      console.error("[google/callback] error:", e);
      return res.redirect(`${SITE_URL}/login?error=oauth_failed`);
    }
  }
);

// 3) Porażka OAuth
authGoogle.get("/google/failure", (_req: Request, res: Response) => {
  return res.redirect(`${SITE_URL}/login?error=oauth_denied`);
});

export { authGoogle };
export default authGoogle;
