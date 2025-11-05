// api/src/lib/audit.ts
/*import type { Request } from "express";
import { prisma } from "./prisma";
import type { Prisma } from "@prisma/client";

function asJson(v: unknown): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
  if (v === undefined) return undefined;
  if (v === null) return Prisma.JsonNull;
  try { JSON.stringify(v); return v as Prisma.InputJsonValue; }
  catch { return String(v) as unknown as Prisma.InputJsonValue; }
}

export async function audit(
  req: Request,
  params: {
    action: string;
    entityType: "User" | "Product" | "Variant" | "Order" | "Category" | "Coupon" | "Media" | "Blog" | "Hero" | "Setting";
    entityId: string;
    before?: unknown;
    after?: unknown;
    meta?: unknown;
  }
) {
  try {
    const actorId = (req as any)?.user?.id as string | undefined;
    await prisma.adminAction.create({
      data: {
        actorId: actorId || "system",
        action: params.action,
        entityType: params.entityType as any,
        entityId: String(params.entityId),
        before: asJson(params.before),
        after:  asJson(params.after),
        meta:   asJson(params.meta),
      },
    });
  } catch (e) {
    console.warn("[audit] log failed:", (e as any)?.message || e);
  }
}
*/