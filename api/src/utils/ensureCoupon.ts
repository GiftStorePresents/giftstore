// src/utils/ensureCoupon.ts
import type { PrismaClient, Prisma } from "@prisma/client";

export type RawCouponInput = {
  code?: unknown;
  type?: unknown;                // "PERCENT" | "FIXED"
  percentage?: unknown;          // 1..100
  amount?: unknown;              // grosze (number)
  amountZl?: unknown;            // zł (string/number) -> konwersja do groszy
  minOrder?: unknown;            // grosze
  minOrderZl?: unknown;          // zł -> grosze
  validFrom?: unknown;           // Date | ISO | ""
  validTo?: unknown;             // Date | ISO | ""
  usageLimit?: unknown;          // number | "" | undefined
  perUserLimit?: unknown;        // number | "" | undefined
  active?: unknown;              // boolean
};

const INT32_MAX = 2147483647; // 21_474_836,47 zł w groszach

function cleanCode(s: unknown): string {
  return String((s as any) ?? "").trim().toUpperCase();
}
function parseZlToCents(v: unknown): number | null {
  if (v === null || typeof v === "undefined" || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}
function toDateOrNull(x: unknown): Date | null {
  if (x === null || typeof x === "undefined" || x === "") return null;
  if (x instanceof Date) return Number.isNaN(x.getTime()) ? null : x;
  const d = new Date(String(x));
  return Number.isNaN(d.getTime()) ? null : d;
}
function toNull<T>(v: T | undefined): T | null {
  return typeof v === "undefined" ? null : (v as any);
}

export type NormalizedCouponData = Omit<
  Prisma.CouponCreateInput,
  "id" | "createdAt" | "updatedAt"
>;

export function normalizeCouponInput(raw: RawCouponInput): NormalizedCouponData {
  const code = cleanCode(raw.code);
  if (!code) throw new Error("code is required");

  const type = String(raw.type || "PERCENT").toUpperCase();

  const base: any = {
    code,
    type,
    active: typeof raw.active === "boolean" ? raw.active : true,
    validFrom: toDateOrNull(raw.validFrom),
    validTo: toDateOrNull(raw.validTo),
    usageLimit:
      raw.usageLimit === ""
        ? null
        : toNull(Number.isFinite(+(raw as any).usageLimit) ? +(raw as any).usageLimit : undefined),
    perUserLimit:
      raw.perUserLimit === ""
        ? null
        : toNull(
            Number.isFinite(+(raw as any).perUserLimit) ? +(raw as any).perUserLimit : undefined
          ),
    minOrder: toNull(
      typeof raw.minOrder !== "undefined"
        ? +(raw as any).minOrder
        : parseZlToCents(raw.minOrderZl)
    ),
  };

  // walidacje minOrder
  if (base.minOrder != null) {
    if (!Number.isFinite(base.minOrder) || base.minOrder < 0) {
      throw new Error("minOrder must be >= 0 (in cents)");
    }
    if (base.minOrder > INT32_MAX) throw new Error("minOrder too big");
  }

  if (type === "PERCENT") {
    const pct = Number((raw as any).percentage);
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
      throw new Error("percentage must be 1..100");
    }
    base.percentage = Math.round(pct);
    base.amount = null;
  } else if (type === "FIXED") {
    const centsMaybe =
      typeof (raw as any).amount !== "undefined"
        ? Number((raw as any).amount)
        : parseZlToCents(raw.amountZl);
    if (centsMaybe == null || !Number.isFinite(centsMaybe) || centsMaybe <= 0) {
      throw new Error("amount must be > 0 (in cents)");
    }
    const rounded = Math.round(centsMaybe);
    if (rounded > INT32_MAX) throw new Error("amount too big");
    base.amount = rounded;
    base.percentage = null;
  } else {
    throw new Error("type must be PERCENT or FIXED");
  }

  if (base.usageLimit != null && base.usageLimit > INT32_MAX) {
    throw new Error("usageLimit too big");
  }
  if (base.perUserLimit != null && base.perUserLimit > INT32_MAX) {
    throw new Error("perUserLimit too big");
  }

  return base as NormalizedCouponData;
}

/**
 * Ensure (create or update).
 * - Jeśli istnieje kupon z tym code → update (upsert=true)
 * - Jeśli upsert=false i istnieje → błąd
 */
export async function ensureCoupon(
  prisma: PrismaClient,
  raw: RawCouponInput,
  opts?: { upsert?: boolean }
) {
  const data = normalizeCouponInput(raw);
  const upsert = !!opts?.upsert;

  const existing = await prisma.coupon.findUnique({
    where: { code: data.code },
  });

  if (existing) {
    if (!upsert) {
      return { ok: false, updated: false, created: false, reason: "already exists", code: data.code };
    }
    const updated = await prisma.coupon.update({
      where: { code: data.code },
      data,
    });
    return { ok: true, updated: true, created: false, coupon: updated };
  } else {
    const created = await prisma.coupon.create({ data });
    return { ok: true, updated: false, created: true, coupon: created };
  }
}
