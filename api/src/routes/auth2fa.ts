// src/routes/auth2fa.ts
import { Router, type Request, type Response } from "express";
import { prisma } from "../lib/prisma";
import { addMinutes } from "date-fns";
import crypto from "crypto";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth";
import {
  rlSmsStart,
  rlSmsVerify,
  rlMfaStart,
  rlMfaComplete,
} from "../middleware/rateLimits";

const router: Router = Router();

function isPhone(v: string) {
  // luźna walidacja E.164 / cyfry + plus, bez spacji
  return typeof v === "string" && /^\+?[1-9]\d{6,15}$/.test(v.trim());
}
function make6() {
  return `${Math.floor(Math.random() * 1_000_000)}`.padStart(6, "0");
}

/**
 * POST /api/auth/2fa/sms/start
 * body: { phone }
 * - zapisuje numer (tymczasowo), wysyła 6‑cyfrowy kod na SMS (emulacja)
 * - purpose: "verify_phone"
 */
router.post("/2fa/sms/start", requireAuth, rlSmsStart, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId!;
    const { phone } = (req.body || {}) as { phone?: string };
    if (!phone || !isPhone(phone)) {
      return res.status(400).json({ error: "Podaj poprawny numer telefonu (np. +48123456789)." });
    }
    const normalized = phone.trim();

    // throttle: usuń niewykorzystane stare kody dla tego usera/telefonu i celu
    await prisma.smsCode.deleteMany({
      where: { userId, phone: normalized, usedAt: null, purpose: "verify_phone" },
    });

    const code = make6();
    const expiresAt = addMinutes(new Date(), 10);

    await prisma.smsCode.create({
      data: {
        userId,
        phone: normalized,
        code,
        purpose: "verify_phone",
        expiresAt,
      },
    });

    // Emulacja wysyłki "SMS"
    console.log(`[SMS EMU] to=${normalized} code=${code}`);

    return res.json({ ok: true, message: "Wysłaliśmy kod weryfikacyjny SMS." });
  } catch (e) {
    console.error("[2fa/sms/start] error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

/**
 * POST /api/auth/2fa/sms/verify
 * body: { phone, code }
 * - sprawdza 6‑cyfrowy kod; ustawia user.phone, phoneVerifiedAt; NIE włącza jeszcze mfaEnabled
 */
router.post("/2fa/sms/verify", requireAuth, rlSmsVerify, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId!;
    const { phone, code } = (req.body || {}) as { phone?: string; code?: string };
    if (!phone || !isPhone(phone) || !code) {
      return res.status(400).json({ error: "Wymagane phone i code." });
    }
    const normalized = phone.trim();

    // najnowszy, nieużyty, nieprzeterminowany kod
    const rec = await prisma.smsCode.findFirst({
      where: {
        userId,
        phone: normalized,
        purpose: "verify_phone",
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });
    if (!rec) return res.status(400).json({ error: "Kod nieprawidłowy lub wygasł." });

    if (rec.code !== code) {
      const next = rec.attempts + 1;
      if (next >= 5) {
        await prisma.smsCode.update({
          where: { id: rec.id },
          data: { attempts: next, usedAt: new Date() }, // blokada rekordu
        });
        return res.status(400).json({ error: "Kod zablokowany po 5 błędnych próbach." });
      }
      await prisma.smsCode.update({ where: { id: rec.id }, data: { attempts: next } });
      return res.status(400).json({ error: `Nieprawidłowy kod. Pozostało prób: ${5 - next}.` });
    }

    // poprawny kod → ustaw telefon + phoneVerifiedAt
    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { phone: normalized, phoneVerifiedAt: new Date() },
      }),
      prisma.smsCode.update({
        where: { id: rec.id },
        data: { usedAt: new Date() },
      }),
    ]);

    return res.json({ ok: true, message: "Numer potwierdzony. Możesz włączyć 2FA." });
  } catch (e) {
    console.error("[2fa/sms/verify] error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

/**
 * POST /api/auth/2fa/mfa/enable
 * - wymaga zweryfikowanego phone; włącza 2FA (mfaEnabled=true)
 */
router.post("/2fa/mfa/enable", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId!;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, phone: true, phoneVerifiedAt: true, mfaEnabled: true },
    });
    if (!user) return res.status(404).json({ error: "User not found" });
    if (!user.phone || !user.phoneVerifiedAt) {
      return res.status(400).json({ error: "Najpierw zweryfikuj numer telefonu." });
    }
    if (user.mfaEnabled) {
      return res.json({ ok: true, message: "2FA już jest włączone." });
    }
    await prisma.user.update({ where: { id: userId }, data: { mfaEnabled: true } });
    return res.json({ ok: true, message: "2FA zostało włączone." });
  } catch (e) {
    console.error("[2fa/mfa/enable] error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

/**
 * POST /api/auth/2fa/mfa/disable
 * - wyłącza 2FA (mfaEnabled=false)
 */
router.post("/2fa/mfa/disable", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId!;
    await prisma.user.update({ where: { id: userId }, data: { mfaEnabled: false } });
    return res.json({ ok: true, message: "2FA zostało wyłączone." });
  } catch (e) {
    console.error("[2fa/mfa/disable] error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

/**
 * POST /api/auth/2fa/mfa/start
 * - wysyła kod na zweryfikowany telefon (purpose: "mfa_login")
 * - w tym szkielecie chronione requireAuth (łatwe testy); do integracji z loginem wywołasz to
 *   po poprawnym haśle, ale przed finalnym JWT.
 */
router.post("/2fa/mfa/start", requireAuth, rlMfaStart, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId!;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, phone: true, phoneVerifiedAt: true, mfaEnabled: true },
    });
    if (!user) return res.status(404).json({ error: "User not found" });
    if (!user.mfaEnabled || !user.phone || !user.phoneVerifiedAt) {
      return res.status(400).json({ error: "2FA nieaktywne lub brak zweryfikowanego telefonu." });
    }

    await prisma.smsCode.deleteMany({
      where: { userId, phone: user.phone, usedAt: null, purpose: "mfa_login" },
    });

    const code = make6();
    const expiresAt = addMinutes(new Date(), 10);

    await prisma.smsCode.create({
      data: {
        userId,
        phone: user.phone,
        code,
        purpose: "mfa_login",
        expiresAt,
      },
    });

    console.log(`[SMS EMU] to=${user.phone} code=${code}`);

    return res.json({ ok: true, message: "Wysłaliśmy kod 2FA." });
  } catch (e) {
    console.error("[2fa/mfa/start] error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

/**
 * POST /api/auth/2fa/mfa/complete
 * body: { code }
 * - w tym szkielecie po prostu weryfikuje kod 2FA (purpose: "mfa_login")
 * - w docelowym flow: dopiero po tym wystawiasz finalny JWT/odblokowujesz sesję.
 */
router.post("/2fa/mfa/complete", requireAuth, rlMfaComplete, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId!;
    const { code } = (req.body || {}) as { code?: string };
    if (!code) return res.status(400).json({ error: "Wymagany code." });

    const rec = await prisma.smsCode.findFirst({
      where: {
        userId,
        purpose: "mfa_login",
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });
    if (!rec) return res.status(400).json({ error: "Kod nieprawidłowy lub wygasł." });

    if (rec.code !== code) {
      const next = rec.attempts + 1;
      if (next >= 5) {
        await prisma.smsCode.update({
          where: { id: rec.id },
          data: { attempts: next, usedAt: new Date() },
        });
        return res.status(400).json({ error: "Kod zablokowany po 5 błędnych próbach." });
      }
      await prisma.smsCode.update({ where: { id: rec.id }, data: { attempts: next } });
      return res.status(400).json({ error: `Nieprawidłowy kod. Pozostało prób: ${5 - next}.` });
    }

    await prisma.smsCode.update({ where: { id: rec.id }, data: { usedAt: new Date() } });

    // tu w realnym flow kończysz MFA (np. wystawiasz finalny JWT)
    return res.json({ ok: true, message: "2FA potwierdzone." });
  } catch (e) {
    console.error("[2fa/mfa/complete] error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

export default router;
