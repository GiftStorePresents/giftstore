// src/middleware/rateLimitSimple.ts
import type { RequestHandler } from "express";

type Key = string;
type Bucket = { count: number; resetAt: number };
const store = new Map<Key, Bucket>();

export function rateLimitByKey({
  windowMs,
  limit,
  keyFn,
}: {
  windowMs: number;
  limit: number;
  keyFn: (req: any) => string | null;
}): RequestHandler {
  return (req, res, next) => {
    const key = keyFn(req);
    if (!key) return next();
    const now = Date.now();

    const bucket = store.get(key);
    if (!bucket || bucket.resetAt < now) {
      store.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    if (bucket.count >= limit) {
      const secs = Math.ceil((bucket.resetAt - now) / 1000);
      return res.status(429).json({ error: `Too many requests. Try again in ~${secs}s.` });
    }
    bucket.count++;
    return next();
  };
}
