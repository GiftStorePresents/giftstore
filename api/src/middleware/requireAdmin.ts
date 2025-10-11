// src/middleware/requireAdmin.ts
import { type Request, type Response, type NextFunction } from "express";
import { prisma } from "../lib/prisma";

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const tokenUser = (req as any).user as { id: string; role?: string } | undefined;

  if (!tokenUser) {
    return res.status(403).json({ error: "forbidden", reason: "not_logged_in" });
  }

  try {
    const dbUser = await prisma.user.findUnique({
      where: { id: tokenUser.id },
      select: { id: true, email: true, role: true, disabledAt: true },
    });

    if (!dbUser) {
      return res.status(403).json({ error: "forbidden", reason: "user_not_found" });
    }
    if (dbUser.disabledAt) {
      return res.status(403).json({ error: "forbidden", reason: "banned" });
    }
    if (dbUser.role !== "ADMIN") {
      return res.status(403).json({ error: "forbidden", reason: "not_admin", role: dbUser.role });
    }

    // podmień na świeże dane – na wszelki wypadek
    (req as any).user = { id: dbUser.id, role: dbUser.role };
    next();
  } catch (e) {
    next(e);
  }
}
