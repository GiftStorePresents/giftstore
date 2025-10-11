// src/routes/admin.ts
import { Router, type Request, type Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/roles";

const admin: Router = Router();

/**
 * GET /api/admin/ping
 */
admin.get("/ping", requireAuth, requireRole("ADMIN"), (_req: Request, res: Response) => {
  res.json({ ok: true, role: "ADMIN" });
});

/**
 * GET /api/admin/users?page=1&limit=20&query=foo
 * Prosta paginacja + filtr po email/name.
 */
admin.get("/users", requireAuth, requireRole("ADMIN"), async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "20"), 10) || 20));
  const q = (String(req.query.query ?? "") || "").trim();

  const where = q
    ? {
        OR: [
          { email: { contains: q, mode: "insensitive" as const } },
          { name: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : {};

  const [total, items] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: { id: true, email: true, name: true, role: true, createdAt: true, verifiedAt: true },
    }),
  ]);

  res.json({
    items,
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
  });
});

/**
 * POST /api/admin/set-role
 * body: { userId: string, role: "USER" | "ADMIN" }
 */
admin.post("/set-role", requireAuth, requireRole("ADMIN"), async (req: Request, res: Response) => {
  const { userId, role } = (req.body || {}) as { userId?: string; role?: "USER" | "ADMIN" };
  if (!userId || (role !== "USER" && role !== "ADMIN")) {
    return res.status(400).json({ error: "Podaj poprawne { userId, role }." });
  }
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { role },
    select: { id: true, email: true, name: true, role: true },
  });
  res.json({ ok: true, user: updated });
});

export default admin;
