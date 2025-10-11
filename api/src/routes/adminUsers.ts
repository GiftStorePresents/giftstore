import { Router, type Request, type Response, type Router as RouterType } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/roles";
import { logAdminAction } from "../lib/adminLog";

// tu dodajemy typ:
export const adminUsers: RouterType = Router();


// GET /api/admin/users?query=&role=&verified=&page=1&limit=20
adminUsers.get("/users", requireAuth, requireRole("ADMIN"), async (req: Request, res: Response) => {
  const query = (req.query.query as string | undefined)?.trim() || "";
  const role = (req.query.role as string | undefined)?.trim() || "";
  const verified = (req.query.verified as string | undefined)?.trim() || "";
  const page = Math.max(1, parseInt((req.query.page as string) || "1", 10));
  const limit = Math.max(1, Math.min(100, parseInt((req.query.limit as string) || "20", 10)));
  const skip = (page - 1) * limit;

  const where: any = {};
  if (query) where.OR = [
    { email: { contains: query, mode: "insensitive" } },
    { name: { contains: query, mode: "insensitive" } },
  ];
  if (role === "ADMIN" || role === "USER") where.role = role;
  if (verified === "true") where.verifiedAt = { not: null };
  if (verified === "false") where.verifiedAt = null;

  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      select: {
        id: true, email: true, name: true, role: true,
        verifiedAt: true, disabledAt: true, createdAt: true,
      },
    }),
    prisma.user.count({ where }),
  ]);

  res.json({ items, total, page, pages: Math.ceil(total / limit) });
});

// POST /api/admin/set-role { userId, role }
adminUsers.post("/set-role", requireAuth, requireRole("ADMIN"), async (req: Request, res: Response) => {
  const { userId, role } = (req.body || {}) as { userId?: string; role?: "USER" | "ADMIN" };
  if (!userId || (role !== "USER" && role !== "ADMIN")) {
    return res.status(400).json({ error: "userId and role required" });
  }
  const before = await prisma.user.findUnique({ where: { id: userId }, select: { role: true }});
  if (!before) return res.status(404).json({ error: "User not found" });

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { role },
    select: { id: true, email: true, name: true, role: true },
  });

  await logAdminAction({
    actorId: (req as any).userId,
    action: "USER_SET_ROLE",
    entityType: "User",
    entityId: userId,
    before,
    after: { role: updated.role },
  });

  res.json({ ok: true, user: updated });
});

// POST /api/admin/soft-ban { userId, disabled: boolean }
adminUsers.post("/soft-ban", requireAuth, requireRole("ADMIN"), async (req: Request, res: Response) => {
  const { userId, disabled } = (req.body || {}) as { userId?: string; disabled?: boolean };
  if (!userId || typeof disabled !== "boolean") {
    return res.status(400).json({ error: "userId and disabled required" });
  }
  const before = await prisma.user.findUnique({ where: { id: userId }, select: { disabledAt: true }});
  if (!before) return res.status(404).json({ error: "User not found" });

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { disabledAt: disabled ? new Date() : null, tokenVersion: { increment: 1 } },
    select: { id: true },
  });

  await logAdminAction({
    actorId: (req as any).userId,
    action: disabled ? "USER_SOFT_BAN" : "USER_SOFT_UNBAN",
    entityType: "User",
    entityId: userId,
    before,
    after: { disabledAt: disabled ? new Date() : null },
  });

  res.json({ ok: true });
});

// GET /api/admin/metrics
adminUsers.get("/metrics", requireAuth, requireRole("ADMIN"), async (_req: Request, res: Response) => {
  const [totalUsers, verifiedUsers, admins, banned] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { verifiedAt: { not: null } } }),
    prisma.user.count({ where: { role: "ADMIN" } }),
    prisma.user.count({ where: { disabledAt: { not: null } } }),
  ]);
  res.json({ totalUsers, verifiedUsers, admins, banned });
});

// GET /api/admin/logs?page&limit
adminUsers.get("/logs", requireAuth, requireRole("ADMIN"), async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt((req.query.page as string) || "1", 10));
  const limit = Math.max(1, Math.min(100, parseInt((req.query.limit as string) || "20", 10)));
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    prisma.adminAction.findMany({
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: { actor: { select: { id: true, email: true } } },
    }),
    prisma.adminAction.count(),
  ]);

  res.json({ items, total, page, pages: Math.ceil(total / limit) });
});

export default adminUsers;
