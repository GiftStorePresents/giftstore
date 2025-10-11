// src/routes/coupons.ts
import { Router } from "express";
import type { Request, Response, Router as ExpressRouter } from "express";
import { prisma } from "../lib/prisma";

const router: ExpressRouter = Router();

function cleanCode(s: unknown): string {
  return String((s as any) ?? "").trim().toUpperCase();
}

/**
 * POST /api/coupons/validate
 * Body: { code: string, cartTotal: number (grosze), userId?: string }
 */
router.post("/coupons/validate", async (req: Request, res: Response) => {
  const { code, cartTotal, userId } = (req.body || {}) as {
    code?: string;
    cartTotal?: number;
    userId?: string | null;
  };

  const codeNorm = cleanCode(code);
  if (!codeNorm || typeof cartTotal !== "number" || !Number.isFinite(cartTotal) || cartTotal < 0) {
    return res.status(400).json({ error: "bad input" });
  }

  const c = await prisma.coupon.findUnique({ where: { code: codeNorm } });
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

  return res.json({
    ok: true,
    discount,        // grosze
    code: c.code,
    type: c.type,
    percentage: c.percentage ?? null,
    amount: c.amount ?? null,
  });
});

export default router;
