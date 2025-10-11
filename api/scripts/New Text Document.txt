import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

/**
 * Użycie:
 *  pnpm tsx scripts/ensureCoupon.ts ALL10 percent 10
 *  pnpm tsx scripts/ensureCoupon.ts ALL15 fixed 15
 *    - ALL10/ALL15  → kod kuponu
 *    - percent/fixed → typ
 *    - ostatni arg   → % dla percent lub kwota w zł dla fixed
 */
async function main() {
  const CODE = (process.argv[2] || "ALL10").toUpperCase();
  const KIND = (process.argv[3] || "percent").toLowerCase(); // "percent" | "fixed"
  const VALUE = Number(process.argv[4] ?? (KIND === "fixed" ? 15 : 10)); // zł lub %

  const isPercent = KIND === "percent";
  const amountCents = Math.round(VALUE * 100);

  await prisma.coupon.upsert({
    where: { code: CODE },
    update: {
      active: true,
      type: isPercent ? "PERCENT" : "FIXED",
      percentage: isPercent ? VALUE : null,
      amount: isPercent ? null : amountCents,

      // „bez końca i dla wszystkich”
      validFrom: null,
      validTo: null,
      usageLimit: null,
      perUserLimit: null,
      minOrder: null,
    },
    create: {
      code: CODE,
      active: true,
      type: isPercent ? "PERCENT" : "FIXED",
      percentage: isPercent ? VALUE : null,
      amount: isPercent ? null : amountCents,
      usedCount: 0,
    },
  });

  console.log(
    `✅ Kupon ${CODE} ustawiony: ${isPercent ? `${VALUE}%` : `${VALUE.toFixed(2)} zł`} — bez limitów, bez daty, aktywny dla wszystkich.`
  );
}

main().finally(() => prisma.$disconnect());
