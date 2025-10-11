// src/routes/authEmailChange.ts
import { Router, type Request, type Response } from "express";
import { prisma } from "../lib/prisma";
import crypto from "crypto";
import { addMinutes } from "date-fns";
import { requireAuth, type AuthedRequest, clearAuthCookie } from "../middleware/requireAuth";
import { sendTemplatedMail } from "../lib/mailer";
import {
  rlEmailChangeStart,
  rlEmailChangeConfirm,
} from "../middleware/rateLimits";

const router: Router = Router();

function isEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

/**
 * POST /api/auth/change-email/start
 * body: { newEmail }
 */
router.post(
  "/change-email/start",
  rlEmailChangeStart,
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthedRequest).userId!;
      const { newEmail } = (req.body || {}) as { newEmail?: string };

      if (!newEmail || !isEmail(newEmail)) {
        return res.status(400).json({ error: "Podaj poprawny adres e-mail." });
      }

      const normalized = newEmail.trim().toLowerCase();

      // pobierz aktualny e-mail użytkownika
      const me = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
      });
      if (!me) return res.status(404).json({ error: "User not found" });

      if (normalized === me.email) {
        return res.status(409).json({ error: "To jest już Twój obecny e-mail." });
      }

      // czy adres jest wolny?
      const exists = await prisma.user.findUnique({ where: { email: normalized } });
      if (exists) {
        return res.status(409).json({ error: "Ten e-mail jest już zajęty." });
      }

      // wyczyść stare aktywne tokeny usera
      await prisma.emailChangeToken.deleteMany({
        where: { userId, usedAt: null, expiresAt: { gt: new Date() } },
      });

      const token = crypto.randomBytes(24).toString("hex");
      const expiresAt = addMinutes(new Date(), 30);

      await prisma.emailChangeToken.create({
        data: { userId, newEmail: normalized, token, expiresAt },
      });

      const siteURL = process.env.SITE_URL || "http://localhost:3000";
      const confirmLink = `${siteURL}/confirm-email-change?token=${token}`;

      // wyślij link na NOWY adres
      await sendTemplatedMail(normalized, "changeEmailStart", {
        confirmLink,
        newEmail: normalized,
      });

      return res.json({
        ok: true,
        message: "Wysłaliśmy link potwierdzający na nowy e-mail.",
      });
    } catch (e) {
      console.error("[change-email/start] error:", e);
      return res.status(500).json({ error: "Server error" });
    }
  }
);

/**
 * POST /api/auth/change-email/confirm
 * body: { token }
 *
 * - weryfikuje token
 * - podmienia email w userze
 * - unieważnia wszystkie sesje (tokenVersion++)
 * - czyści cookie (wymagane ponowne logowanie)
 */
router.post(
  "/change-email/confirm",
  rlEmailChangeConfirm,
  async (req: Request, res: Response) => {
    try {
      const { token } = (req.body || {}) as { token?: string };
      if (!token) return res.status(400).json({ error: "Brak tokenu." });

      const rec = await prisma.emailChangeToken.findUnique({ where: { token } });
      if (!rec || rec.usedAt || rec.expiresAt < new Date()) {
        return res.status(400).json({ error: "Token nieprawidłowy lub wygasł." });
      }

      // upewnij się, że adres nadal wolny
      const taken = await prisma.user.findUnique({ where: { email: rec.newEmail } });
      if (taken) {
        await prisma.emailChangeToken.update({
          where: { token },
          data: { usedAt: new Date() },
        });
        return res.status(409).json({ error: "Ten e-mail jest już zajęty." });
      }

      // podmień email i unieważnij sesje (tokenVersion++)
      const updated = await (prisma as any).user.update({
        where: { id: rec.userId },
        data: {
          email: rec.newEmail,
          tokenVersion: { increment: 1 },
          verifiedAt: new Date(),
        },
        select: { id: true, email: true, tokenVersion: true },
      });

      await prisma.emailChangeToken.update({
        where: { token },
        data: { usedAt: new Date() },
      });

      // czyścimy cookie JWT (wylogowanie na tym urządzeniu)
      clearAuthCookie(res);

      // (opcjonalnie) potwierdzenie na nowy e-mail
      try {
        await sendTemplatedMail(updated.email, "changeEmailConfirmed", {});
      } catch (e) {
        console.warn("[change-email/confirm] notify mail error:", e);
      }

      return res.json({
        ok: true,
        message: "E-mail został zmieniony. Zaloguj się ponownie.",
      });
    } catch (e) {
      console.error("[change-email/confirm] error:", e);
      return res.status(500).json({ error: "Server error" });
    }
  }
);

export default router;
