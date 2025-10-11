// src/routes/adminCoupons.ts
import { Router, type Request, type Response, type NextFunction } from "express";
import { prisma } from "../lib/prisma";
import type { Prisma } from "@prisma/client";
import { readPrismaSeedFile, resolveSeedCandidates } from "../utils/seedCoupons";

const router: Router = Router();

/* ==================== GUARD ==================== */
function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const role = (req as any)?.user?.role;
  if (role !== "ADMIN") return res.status(403).json({ error: "forbidden" });
  next();
}

/* ==================== PING (diagnostyka) ==================== */
router.get("/__ping", (_req, res) => res.json({ ok: true, who: "adminCoupons" }));

/* ==================== HELPERS ==================== */
const INT32_MAX = 2147483647; // 2^31-1 => 21_474_836,47 zł w groszach

function cleanCode(s: unknown): string {
  return String((s as any) ?? "").trim().toUpperCase();
}
function toNull<T>(v: T | undefined): T | null {
  return typeof v === "undefined" ? null : (v as any);
}
function parseZlToCents(v: unknown): number | null {
  if (v === null || typeof v === "undefined" || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}
function toDateOrNull(x: unknown): Date | null {
  if (x === null || typeof x === "undefined" || x === "") return null;
  const d = new Date(String(x));
  return Number.isNaN(d.getTime()) ? null : d;
}
function assertInt32Or400(res: Response, value: number | null, field: string): value is number {
  if (value == null) return false; // null OK (oznacza brak)
  if (!Number.isFinite(value)) {
    res.status(400).json({ error: `${field} must be a number` });
    return false;
  }
  if (value > INT32_MAX) {
    res.status(400).json({ error: `${field} too big (max 21,474,836.47 zł)` });
    return false;
  }
  if (value < 0) {
    res.status(400).json({ error: `${field} must be >= 0` });
    return false;
  }
  return true;
}
const whereByCode = (code: string): Prisma.CouponWhereUniqueInput => ({ code });

/* ==================== SEED FILE (PRZED :id) ==================== */
// GET /api/admin/coupons/seed-file
// Opcja diagnostyczna: ?debug=1 -> zwraca JSON z próbami i ścieżką
router.get("/coupons/seed-file", requireAdmin, async (req, res) => {
  const debug = String(req.query.debug || req.query.meta || "") === "1";
  const found = await readPrismaSeedFile();

  if (!found) {
    const tried = resolveSeedCandidates();
    console.warn(`[seed-file] NOT FOUND. Tried:\n${tried.join("\n")}`);
    const msg =
      "Nie znaleziono prisma/seed.(ts|js).\n" +
      "Sprawdzone ścieżki:\n" +
      tried.map((p) => ` - ${p}`).join("\n") +
      "\n\nUstaw pełną ścieżkę w ENV, np. (PowerShell):\n" +
      "$env:COUPONS_SEED_FILE='C:\\Users\\timek\\Desktop\\Gift Store\\giftstore-api\\prisma\\seed.ts'\n";
    if (debug) return res.status(404).json({ ok: false, error: "not_found", tried });
    return res.status(404).type("text/plain; charset=utf-8").send(msg);
  }

  console.log(`[seed-file] OK: ${found.path}`);
  if (debug) {
    return res.json({ ok: true, path: found.path, size: found.text.length, tried: found.tried });
  }
  res.setHeader("X-Seed-Path", found.path);
  res.setHeader("Cache-Control", "no-store");
  res.type("text/plain; charset=utf-8").send(found.text);
});

/* ==================== PREVIEW VALIDATE (PRZED :id) ==================== */
// POST /api/admin/coupons/preview-validate
router.post("/coupons/preview-validate", requireAdmin, async (req, res) => {
  const { code, cartTotal, userId } = (req.body || {}) as {
    code?: string;
    cartTotal?: number;
    userId?: string | null;
  };

  const codeNorm = cleanCode(code);
  if (!codeNorm || typeof cartTotal !== "number" || cartTotal < 0) {
    return res.status(400).json({ error: "bad input" });
  }

  const c = await prisma.coupon.findUnique({ where: whereByCode(codeNorm) });
  const now = new Date();

  if (!c || !c.active) return res.status(404).send("Kupon nieaktywny");
  if (c.validFrom && now < c.validFrom) return res.status(400).send("Kupon jeszcze nieaktywny");
  if (c.validTo && now > c.validTo) return res.status(400).send("Kupon wygasł");
  if (c.usageLimit && c.usedCount >= c.usageLimit) return res.status(400).send("Limit wykorzystań wyczerpany");
  if (c.minOrder && cartTotal < c.minOrder) return res.status(400).send("Za niski koszyk");

  if (c.perUserLimit && typeof userId === "string") {
    const cnt = await prisma.couponRedemption.count({ where: { couponId: c.id, userId } });
    if (cnt >= c.perUserLimit) return res.status(400).send("Limit na użytkownika wyczerpany");
  }

  let discount = 0;
  if (c.type === "PERCENT" && c.percentage) discount = Math.round(cartTotal * (c.percentage / 100));
  if (c.type === "FIXED" && c.amount) discount = c.amount;
  discount = Math.max(0, Math.min(discount, cartTotal));

  res.json({
    ok: true,
    discount,
    code: c.code,
    type: c.type,
    percentage: c.percentage ?? null,
    amount: c.amount ?? null,
  });
});

/* ==================== LIST ==================== */
// GET /api/admin/coupons?query=&active=&skip=&take=
router.get("/coupons", requireAdmin, async (req, res) => {
  const query = String((req.query as any)?.query || "").trim();
  const active = (req.query as any)?.active;
  const skip = Math.max(0, parseInt(String((req.query as any)?.skip || "0"), 10) || 0);
  const take = Math.min(100, Math.max(1, parseInt(String((req.query as any)?.take || "50"), 10) || 50));

  const where: any = {};
  if (query) {
    where.OR = [
      { code: { contains: query, mode: "insensitive" } },
      { type: { equals: query.toUpperCase() } },
    ];
  }
  if (typeof active !== "undefined") where.active = String(active) === "true";

  const [items, total] = await Promise.all([
    prisma.coupon.findMany({
      where,
      skip,
      take,
      orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }],
    }),
    prisma.coupon.count({ where }),
  ]);

  res.json({ items, total, skip, take });
});

/* ==================== READ ONE ==================== */
// GET /api/admin/coupons/:id
router.get("/coupons/:id", requireAdmin, async (req, res) => {
  const id = String(req.params.id);
  const c = await prisma.coupon.findUnique({ where: { id } });
  if (!c) return res.status(404).json({ error: "not found" });
  res.json(c);
});

/* ==================== CREATE ==================== */
// POST /api/admin/coupons
router.post("/coupons", requireAdmin, async (req, res) => {
  try {
    const {
      code,
      type,
      percentage,
      amount,
      amountZl,
      minOrder,
      minOrderZl,
      validFrom,
      validTo,
      usageLimit,
      perUserLimit,
      active,
    } = (req.body || {}) as any;

    const data: any = {
      code: cleanCode(code),
      type: String(type || "PERCENT").toUpperCase(),
      active: typeof active === "boolean" ? active : true,
      validFrom: toDateOrNull(validFrom),
      validTo: toDateOrNull(validTo),
      usageLimit: toNull(
        usageLimit === "" ? undefined : (Number.isFinite(+usageLimit) ? +usageLimit : undefined)
      ),
      perUserLimit: toNull(
        perUserLimit === "" ? undefined : (Number.isFinite(+perUserLimit) ? +perUserLimit : undefined)
      ),
      minOrder: toNull(typeof minOrder !== "undefined" ? +minOrder : parseZlToCents(minOrderZl)),
    };

    if (!data.code) return res.status(400).json({ error: "code is required" });
    if (assertInt32Or400(res, data.minOrder, "minOrder") === false && data.minOrder !== null) return;

    if (data.type === "PERCENT") {
      const pct = Number(percentage);
      if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
        return res.status(400).json({ error: "percentage must be 1..100" });
      }
      data.percentage = Math.round(pct);
      data.amount = null;
    } else if (data.type === "FIXED") {
      const centsMaybe = typeof amount !== "undefined" ? Number(amount) : parseZlToCents(amountZl);
      if (centsMaybe == null || !Number.isFinite(centsMaybe) || centsMaybe <= 0) {
        return res.status(400).json({ error: "amount must be > 0 (in cents)" });
      }
      const rounded = Math.round(centsMaybe);
      if (!assertInt32Or400(res, rounded, "amount")) return;
      data.amount = rounded;
      data.percentage = null;
    } else {
      return res.status(400).json({ error: "type must be PERCENT or FIXED" });
    }

    if (data.usageLimit != null && data.usageLimit > INT32_MAX)
      return res.status(400).json({ error: "usageLimit too big" });
    if (data.perUserLimit != null && data.perUserLimit > INT32_MAX)
      return res.status(400).json({ error: "perUserLimit too big" });

    const created = await prisma.coupon.create({ data });
    res.json({ ok: true, coupon: created });
  } catch (e: any) {
    if (String(e?.message || "").includes("Unique constraint")) {
      return res.status(409).json({ error: "CODE_ALREADY_EXISTS" });
    }
    return res.status(500).json({ error: e?.message || "create failed" });
  }
});

/* ==================== UPDATE ==================== */
// PATCH /api/admin/coupons/:id
router.patch("/coupons/:id", requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id);
    const existing = await prisma.coupon.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: "not found" });

    const {
      code,
      type,
      percentage,
      amount,
      amountZl,
      minOrder,
      minOrderZl,
      validFrom,
      validTo,
      usageLimit,
      perUserLimit,
      active,
      resetUsedCount,
    } = (req.body || {}) as any;

    const data: any = {};

    if (typeof code !== "undefined") {
      const codeNorm = cleanCode(code);
      if (!codeNorm) return res.status(400).json({ error: "code cannot be empty" });
      data.code = codeNorm;
    }
    if (typeof active !== "undefined") data.active = !!active;
    if (typeof validFrom !== "undefined") data.validFrom = toDateOrNull(validFrom);
    if (typeof validTo !== "undefined") data.validTo = toDateOrNull(validTo);

    if (typeof usageLimit !== "undefined")
      data.usageLimit = toNull(
        usageLimit === "" ? undefined : (Number.isFinite(+usageLimit) ? +usageLimit : undefined)
      );
    if (typeof perUserLimit !== "undefined")
      data.perUserLimit = toNull(
        perUserLimit === "" ? undefined : (Number.isFinite(+perUserLimit) ? +perUserLimit : undefined)
      );

    if (typeof minOrder !== "undefined" || typeof minOrderZl !== "undefined") {
      const cents = typeof minOrder !== "undefined" ? Number(minOrder) : parseZlToCents(minOrderZl);
      data.minOrder = toNull(cents);
      if (assertInt32Or400(res, data.minOrder, "minOrder") === false && data.minOrder !== null) return;
    }

    if (typeof type !== "undefined") {
      data.type = String(type).toUpperCase();
      if (data.type === "PERCENT") data.amount = null;
      if (data.type === "FIXED") data.percentage = null;
    }

    if ((data.type || existing.type) === "PERCENT" && typeof percentage !== "undefined") {
      const pct = Number(percentage);
      if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
        return res.status(400).json({ error: "percentage must be 1..100" });
      }
      data.percentage = Math.round(pct);
      data.amount = null;
    }

    if (
      (data.type || existing.type) === "FIXED" &&
      (typeof amount !== "undefined" || typeof amountZl !== "undefined")
    ) {
      const centsMaybe = typeof amount !== "undefined" ? Number(amount) : parseZlToCents(amountZl);
      if (centsMaybe == null || !Number.isFinite(centsMaybe) || centsMaybe <= 0) {
        return res.status(400).json({ error: "amount must be > 0 (in cents)" });
      }
      const rounded = Math.round(centsMaybe);
      if (!assertInt32Or400(res, rounded, "amount")) return;
      data.amount = rounded;
      data.percentage = null;
    }

    if (resetUsedCount === true) data.usedCount = 0;

    if (data.usageLimit != null && data.usageLimit > INT32_MAX)
      return res.status(400).json({ error: "usageLimit too big" });
    if (data.perUserLimit != null && data.perUserLimit > INT32_MAX)
      return res.status(400).json({ error: "perUserLimit too big" });

    const updated = await prisma.coupon.update({ where: { id }, data });
    res.json({ ok: true, coupon: updated });
  } catch (e: any) {
    if (String(e?.message || "").includes("Unique constraint")) {
      return res.status(409).json({ error: "CODE_ALREADY_EXISTS" });
    }
    return res.status(500).json({ error: e?.message || "update failed" });
  }
});

/* ==================== DELETE ==================== */
// DELETE /api/admin/coupons/:id
router.delete("/coupons/:id", requireAdmin, async (_req, res) => {
  try {
    const id = String((_req.params as any).id);
    await prisma.coupon.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "delete failed" });
  }
});

/* ==================== TOGGLE ==================== */
// POST /api/admin/coupons/:id/toggle
router.post("/coupons/:id/toggle", requireAdmin, async (req, res) => {
  const id = String(req.params.id);
  const c = await prisma.coupon.findUnique({ where: { id } });
  if (!c) return res.status(404).json({ error: "not found" });
  const updated = await prisma.coupon.update({
    where: { id },
    data: { active: !c.active },
  });
  res.json({ ok: true, coupon: updated });
});

/* ==================== BULK IMPORT ==================== */
// POST /api/admin/coupons/import  { items: [...], upsert: boolean }
router.post("/coupons/import", requireAdmin, async (req, res) => {
  const items = (req.body?.items || []) as any[];
  const upsert = !!req.body?.upsert;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "no items" });
  }

  let imported = 0;
  let updated = 0;
  const errors: Array<{ code?: string; error: string }> = [];

  for (const raw of items) {
    try {
      const codeNorm = cleanCode((raw as any)?.code);
      if (!codeNorm) throw new Error("code is required");

      const type = String((raw as any)?.type || "PERCENT").toUpperCase();

      const data: any = {
        code: codeNorm,
        type,
        active: typeof (raw as any)?.active === "boolean" ? (raw as any).active : true,
        validFrom: toDateOrNull((raw as any)?.validFrom),
        validTo: toDateOrNull((raw as any)?.validTo),
        usageLimit: toNull(
          (raw as any)?.usageLimit === ""
            ? undefined
            : (Number.isFinite(+(raw as any)?.usageLimit) ? +(raw as any)?.usageLimit : undefined)
        ),
        perUserLimit: toNull(
          (raw as any)?.perUserLimit === ""
            ? undefined
            : (Number.isFinite(+(raw as any)?.perUserLimit) ? +(raw as any)?.perUserLimit : undefined)
        ),
        minOrder: toNull(
          typeof (raw as any)?.minOrder !== "undefined"
            ? +(raw as any)?.minOrder
            : parseZlToCents((raw as any)?.minOrderZl)
        ),
      };

      if (data.minOrder != null && data.minOrder > INT32_MAX) throw new Error("minOrder too big");

      if (type === "PERCENT") {
        const pct = Number((raw as any)?.percentage);
        if (!Number.isFinite(pct) || pct <= 0 || pct > 100) throw new Error("percentage must be 1..100");
        data.percentage = Math.round(pct);
        data.amount = null;
      } else if (type === "FIXED") {
        const centsMaybe =
          typeof (raw as any)?.amount !== "undefined"
            ? Number((raw as any)?.amount)
            : parseZlToCents((raw as any)?.amountZl);
        if (centsMaybe == null || !Number.isFinite(centsMaybe) || centsMaybe <= 0) {
          throw new Error("amount must be > 0 (in cents)");
        }
        const rounded = Math.round(centsMaybe);
        if (rounded > INT32_MAX) throw new Error("amount too big");
        data.amount = rounded;
        data.percentage = null;
      } else {
        throw new Error("invalid type");
      }

      const existing = await prisma.coupon.findUnique({ where: whereByCode(codeNorm) });
      if (existing) {
        if (!upsert) {
          errors.push({ code: codeNorm, error: "already exists" });
          continue;
        }
        await prisma.coupon.update({ where: whereByCode(codeNorm), data: { ...data, code: codeNorm } });
        updated++;
      } else {
        await prisma.coupon.create({ data });
        imported++;
      }
    } catch (e: any) {
      errors.push({ code: cleanCode((raw as any)?.code), error: e?.message || "failed" });
    }
  }

  res.json({ ok: true, imported, updated, total: items.length, errors });
});

export default router;
