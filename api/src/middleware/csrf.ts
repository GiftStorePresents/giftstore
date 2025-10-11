// src/middleware/csrf.ts
import type { Request, Response, NextFunction, RequestHandler } from "express";
import crypto from "crypto";

export const CSRF_COOKIE = "csrf";
export const CSRF_HEADER = "x-csrf-token";

// wygeneruj 32-bajtowy token (hex => 64 znaki)
function makeToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function isValidToken(token: unknown): token is string {
  return typeof token === "string" && /^[a-f0-9]{64}$/i.test(token);
}

// ustaw cookie (NIE httpOnly – client musi je odczytać i odesłać w headerze)
function setCsrfCookie(res: Response, value?: string) {
  const token = value && isValidToken(value) ? value : makeToken();
  res.cookie(CSRF_COOKIE, token, {
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 1000 * 60 * 60 * 12, // 12h
    httpOnly: false,
  });
}

// Ustaw token jeśli brak lub niepoprawny – dla wszystkich GET/HEAD/OPTIONS
export const ensureCsrfCookie: RequestHandler = (req, res, next) => {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    const cookieToken = req.cookies?.[CSRF_COOKIE];
    if (!isValidToken(cookieToken)) {
      setCsrfCookie(res);
    }
  }
  return next();
};

// Weryfikuj token dla metod modyfikujących (POST/PUT/PATCH/DELETE itp.)
export const requireCsrf: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  const method = req.method.toUpperCase();
  // bezpieczne metody nie wymagają nagłówka
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return next();
  }

  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.header(CSRF_HEADER); // nagłówki są case-insensitive

  if (!isValidToken(cookieToken) || !isValidToken(headerToken) || cookieToken !== headerToken) {
    return res.status(403).json({ error: "CSRF token invalid" });
  }
  return next();
};
