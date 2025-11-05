// api/src/lib/adminLog.ts
import { Router, type Request, type Response } from "express";
import { prisma } from "../lib/prisma";
import { Prisma } from "@prisma/client";

/* ────────────────────────────────────────────────────────────────────────────
   LOG WRITER (helper do zapisywania zdarzeń admina)
   ──────────────────────────────────────────────────────────────────────────── */

export type LogInput = {
  actorId: string; // wymagany
  action: string;
  entityType: "User" | "Product" | "Variant";
  entityId: string;
  before?: unknown;
  after?: unknown;
  meta?: unknown;
};

/** Zwraca wartość akceptowaną przez pola JSON w Prisma:
 *  - undefined  → pole pomijane
 *  - null       → JSON-owy null (Prisma.JsonNull), nie DB NULL
 *  - obiekt     → przechodzi (awaryjnie zrzucane do stringa, jeśli nie-serializowalne)
 */
function asJsonOrNull(
  v: unknown
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
  if (v === undefined) return undefined;
  if (v === null) return Prisma.JsonNull;
  try {
    JSON.stringify(v);
  } catch {
    // np. cyclical structure — zapisz jako string, by nie wysadzić akcji biznesowej
    return String(v) as unknown as Prisma.InputJsonValue;
  }
  return v as Prisma.InputJsonValue;
}

/** Publiczny helper do logowania działań admina z dowolnego miejsca backendu. */
export async function logAdminAction(input: LogInput) {
  try {
    const data: Prisma.AdminActionUncheckedCreateInput = {
      actorId: String(input.actorId),
      action: String(input.action || "").trim(),
      entityType: String(input.entityType), // w modelu to prawdopodobnie TEXT/ENUM
      entityId: String(input.entityId),
      before: asJsonOrNull(input.before),
      after: asJsonOrNull(input.after),
      meta: asJsonOrNull(input.meta),
    };

    if (!data.action) return; // nie zapisuj pustych akcji

    await prisma.adminAction.create({ data });
  } catch (e) {
    // Logger nie może zabić akcji biznesowej
    console.warn("[adminLog] failed:", e);
  }
}

/* ────────────────────────────────────────────────────────────────────────────
   ADMIN LOGS ROUTER (GET /api/admin/logs)
   ──────────────────────────────────────────────────────────────────────────── */

type EntityType = "User" | "Product" | "Variant" | "";

function toInt(val: unknown, def: number): number {
  const n = parseInt(String(val ?? ""), 10);
  return Number.isFinite(n) ? n : def;
}
function toStr(val: unknown): string {
  return String(val ?? "").trim();
}

/** Router z listą logów (paginacja + filtry). */
export const adminLogRouter: Router = Router();

/**
 * GET /api/admin/logs
 * Query:
 *   page?: number (1..)
 *   limit?: number (10..100)
 *   q?: string               – szuka w action, entityId, actor.email
 *   entityType?: "User" | "Product" | "Variant"
 *   action?: string
 */
adminLogRouter.get("/logs", async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, toInt(req.query.page, 1));
    const limitRaw = toInt(req.query.limit, 25);
    const limit = Math.min(100, Math.max(10, limitRaw));

    const q = toStr(req.query.q);
    const entityType = toStr(req.query.entityType) as EntityType;
    const action = toStr(req.query.action);

    const where: Prisma.AdminActionWhereInput = {};

    if (entityType) where.entityType = entityType as Exclude<EntityType, "">;
    if (action) where.action = { contains: action, mode: "insensitive" };

    if (q) {
      where.OR = [
        { action: { contains: q, mode: "insensitive" } },
        { entityId: { contains: q, mode: "insensitive" } },
        // relacja do użytkownika (aktor)
        { actor: { email: { contains: q, mode: "insensitive" } } },
      ];
    }

    const [total, items] = await Promise.all([
      prisma.adminAction.count({ where }),
      prisma.adminAction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: { actor: { select: { id: true, email: true } } },
      }),
    ]);

    const pages = Math.max(1, Math.ceil(total / limit));
    res.json({ items, total, page, pages });
  } catch (e: any) {
    console.error("[adminLog] list failed:", e);
    res.status(500).send(e?.message || "Internal Server Error");
  }
});

/** Eksport domyślny — aby działał `import adminLogRouter from "./lib/adminLog"` */
export default adminLogRouter;
