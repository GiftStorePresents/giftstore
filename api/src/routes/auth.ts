// src/routes/auth.ts

/**
 * ============================================================================
 *  AUTH ROUTES (JWT access + REFRESH sessions) + 2FA/SMS (verify phone + MFA)
 * ============================================================================
 *
 *  Co zawiera:
 *  - Rejestracja + weryfikacja e-mail 6-cyfrowym kodem
 *  - Logowanie (brute-force protection + blokada)
 *  - ME (miękkie 200 bez sesji)
 *  - Reset hasła (forgot/reset)
 *  - Profile (GET/PUT)
 *  - Change password
 *  - Resend email-code
 *  - Logout / Logout-all (unieważnia wszystkie tokeny + sesje refresh)
 *  - Refresh: /auth/refresh → nowy access token z refresh cookie
 *  - 2FA/SMS:
 *      * /2fa/phone/start (ustaw numer + wyślij SMS do weryfikacji)
 *      * /2fa/phone/verify (potwierdź kod SMS → phoneVerifiedAt)
 *      * /2fa/enable, /2fa/disable (włącz/wyłącz MFA)
 *      * /mfa/start (etap 2 przy logowaniu – wysyłka kodu na telefon)
 *      * /mfa/complete (wpisz kod → tworzymy sesję refresh + access cookie)
 *
 *  Wymagania:
 *  - Prisma models:
 *      model User { ... phone String? @unique, phoneVerifiedAt DateTime?, mfaEnabled Boolean ... }
 *      model SmsCode { id, userId, phone, code, purpose, attempts, usedAt, expiresAt, createdAt }
 *      model Session { id, userId, createdAt, expiresAt }
 *  - middleware/requireAuth.ts musi eksportować:
 *      setAuthCookie, setRefreshCookie, clearAuthCookie, clearAllAuthCookies,
 *      requireAuth, getValidRefreshPayload, signAccessToken, signRefreshToken,
 *      AuthedRequest
 *  - middleware/rateLimits.ts musi eksportować m.in.:
 *      rlLogin, rlRegister, rlVerifyEmail, rlForgot, rlReset, rlResendCode,
 *      rlSmsStart, rlSmsVerify, rlMfaStart, rlMfaComplete
 *
 *  Emulacja SMS:
 *  - Wysyłka kodu SMS jest zrobiona "na sucho": console.log(...) + e-mail
 *  - Po podpięciu operatora (SMSAPI/Twilio) – zamień blok "EMULACJA" na wywołanie SDK.
 *
 * ============================================================================
 */

import { Router, type Request, type Response } from "express";
import { prisma } from "../lib/prisma";
import bcrypt from "bcrypt";
import jwt, { type Secret } from "jsonwebtoken";
import crypto from "crypto";
import { addMinutes } from "date-fns";
import { sendMail } from "../lib/mailer";
import {
  // Access + Refresh cookies
  setAuthCookie,
  setRefreshCookie,
  clearAuthCookie,
  clearAllAuthCookies,
  // auth
  requireAuth,
  // Refresh helpers
  getValidRefreshPayload,
  // signer helpers (opcjonalnie, ale zostawiamy do debug)
  signAccessToken,
  signRefreshToken,
  // typing
  type AuthedRequest,
} from "../middleware/requireAuth";

// Per-route rate limits (upewnij się, że plik rateLimits.ts to eksportuje)
import {
  rlLogin,
  rlRegister,
  rlVerifyEmail,
  rlForgot,
  rlReset,
  rlResendCode,
  // 2FA / SMS / MFA
  rlSmsStart,
  rlSmsVerify,
  rlMfaStart,
  rlMfaComplete,
} from "../middleware/rateLimits";

/* ----------------------------------------------------------------------------
 *  Konfiguracja / stałe
 * --------------------------------------------------------------------------*/

const CART_COOKIE = "cartId";
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 dni (ms)
};

// W "me" używamy verify bezpośrednio – to nie jest signer do refresh
const JWT_SECRET: Secret = (process.env.JWT_SECRET || "dev-secret-change-me").trim();

// Brute-force login
const LOGIN_FAIL_LIMIT = 5;
const LOGIN_BLOCK_MINUTES = 10; // minut

// Walidacja
function isEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}
function isStrongPassword(v: string) {
  return typeof v === "string" && v.length >= 6;
}
function isE164(phone: string) {
  // Proste E.164: + i 7..15 cyfr (możesz doprecyzować)
  return /^\+[1-9]\d{6,14}$/.test(phone);
}

// 6-cyfrowy kod
function makeCode6() {
  return `${Math.floor(Math.random() * 1_000_000)}`.padStart(6, "0");
}

// Ile minut ważny jest kod 2FA
const MFA_CODE_MINUTES = 10;

// Ile błędnych prób SMS code zanim zablokujemy rekord (usedAt)
const SMS_CODE_FAIL_LIMIT = 5;

export const auth: Router = Router();

/* ----------------------------------------------------------------------------
 *  Pomocnicze: scalanie koszyków (guest -> user)
 * --------------------------------------------------------------------------*/
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

/* ----------------------------------------------------------------------------
 *  Pomocnicze: utworzenie/odświeżenie sesji refresh i ustawienie cookies
 * --------------------------------------------------------------------------*/
// pomocnicze na górze pliku już masz: import crypto from "crypto";

async function createSessionAndSetCookies(res: Response, userId: string, tokenVersion: number) {
  const thirtyDays = 1000 * 60 * 60 * 24 * 30;

  // ⬇️ NOWE: generujemy losowy token sesji (wymagany przez Twój model Prisma)
  const sessionToken = crypto.randomBytes(32).toString("hex");

  const session = await prisma.session.create({
    data: {
      userId,
      token: sessionToken,                                // ⬅️ DODANE
      expiresAt: new Date(Date.now() + thirtyDays),
    },
    select: { id: true, token: true, expiresAt: true },
  });

  // Access + Refresh cookies (zostawiamy SID = session.id jak wcześniej)
  setAuthCookie(res, { sub: userId, v: tokenVersion });
  setRefreshCookie(res, { sub: userId, v: tokenVersion, sid: session.id });
}


/* ----------------------------------------------------------------------------
 *  REGISTER
 * --------------------------------------------------------------------------*/
/**
 * POST /api/auth/register
 * body: { email, password, name? }
 *
 * - tworzy użytkownika (jeśli nie istnieje) w stanie niezweryfikowanym
 * - wysyła 6-cyfrowy kod weryfikacyjny na e-mail
 * - NIE loguje automatycznie – dopiero po verify-email robimy sesję
 */
auth.post("/register", rlRegister, async (req: Request, res: Response) => {
  try {
    let { email, password, name } = (req.body || {}) as {
      email?: string;
      password?: string;
      name?: string;
    };

    if (!email || !password) {
      return res.status(400).json({ error: "Email i hasło są wymagane." });
    }

    const normalized = email.trim().toLowerCase();
    if (!isEmail(normalized)) {
      return res.status(400).json({ error: "Podaj poprawny adres e-mail." });
    }
    if (!isStrongPassword(password)) {
      return res.status(400).json({ error: "Hasło musi mieć min. 6 znaków." });
    }

    const exists = await prisma.user.findUnique({ where: { email: normalized } });

    // a) Istnieje i zweryfikowany
    if (exists && exists.verifiedAt) {
      return res.status(409).json({ error: "Użytkownik z takim mailem już istnieje." });
    }

    // b) Istnieje i NIEzweryfikowany -> nadpisz hasło + wyślij nowy kod
    if (exists && !exists.verifiedAt) {
      const newHash = await bcrypt.hash(password, 10);
      await prisma.user.update({
        where: { id: exists.id },
        data: { password: newHash, name: name ?? exists.name ?? null },
      });

      await prisma.emailVerificationCode.deleteMany({
        where: { email: normalized, usedAt: null },
      });

      const code = makeCode6();
      const expiresAt = addMinutes(new Date(), 15);

      await prisma.emailVerificationCode.create({
        data: { email: normalized, code, expiresAt },
      });

      try {
        await sendMail(
          normalized,
          "Twój kod weryfikacyjny – Gift Store",
          `<p>Cześć${exists.name ? ` ${exists.name}` : ""}!</p>
           <p>Twój kod weryfikacyjny to:</p>
           <p style="font-size:20px; letter-spacing:3px;"><b>${code}</b></p>
           <p>Kod ważny przez 15 minut.</p>`
        );
      } catch (mailErr) {
        console.warn("[auth/register][resend] mail error:", mailErr);
      }

      return res.json({
        ok: true,
        needVerification: true,
        message: "Konto oczekuje na weryfikację. Wysłaliśmy nowy kod na e-mail.",
      });
    }

    // c) Nie istnieje → utwórz + wyślij kod
    const hash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email: normalized,
        password: hash,
        name: name ?? null,
        verifiedAt: null,
      },
      select: { id: true, email: true, name: true, verifiedAt: true, role: true },
    });

    // Koszyk
    let userCart = await prisma.cart.findFirst({ where: { userId: user.id } });
    if (!userCart) {
      userCart = await prisma.cart.create({ data: { userId: user.id } });
    }
    const guestCartId = req.cookies?.[CART_COOKIE] as string | undefined;
    if (guestCartId) await mergeCarts(userCart.id, guestCartId);
    res.cookie(CART_COOKIE, userCart.id, COOKIE_OPTS);

    // Kod e-mail (6 cyfr)
    const code = makeCode6();
    const expiresAt = addMinutes(new Date(), 15);

    await prisma.emailVerificationCode.create({
      data: { email: user.email, code, expiresAt },
    });

    try {
      await sendMail(
        user.email,
        "Twój kod weryfikacyjny – Gift Store",
        `<p>Cześć${user.name ? ` ${user.name}` : ""}!</p>
         <p>Twój kod weryfikacyjny to:</p>
         <p style="font-size:20px; letter-spacing:3px;"><b>${code}</b></p>
         <p>Kod ważny 15 minut.</p>`
      );
    } catch (mailErr) {
      console.warn("[auth/register] mail error:", mailErr);
    }

    return res.status(201).json({
      ok: true,
      needVerification: true,
      message: "Utworzono konto. Sprawdź e-mail i wpisz kod weryfikacyjny.",
    });
  } catch (e) {
    console.error("[auth/register] error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

/* ----------------------------------------------------------------------------
 *  VERIFY EMAIL
 * --------------------------------------------------------------------------*/
/**
 * POST /api/auth/verify-email
 * body: { email, code }
 *
 * Po udanej weryfikacji:
 *  - ustawiamy verifiedAt
 *  - oznaczamy kod jako użyty
 *  - (NOWOŚĆ) automatyczny login: tworzymy refresh session + access cookie
 */
auth.post("/verify-email", rlVerifyEmail, async (req: Request, res: Response) => {
  try {
    const { email, code } = (req.body || {}) as { email?: string; code?: string };
    if (!email || !code) return res.status(400).json({ error: "email i code są wymagane" });

    const normalized = email.trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email: normalized } });
    if (!user) return res.status(404).json({ error: "Użytkownik nie istnieje" });

    const active = await prisma.emailVerificationCode.findFirst({
      where: { email: normalized, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    if (!active) return res.status(400).json({ error: "Kod nieprawidłowy lub wygasł" });

    if (active.code !== code) {
      const nextAttempts = (active.attempts ?? 0) + 1;
      if (nextAttempts >= 5) {
        await prisma.emailVerificationCode.update({
          where: { id: active.id },
          data: { attempts: nextAttempts, usedAt: new Date() },
        });
        return res.status(400).json({ error: "Kod zablokowany po 5 błędnych próbach. Poproś o nowy." });
      }
      await prisma.emailVerificationCode.update({
        where: { id: active.id },
        data: { attempts: nextAttempts },
      });
      const left = 5 - nextAttempts;
      return res.status(400).json({ error: `Nieprawidłowy kod. Pozostało prób: ${left}.` });
    }

    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { verifiedAt: new Date() } }),
      prisma.emailVerificationCode.update({ where: { id: active.id }, data: { usedAt: new Date() } }),
    ]);

    // tokenVersion (możesz użyć "as any" jeśli TS nie zna pola)
    const tokenVersion: number = ((user as any)?.tokenVersion as number | undefined) ?? 0;

    // Auto-login po weryfikacji: utwórz refresh session + access cookie
    await createSessionAndSetCookies(res, user.id, tokenVersion);

    const shaped = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: (user as any).role ?? "USER",
    };
    return res.json({ ok: true, user: shaped });
  } catch (e) {
    console.error("[auth/verify-email] error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

/* ----------------------------------------------------------------------------
 *  LOGIN (z MFA gate + refresh session)
 * --------------------------------------------------------------------------*/
/**
 * POST /api/auth/login
 * body: { email, password }
 *
 * - brute-force (liczniki + blokada)
 * - jeśli user.mfaEnabled -> NIE wystawiamy tokenów, zwracamy { mfaRequired: true }
 * - w przeciwnym wypadku: tworzymy refresh session + access cookie
 */
auth.post("/login", rlLogin, async (req: Request, res: Response) => {
  try {
    let { email, password } = (req.body || {}) as { email?: string; password?: string };

    if (!email || !password) {
      return res.status(400).json({ error: "Email i hasło są wymagane." });
    }

    const normalized = email.trim().toLowerCase();
    if (!isEmail(normalized)) {
      return res.status(400).json({ error: "Podaj poprawny adres e-mail." });
    }

    const user = await prisma.user.findUnique({ where: { email: normalized } });
    if (!user || !user.password) {
      return res.status(401).json({ error: "Nieprawidłowe dane logowania." });
    }

    // Brute-force: blokada
    if (user.loginBlockedUntil && user.loginBlockedUntil > new Date()) {
      const ms = user.loginBlockedUntil.getTime() - Date.now();
      const mins = Math.max(1, Math.ceil(ms / 60000));
      return res.status(429).json({ error: `Konto zablokowane. Spróbuj za ${mins} min.` });
    }

    if (!user.verifiedAt) {
      return res.status(403).json({ error: "Konto niezweryfikowane. Sprawdź e-mail z kodem." });
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      const fails = (user.loginFailCount ?? 0) + 1;
      const updates: { loginFailCount: number; loginBlockedUntil?: Date | null } = { loginFailCount: fails };
      if (fails >= LOGIN_FAIL_LIMIT) {
        updates.loginBlockedUntil = new Date(Date.now() + LOGIN_BLOCK_MINUTES * 60 * 1000);
      }
      await prisma.user.update({ where: { id: user.id }, data: updates });
      return res.status(401).json({ error: "Nieprawidłowe dane logowania." });
    }

    // Sukces → wyzeruj licznik i blokadę
    if ((user.loginFailCount ?? 0) > 0 || user.loginBlockedUntil) {
      await prisma.user.update({
        where: { id: user.id },
        data: { loginFailCount: 0, loginBlockedUntil: null },
      });
    }

    // Koszyk
    let userCart = await prisma.cart.findFirst({ where: { userId: user.id } });
    if (!userCart) userCart = await prisma.cart.create({ data: { userId: user.id } });

    const guestCartId = req.cookies?.[CART_COOKIE] as string | undefined;
    if (guestCartId) await mergeCarts(userCart.id, guestCartId);

    res.cookie(CART_COOKIE, userCart.id, COOKIE_OPTS);

    // MFA gate
    const needMfa = !!(user as any).mfaEnabled;
    if (needMfa) {
      return res.json({
        mfaRequired: true,
        user: { id: user.id, email: user.email, name: user.name, role: (user as any).role ?? "USER" },
      });
    }

    // Bez MFA: sesja refresh + access
    const tokenVersion: number = ((user as any)?.tokenVersion as number | undefined) ?? 0;
    await createSessionAndSetCookies(res, user.id, tokenVersion);

    return res.json({
      user: { id: user.id, email: user.email, name: user.name, role: (user as any).role ?? "USER" },
    });
  } catch (e) {
    console.error("[auth/login] error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

/* ----------------------------------------------------------------------------
 *  REFRESH – nowy access token (i opcjonalnie rotacja refresh)
 * --------------------------------------------------------------------------*/
/**
 * POST /api/auth/refresh
 * - czyta refresh cookie
 * - waliduje sesję w DB i tokenVersion
 * - wydaje nowy access cookie
 * - odświeża (przedłuża) sesję refresh
 */
auth.post("/refresh", async (req: Request, res: Response) => {
  try {
    const payload = getValidRefreshPayload(req);
    if (!payload) return res.status(401).json({ error: "Unauthorized" });

    const session = await prisma.session.findUnique({ where: { id: payload.sid } });
    if (!session || session.expiresAt < new Date()) {
      return res.status(401).json({ error: "Session expired" });
    }

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.tokenVersion !== payload.v) {
      return res.status(401).json({ error: "Token revoked" });
    }

    // Rotacja / przedłużenie refresh session (zostawiamy ten sam SID, tylko nowe expiresAt)
    const thirtyDays = 1000 * 60 * 60 * 24 * 30;
    const updated = await prisma.session.update({
      where: { id: session.id },
      data: { expiresAt: new Date(Date.now() + thirtyDays) },
      select: { id: true },
    });

    setAuthCookie(res, { sub: user.id, v: user.tokenVersion });
    // (opcjonalnie) można też ustawić refresh ponownie – zachowamy ten sam SID
    setRefreshCookie(res, { sub: user.id, v: user.tokenVersion, sid: updated.id });

    return res.json({ ok: true });
  } catch (e) {
    console.error("[auth/refresh] error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

/* ----------------------------------------------------------------------------
 *  ME – miękki 200 gdy brak sesji
 * --------------------------------------------------------------------------*/
/**
 * GET /api/auth/me
 * - Zwraca { user, authenticated } bez 401 gdy brak tokenu.
 * - Do ME używamy access cookie (krótkie), ale frontend może go odświeżać z /refresh.
 */
auth.get("/me", async (req: Request, res: Response) => {
  const token = req.cookies?.token as string | undefined;

  if (!token) {
    return res.json({ user: null, authenticated: false });
  }

  try {
    // Krótki access token – weryfikujemy
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string };
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, name: true, role: true },
    });

    if (!user) {
      return res.json({ user: null, authenticated: false });
    }

    return res.json({ user, authenticated: true });
  } catch {
    // Token nieprawidłowy / wygasły (typowe) → nie rzucamy 401
    return res.json({ user: null, authenticated: false });
  }
});

/* ----------------------------------------------------------------------------
 *  FORGOT (email) – generuje link resetu hasła
 * --------------------------------------------------------------------------*/
auth.post("/forgot", rlForgot, async (req: Request, res: Response) => {
  const { email } = (req.body || {}) as { email?: string };
  if (!email) return res.status(400).json({ error: "Email required" });

  const normalized = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalized } });

  // Zawsze 200 – nie ujawniamy, czy mail istnieje
  if (!user) return res.json({ ok: true });

  const token = crypto.randomBytes(24).toString("hex");
  const expiresAt = addMinutes(new Date(), 30);

  await prisma.passwordResetToken.create({
    data: { token, userId: user.id, expiresAt },
  });

  const siteURL = process.env.SITE_URL || "http://localhost:3000";
  const link = `${siteURL}/reset?token=${token}`;

  try {
    await sendMail(
      user.email,
      "Reset hasła – Gift Store",
      `<p>Poproszono o reset hasła.</p>
       <p>Kliknij link (ważny 30 min): <a href="${link}">${link}</a></p>`
    );
  } catch (mailErr) {
    console.warn("[auth/forgot] mail error:", mailErr);
  }

  res.json({ ok: true });
});

/* ----------------------------------------------------------------------------
 *  RESET (email) – zmiana hasła po tokenie
 * --------------------------------------------------------------------------*/
auth.post("/reset", rlReset, async (req: Request, res: Response) => {
  const { token, password } = (req.body || {}) as { token?: string; password?: string };
  if (!token || !password) {
    return res.status(400).json({ error: "token and password required" });
  }
  if (!isStrongPassword(password)) {
    return res.status(400).json({ error: "Hasło musi mieć min. 6 znaków." });
  }

  const rec = await prisma.passwordResetToken.findUnique({ where: { token } });
  if (!rec || rec.usedAt || rec.expiresAt < new Date()) {
    return res.status(400).json({ error: "Invalid or expired token" });
  }

  const hash = await bcrypt.hash(password, 10);
  await prisma.user.update({ where: { id: rec.userId }, data: { password: hash } });

  await prisma.passwordResetToken.update({ where: { token }, data: { usedAt: new Date() } });

  res.json({ ok: true });
});

/* ----------------------------------------------------------------------------
 *  PROFILE (GET/PUT)
 * --------------------------------------------------------------------------*/
auth.get("/profile", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId!;
    const tokenV = (req as any).__tokenVersion ?? 0;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        phone: true,
        phoneVerifiedAt: true,
        mfaEnabled: true,
      },
    });
    if (!user) return res.status(404).json({ error: "User not found" });

    // Zweryfikuj wersję tokenu (logout-all)
    const vRec = await (prisma as any).user.findUnique({
      where: { id: userId },
      select: { tokenVersion: true },
    });
    const dbV: number = (vRec?.tokenVersion as number | undefined) ?? 0;

    if (dbV !== tokenV) {
      clearAuthCookie(res); // tylko access – refresh i tak unieważniamy osobno
      return res.status(401).json({ error: "Unauthorized" });
    }

    return res.json({ user });
  } catch (e) {
    console.error("[auth/profile][GET] error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

auth.put("/profile", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId!;
    let { name } = (req.body || {}) as { name?: string | null };
    name = (name ?? "").trim();

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { name: name || null },
      select: { id: true, email: true, name: true, role: true, phone: true, phoneVerifiedAt: true, mfaEnabled: true },
    });

    return res.json({ user: updated });
  } catch (e) {
    console.error("[auth/profile][PUT] error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

/* ----------------------------------------------------------------------------
 *  CHANGE PASSWORD (zalogowany)
 * --------------------------------------------------------------------------*/
auth.post("/change-password", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId!;
    const { currentPassword, newPassword } = (req.body || {}) as {
      currentPassword?: string;
      newPassword?: string;
    };

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: "Nowe hasło musi mieć min. 6 znaków." });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, password: true },
    });
    if (!user) return res.status(404).json({ error: "User not found" });

    if (user.password) {
      if (!currentPassword) {
        return res.status(400).json({ error: "Podaj obecne hasło." });
      }
      const ok = await bcrypt.compare(currentPassword, user.password);
      if (!ok) return res.status(400).json({ error: "Obecne hasło jest nieprawidłowe." });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id: user.id }, data: { password: hash } });

    return res.json({ ok: true });
  } catch (e) {
    console.error("[auth/change-password] error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

/* ----------------------------------------------------------------------------
 *  RESEND EMAIL CODE
 * --------------------------------------------------------------------------*/
auth.post("/resend-code", rlResendCode, async (req, res) => {
  try {
    const { email } = (req.body || {}) as { email?: string };
    if (!email) return res.status(400).json({ error: "Email required" });

    const normalized = email.trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email: normalized } });
    if (!user) return res.json({ ok: true });
    if (user.verifiedAt) return res.json({ ok: true });

    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
    const recent = await prisma.emailVerificationCode.findFirst({
      where: { email: normalized, createdAt: { gt: oneMinuteAgo }, usedAt: null },
      orderBy: { createdAt: "desc" },
    });
    if (recent) {
      return res.status(429).json({ error: "Poczekaj chwilę, zanim wyślesz ponownie kod." });
    }

    await prisma.emailVerificationCode.deleteMany({ where: { email: normalized, usedAt: null } });

    const code = makeCode6();
    const expiresAt = addMinutes(new Date(), 15);

    await prisma.emailVerificationCode.create({ data: { email: normalized, code, expiresAt } });

    try {
      await sendMail(
        normalized,
        "Twój kod weryfikacyjny – Gift Store",
        `<p>Nowy kod weryfikacyjny:</p>
         <p style="font-size:20px; letter-spacing:3px;"><b>${code}</b></p>
         <p>Kod ważny 15 minut.</p>`
      );
    } catch (e) {
      console.warn("[auth/resend-code] mail error:", e);
    }

    return res.json({ ok: true, message: "Nowy kod został wysłany." });
  } catch (e) {
    console.error("[auth/resend-code] error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

/* ----------------------------------------------------------------------------
 *  DEBUG COOKIES (diagnostyka)
 * --------------------------------------------------------------------------*/
auth.get("/debug-cookies", (req: Request, res: Response) => {
  const SITE_URL = process.env.SITE_URL || "http://localhost:3000";
  const receivedOrigin = req.headers["origin"] ?? null;

  res.json({
    siteUrl: SITE_URL,
    tokenCookie: req.cookies?.token ? "present" : "missing",
    refreshCookie: req.cookies?.refresh ? "present" : "missing",
    cartCookie: req.cookies?.[CART_COOKIE] ? "present" : "missing",
    receivedOrigin,
  });
});

/* ----------------------------------------------------------------------------
 *  LOGOUT (bieżąca przeglądarka)
 * --------------------------------------------------------------------------*/
auth.post("/logout", async (req: Request, res: Response) => {
  try {
    // Jeżeli mamy refresh – usuń sesję w DB
    const payload = getValidRefreshPayload(req);
    if (payload) {
      await prisma.session.deleteMany({ where: { id: payload.sid, userId: payload.sub } });
    }
  } catch (e) {
    // nie krzyczymy – i tak czyścimy cookies
  }

  clearAllAuthCookies(res); // czyści access + refresh
  // nie kasujemy cartId (gość może dalej mieć koszyk)
  return res.json({ ok: true });
});

/* ----------------------------------------------------------------------------
 *  LOGOUT-ALL (unieważnia wszystko)
 * --------------------------------------------------------------------------*/
auth.post("/logout-all", requireAuth, async (req, res) => {
  try {
    const userId = (req as AuthedRequest).userId!;
    await prisma.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } });
    await prisma.session.deleteMany({ where: { userId } }); // usuń wszystkie sesje refresh
    clearAllAuthCookies(res);
    return res.json({ ok: true });
  } catch (e) {
    console.error("[auth/logout-all] error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

/* =============================================================================
 *  2FA / SMS  —  Verify phone + Enable/Disable MFA + MFA login flow
 * =============================================================================
 *
 *  Endpoints:
 *   - POST /api/auth/2fa/phone/start   { phone }   (wymaga zalogowania)
 *   - POST /api/auth/2fa/phone/verify  { code }    (wymaga zalogowania)
 *   - POST /api/auth/2fa/enable                     (wymaga zalogowania)
 *   - POST /api/auth/2fa/disable                    (wymaga zalogowania)
 *   - POST /api/auth/mfa/start        { email }     (gdy login zwrócił mfaRequired)
 *   - POST /api/auth/mfa/complete     { ticket, code }
 *
 *  Implementacja kodów:
 *   - tabela SmsCode (purpose: "verify_phone" lub "mfa_login")
 *   - każdorazowo generujemy 6-cyfrowy kod, expiry ~10 min, attempts++ przy błędach
 *   - po 5 błędnych próbach blokujemy rekord (usedAt = now) – trzeba wygenerować nowy
 *
 *  EMULACJA:
 *   - kod SMS logujemy do console.log
 *   - wysyłamy e-mail do usera jako "fallback" / test
 *   - W produkcji zamień na operatora (SMSAPI/Twilio).
 * =============================================================================
 */

/* -------------------------------------------
 *  /2fa/phone/start — zainicjuj weryfikację numeru
 * -------------------------------------------*/
auth.post("/2fa/phone/start", requireAuth, rlSmsStart, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId!;
    const { phone } = (req.body || {}) as { phone?: string };
    if (!phone || !isE164(phone)) {
      return res.status(400).json({ error: "Podaj numer telefonu w formacie E.164, np. +48111222333." });
    }

    // Sprawdź, czy numer nie jest już zajęty przez innego użytkownika (UNIQUE constraint)
    const taken = await prisma.user.findFirst({
      where: { phone, id: { not: userId } },
      select: { id: true },
    });
    if (taken) {
      return res.status(409).json({ error: "Ten numer jest już przypisany do innego konta." });
    }

    // Throttle: jeżeli niedawno już tworzyliśmy kod verify_phone
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
    const recent = await prisma.smsCode.findFirst({
      where: {
        userId,
        purpose: "verify_phone",
        createdAt: { gt: oneMinuteAgo },
        usedAt: null,
      },
      orderBy: { createdAt: "desc" },
    });
    if (recent) {
      return res.status(429).json({ error: "Poczekaj chwilę przed ponownym wysłaniem kodu." });
    }

    // Usuń stare nieużyte verify_phone
    await prisma.smsCode.deleteMany({
      where: { userId, purpose: "verify_phone", usedAt: null },
    });

    const code = makeCode6();
    const expiresAt = addMinutes(new Date(), MFA_CODE_MINUTES);

    const rec = await prisma.smsCode.create({
      data: { userId, phone, code, purpose: "verify_phone", expiresAt },
      select: { id: true, phone: true },
    });

    // EMULACJA: "wysyłka" SMS
    console.log(`[SMS-EMU][verify_phone] user=${userId} phone=${rec.phone} code=${code}`);
    try {
      // fallback e-mail (dla testów)
      const me = await prisma.user.findUnique({ where: { id: userId } });
      if (me) {
        await sendMail(
          me.email,
          "Weryfikacja numeru telefonu – kod 2FA",
          `<p>Twój kod do weryfikacji telefonu (${rec.phone}) to:</p>
           <p style="font-size:20px; letter-spacing:3px;"><b>${code}</b></p>
           <p>Kod ważny ${MFA_CODE_MINUTES} minut.</p>`
        );
      }
    } catch (e) {
      console.warn("[2fa/phone/start] mail emulation error:", e);
    }

    return res.json({ ok: true, message: "Kod SMS wysłany na podany numer." });
  } catch (e) {
    console.error("[2fa/phone/start] error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

/* -------------------------------------------
 *  /2fa/phone/verify — potwierdź numer kodem
 * -------------------------------------------*/
auth.post("/2fa/phone/verify", requireAuth, rlSmsVerify, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId!;
    const { code } = (req.body || {}) as { code?: string };
    if (!code) return res.status(400).json({ error: "Podaj kod z SMS." });

    // Najnowszy aktywny (nieużyty i niewygasły) kod verify_phone
    const rec = await prisma.smsCode.findFirst({
      where: { userId, purpose: "verify_phone", usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    if (!rec) return res.status(400).json({ error: "Kod nieprawidłowy lub wygasł." });

    if (rec.code !== code) {
      const nextAtt = (rec.attempts ?? 0) + 1;
      if (nextAtt >= SMS_CODE_FAIL_LIMIT) {
        await prisma.smsCode.update({
          where: { id: rec.id },
          data: { attempts: nextAtt, usedAt: new Date() }, // blokada
        });
        return res.status(400).json({ error: "Kod zablokowany. Wygeneruj nowy." });
      }
      await prisma.smsCode.update({ where: { id: rec.id }, data: { attempts: nextAtt } });
      const left = SMS_CODE_FAIL_LIMIT - nextAtt;
      return res.status(400).json({ error: `Nieprawidłowy kod. Pozostało prób: ${left}.` });
    }

    // OK
    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { phone: rec.phone, phoneVerifiedAt: new Date() },
      }),
      prisma.smsCode.update({ where: { id: rec.id }, data: { usedAt: new Date() } }),
    ]);

    return res.json({ ok: true, message: "Numer telefonu został zweryfikowany." });
  } catch (e) {
    console.error("[2fa/phone/verify] error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

/* -------------------------------------------
 *  /2fa/enable — włącz MFA (wymaga zweryfikowanego numeru)
 * -------------------------------------------*/
auth.post("/2fa/enable", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId!;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { phone: true, phoneVerifiedAt: true, mfaEnabled: true },
    });
    if (!user) return res.status(404).json({ error: "User not found" });

    if (!user.phone || !user.phoneVerifiedAt) {
      return res.status(400).json({ error: "Najpierw zweryfikuj numer telefonu." });
    }

    if (user.mfaEnabled) {
      return res.json({ ok: true, message: "MFA już było włączone." });
    }

    await prisma.user.update({ where: { id: userId }, data: { mfaEnabled: true } });
    return res.json({ ok: true, message: "Włączono MFA (SMS)." });
  } catch (e) {
    console.error("[2fa/enable] error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

/* -------------------------------------------
 *  /2fa/disable — wyłącz MFA
 * -------------------------------------------*/
auth.post("/2fa/disable", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId!;
    await prisma.user.update({ where: { id: userId }, data: { mfaEnabled: false } });
    return res.json({ ok: true, message: "Wyłączono MFA." });
  } catch (e) {
    console.error("[2fa/disable] error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

/* -------------------------------------------
 *  /mfa/start — 2 etap logowania (po mfaRequired: true z /login)
 * -------------------------------------------*/
auth.post("/mfa/start", rlMfaStart, async (req: Request, res: Response) => {
  try {
    const { email } = (req.body || {}) as { email?: string };
    if (!email) return res.status(400).json({ error: "Email required" });

    const normalized = email.trim().toLowerCase();
    const user = await prisma.user.findUnique({
      where: { email: normalized },
      select: { id: true, mfaEnabled: true, phone: true, phoneVerifiedAt: true, name: true },
    });
    if (!user) {
      // Nie zdradzamy czy user istnieje – ale tu i tak mfa/start wywołujemy po loginie
      return res.status(200).json({ ok: true, ticket: crypto.randomBytes(8).toString("hex") });
    }

    if (!user.mfaEnabled || !user.phone || !user.phoneVerifiedAt) {
      // Nie można wystartować MFA – brak telefonu
      return res.status(400).json({ error: "MFA nie jest skonfigurowane dla tego konta." });
    }

    // Throttle: 1/min dla MFA
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
    const recent = await prisma.smsCode.findFirst({
      where: {
        userId: user.id,
        purpose: "mfa_login",
        createdAt: { gt: oneMinuteAgo },
        usedAt: null,
      },
      orderBy: { createdAt: "desc" },
    });
    if (recent) {
      return res.status(429).json({ error: "Poczekaj chwilę przed ponownym wysłaniem kodu." });
    }

    // Usuń stare mfa_login nieużyte
    await prisma.smsCode.deleteMany({
      where: { userId: user.id, purpose: "mfa_login", usedAt: null },
    });

    const code = makeCode6();
    const expiresAt = addMinutes(new Date(), MFA_CODE_MINUTES);

    const rec = await prisma.smsCode.create({
      data: {
        userId: user.id,
        phone: user.phone,
        code,
        purpose: "mfa_login",
        expiresAt,
      },
      select: { id: true, phone: true },
    });

    // EMULACJA: SMS + e-mail
    console.log(`[SMS-EMU][mfa_login] user=${user.id} phone=${rec.phone} code=${code}`);
    try {
      await sendMail(
        normalized,
        "Kod logowania (MFA) – Gift Store",
        `<p>Cześć${user.name ? ` ${user.name}` : ""}!</p>
         <p>Twój kod do logowania (MFA) to:</p>
         <p style="font-size:20px; letter-spacing:3px;"><b>${code}</b></p>
         <p>Kod ważny ${MFA_CODE_MINUTES} minut.</p>`
      );
    } catch (e) {
      console.warn("[mfa/start] mail emulation error:", e);
    }

    // Ticket = id rekordu SmsCode (wystarczające, bo i tak wymagamy kodu)
    return res.json({ ok: true, ticket: rec.id });
  } catch (e) {
    console.error("[mfa/start] error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

/* -------------------------------------------
 *  /mfa/complete — dokończ logowanie (SMS code)
 * -------------------------------------------*/
auth.post("/mfa/complete", rlMfaComplete, async (req: Request, res: Response) => {
  try {
    const { ticket, code } = (req.body || {}) as { ticket?: string; code?: string };
    if (!ticket || !code) return res.status(400).json({ error: "ticket i code są wymagane." });

    const rec = await prisma.smsCode.findUnique({
      where: { id: ticket },
      select: { id: true, userId: true, purpose: true, code: true, attempts: true, usedAt: true, expiresAt: true },
    });
    if (!rec || rec.purpose !== "mfa_login" || rec.usedAt || rec.expiresAt < new Date()) {
      return res.status(400).json({ error: "Kod nieprawidłowy lub wygasł." });
    }

    if (rec.code !== code) {
      const nextAtt = (rec.attempts ?? 0) + 1;
      if (nextAtt >= SMS_CODE_FAIL_LIMIT) {
        await prisma.smsCode.update({ where: { id: rec.id }, data: { attempts: nextAtt, usedAt: new Date() } });
        return res.status(400).json({ error: "Kod zablokowany. Uruchom MFA ponownie." });
      }
      await prisma.smsCode.update({ where: { id: rec.id }, data: { attempts: nextAtt } });
      const left = SMS_CODE_FAIL_LIMIT - nextAtt;
      return res.status(400).json({ error: `Nieprawidłowy kod. Pozostało prób: ${left}.` });
    }

    // Kod poprawny → kończymy logowanie
    const user = await prisma.user.findUnique({ where: { id: rec.userId } });
    if (!user) return res.status(404).json({ error: "User not found" });

    // Oznacz kod jako użyty (ważne!)
    await prisma.smsCode.update({ where: { id: rec.id }, data: { usedAt: new Date() } });

    // Stwórz koszyk jeśli brak – na wszelki wypadek przy logowaniu
    let userCart = await prisma.cart.findFirst({ where: { userId: user.id } });
    if (!userCart) userCart = await prisma.cart.create({ data: { userId: user.id } });

    res.cookie(CART_COOKIE, userCart.id, COOKIE_OPTS);

    // Sesja refresh + access
    const tokenVersion: number = ((user as any)?.tokenVersion as number | undefined) ?? 0;
    await createSessionAndSetCookies(res, user.id, tokenVersion);

    return res.json({ ok: true });
  } catch (e) {
    console.error("[mfa/complete] error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

export default auth;
