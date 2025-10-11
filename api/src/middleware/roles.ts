// src/middleware/roles.ts
import type { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";
import { AuthedRequest } from "./requireAuth";

/**
 * Użycie: router.get("/admin/stats", requireAuth, requireRole("ADMIN"), handler)
 */
export function requireRole(role: "ADMIN" | "USER") {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = (req as AuthedRequest).userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (!user) return res.status(401).json({ error: "Unauthorized" });
    if (user.role !== role) return res.status(403).json({ error: "Forbidden" });

    return next();
  };
}
