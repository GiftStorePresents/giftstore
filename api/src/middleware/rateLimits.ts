// src/middleware/rateLimits.ts
import rateLimit from "express-rate-limit";

/**
 * Osobne limitery dla wrażliwych końcówek.
 * Pamięciowy store (MemoryStore) – OK na dev/pilot.
 * W produkcji rozważ np. RedisStore.
 */

function secs(n: number) { return n * 1000; } // zostawione na przyszłość
function mins(n: number) { return n * 60 * 1000; }

// --- Auth klasyczny / e-mail ---
export const rlLogin = rateLimit({
  windowMs: mins(10),
  max: 20, // 20 prób / 10 minut per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Za dużo prób logowania, spróbuj później." },
});

export const rlRegister = rateLimit({
  windowMs: mins(10),
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Za dużo rejestracji, spróbuj później." },
});

export const rlVerifyEmail = rateLimit({
  windowMs: mins(10),
  max: 50, // weryfikacja kodu może „klikać” częściej
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Za dużo prób weryfikacji, spróbuj później." },
});

export const rlForgot = rateLimit({
  windowMs: mins(10),
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Za dużo próśb o reset hasła, spróbuj później." },
});

export const rlReset = rateLimit({
  windowMs: mins(10),
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Za dużo prób resetu, spróbuj później." },
});

export const rlMagicStart = rateLimit({
  windowMs: mins(5),
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Za dużo linków magicznych, spróbuj później." },
});

export const rlResendCode = rateLimit({
  windowMs: mins(10),
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Za dużo wysyłek kodu, spróbuj później." },
});

// --- Zmiana e‑maila ---
export const rlEmailChangeStart = rateLimit({
  windowMs: mins(10),
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Za dużo prób zmiany e‑maila, spróbuj później." },
});

export const rlEmailChangeConfirm = rateLimit({
  windowMs: mins(10),
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Za dużo prób potwierdzania, spróbuj później." },
});

// --- 2FA / SMS ---
export const rlSmsStart = rateLimit({
  windowMs: mins(1),
  max: 10, // 10 wysyłek / minutę per IP (plus własne throttlingi po stronie DB)
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Za dużo wysyłek kodu SMS, spróbuj później." },
});

export const rlSmsVerify = rateLimit({
  windowMs: mins(10),
  max: 30, // więcej prób weryfikacji w oknie 10 min
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Za dużo prób weryfikacji SMS, spróbuj później." },
});

export const rlMfaStart = rateLimit({
  windowMs: mins(1),
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Za dużo żądań 2FA, spróbuj później." },
});

export const rlMfaComplete = rateLimit({
  windowMs: mins(10),
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Za dużo prób potwierdzenia 2FA, spróbuj później." },
});
