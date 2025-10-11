// src/middleware/requireAuth.ts
import type { Request, Response, NextFunction, RequestHandler } from "express";
import jwt, { type Secret, type JwtPayload } from "jsonwebtoken";
import { prisma } from "../lib/prisma";

/**
 * Nazwy ciasteczek – access (krótki) i refresh (długi).
 * Zostawiamy kompatybilne `token` dla access (używane już w kodzie).
 */
const ACCESS_COOKIE = "token";
const REFRESH_COOKIE = "refresh";

/**
 * Sekrety + TTL-e (ustaw w .env – sensowne defaulty dla dev).
 */
const ACCESS_JWT_SECRET: Secret = (process.env.ACCESS_JWT_SECRET || process.env.JWT_SECRET || "dev-access-secret").trim();
const REFRESH_JWT_SECRET: Secret = (process.env.REFRESH_JWT_SECRET || "dev-refresh-secret").trim();

const ACCESS_JWT_EXPIRES: string | number =
  (process.env.ACCESS_JWT_EXPIRES || process.env.JWT_EXPIRES || "15m") as string | number; // krótkie życie
const REFRESH_JWT_EXPIRES: string | number =
  (process.env.REFRESH_JWT_EXPIRES || "30d") as string | number; // długie życie

/**
 * Payload, jaki wkładamy do tokenów.
 * - sub: user.id
 * - v:   user.tokenVersion (do „logout-all”)
 * - sid: identyfikator rekordu Session (tylko w refresh)
 */
export type AccessPayload = { sub: string; v: number };
export type RefreshPayload = { sub: string; v: number; sid: string };

/**
 * Request wzbogacony przez requireAuth.
 */
export type AuthedRequest = Request & {
  userId?: string;
  userRole?: "USER" | "ADMIN";
  __tokenVersion?: number;
};

/**
 * Opcje ciasteczek – dopasowane do local dev i produkcji (SameSite/Secure).
 */
export function getCookieOpts() {
  const siteUrl = (process.env.SITE_URL || "http://localhost:3000").toLowerCase();
  const isLocal = siteUrl.includes("localhost") || siteUrl.includes("127.0.0.1");

  const envSameSite = (process.env.COOKIE_SAMESITE || "").toLowerCase();
  const envSecureExplicit = (process.env.COOKIE_SECURE || "").toLowerCase() === "true";

  const sameSite: "lax" | "none" | "strict" =
    isLocal ? "lax" :
    envSameSite === "none" ? "none" :
    envSameSite === "strict" ? "strict" : "lax";

  const secure =
    isLocal
      ? false
      : envSecureExplicit ||
        (process.env.NODE_ENV === "production" && sameSite === "none");

  return {
    httpOnly: true as const,
    sameSite,
    secure,
    path: "/",
  };
}

/**
 * Access cookie: krótszy maxAge (dopasowany do ACCESS_JWT_EXPIRES).
 * Uwaga: samo `expiresIn` w JWT kontroluje ważność; cookie maxAge to „UX” (kiedy przeglądarka usuwa).
 */
function getAccessCookieOpts() {
  const base = getCookieOpts();
  // heurystycznie: jeżeli ACCESS_JWT_EXPIRES jest w minutach/godzinach – policz w ms (tu nie parsujemy, dajemy bufor 1d)
  // Najprościej: krótkie okno – np. 2h. I tak JWT wygaśnie wg exp.
  const maxMs = 1000 * 60 * 60 * 2;
  return { ...base, maxAge: maxMs };
}

/**
 * Refresh cookie: długie życie, httpOnly.
 */
function getRefreshCookieOpts() {
  const base = getCookieOpts();
  // 30 dni w ms (bezpieczny default)
  const maxMs = 1000 * 60 * 60 * 24 * 30;
  return { ...base, maxAge: maxMs };
}

/**
 * Zbiera access token z cookie lub z Authorization: Bearer.
 */
function extractAccessToken(req: Request): string | null {
  const cookieToken = (req as any).cookies?.[ACCESS_COOKIE] as string | undefined;
  if (cookieToken) return cookieToken;

  const auth = req.header("authorization");
  if (!auth) return null;
  const [scheme, value] = auth.split(" ");
  if (scheme?.toLowerCase() === "bearer" && value) return value;
  return null;
}

/**
 * Middleware: wymaga zalogowania – weryfikuje **access** JWT i dokleja:
 *  - req.userId   (z `sub`)
 *  - req.__tokenVersion (z `v`)
 *  - req.userRole (z DB)
 *
 * Dodatkowo: weryfikuje w DB soft-ban (disabledAt) i zgodność tokenVersion (logout-all).
 */
export const requireAuth: RequestHandler = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const token = extractAccessToken(req);
    if (!token) return res.status(401).json({ error: "Unauthorized" });

    const decoded = jwt.verify(token, ACCESS_JWT_SECRET) as JwtPayload | string;

    const sub = typeof decoded === "string" ? undefined : (decoded.sub as string | undefined);
    const v   = typeof decoded === "string" ? undefined : (decoded.v as number | undefined);

    if (!sub) return res.status(401).json({ error: "Unauthorized" });

    // Sprawdzenie użytkownika w DB (rola, soft-ban, wersja tokenu)
    const user = await prisma.user.findUnique({
      where: { id: sub },
      select: { id: true, role: true, disabledAt: true, tokenVersion: true },
    });
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    if (user.disabledAt) {
      clearAllAuthCookies(res);
      return res.status(403).json({ error: "Account disabled" });
    }

    if (typeof v === "number" && v !== user.tokenVersion) {
      clearAllAuthCookies(res);
      return res.status(401).json({ error: "Session expired" });
    }

    req.userId = sub;
    req.__tokenVersion = typeof v === "number" ? v : 0;
    req.userRole = user.role;

    return next();
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
};

/**
 * Wystaw **access** JWT w httpOnly cookie (`token`) – zgodne z dotychczasowym kodem.
 */
export function setAuthCookie(res: Response, payload: AccessPayload) {
  const token = jwt.sign(payload, ACCESS_JWT_SECRET, { expiresIn: ACCESS_JWT_EXPIRES as any });
  res.cookie(ACCESS_COOKIE, token, getAccessCookieOpts());
}

/**
 * Wystaw **refresh** JWT w httpOnly cookie (`refresh`).
 * payload powinien zawierać id rekordu Session (sid), sub oraz v.
 */
export function setRefreshCookie(res: Response, payload: RefreshPayload) {
  const token = jwt.sign(payload, REFRESH_JWT_SECRET, { expiresIn: REFRESH_JWT_EXPIRES as any });
  res.cookie(REFRESH_COOKIE, token, getRefreshCookieOpts());
}

/**
 * Czyści tylko access cookie (dotychczasowe zachowanie).
 */
export function clearAuthCookie(res: Response) {
  const opts = getAccessCookieOpts();
  res.clearCookie(ACCESS_COOKIE, { ...opts, maxAge: 0 });
}

/**
 * Czyści refresh cookie.
 */
export function clearRefreshCookie(res: Response) {
  const opts = getRefreshCookieOpts();
  res.clearCookie(REFRESH_COOKIE, { ...opts, maxAge: 0 });
}

/**
 * Czyści oba ciasteczka (przy pełnym wylogowaniu).
 */
export function clearAllAuthCookies(res: Response) {
  clearAuthCookie(res);
  clearRefreshCookie(res);
}

/**
 * Pobiera i weryfikuje refresh token z cookie `refresh`.
 * Zwraca payload (sub, v, sid) lub null, jeśli brak/błędny.
 *
 * Użyteczne w endpointzie /api/auth/refresh.
 */
export function getValidRefreshPayload(req: Request): (RefreshPayload & JwtPayload) | null {
  try {
    const token = (req as any).cookies?.[REFRESH_COOKIE] as string | undefined;
    if (!token) return null;
    const decoded = jwt.verify(token, REFRESH_JWT_SECRET) as JwtPayload;
    // Minimalna walidacja pól, które chcemy mieć w refresh:
    if (!decoded?.sub || typeof decoded.sub !== "string") return null;
    if (typeof decoded.v !== "number") return null;
    if (typeof decoded.sid !== "string") return null;
    return decoded as RefreshPayload & JwtPayload;
  } catch {
    return null;
  }
}

/**
 * Narzędzie do re-sign access tokenu z istniejącego payloadu (np. po refreshu).
 */
export function signAccessToken(payload: AccessPayload): string {
  return jwt.sign(payload, ACCESS_JWT_SECRET, { expiresIn: ACCESS_JWT_EXPIRES as any });
}

/**
 * Narzędzie do re-sign refresh tokenu (np. rotacja).
 */
export function signRefreshToken(payload: RefreshPayload): string {
  return jwt.sign(payload, REFRESH_JWT_SECRET, { expiresIn: REFRESH_JWT_EXPIRES as any });
}
