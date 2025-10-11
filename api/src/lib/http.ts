import type { Response } from "express";

export function fail(res: Response, status: number, message: string) {
  return res.status(status).json({ error: message });
}
export function ok<T extends object>(res: Response, payload: T, status = 200) {
  return res.status(status).json(payload);
}
