// prisma/seed.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function upsertCoupon(code: string, data: any) {
  await prisma.coupon.upsert({
    where: { code },
    update: { ...data },
    create: { code, ...data },
  });
}

async function main() {
  console.log("Seeding coupons…");

  // Prosty kupon 10% – bez dat i limitów (łatwy do wczytania przez panel)
  await upsertCoupon("ALL10", {
    active: true,
    type: "PERCENT",
    percentage: 10,
    validFrom: null,
    validTo: null,
    usageLimit: null,
    perUserLimit: null,
    minOrder: null,
    usedCount: 0,
  });

  // 10% z konkretną datą startu (format new Date("...") -> czytelny dla parsera w panelu)
  await upsertCoupon("GIFT10", {
    active: true,
    type: "PERCENT",
    percentage: 10,
    validFrom: new Date("2024-01-01T00:00:00.000Z"),
    validTo: null,
    usageLimit: null,
    perUserLimit: null,
    minOrder: null,
    usedCount: 0,
  });

  // Alternatywny kod 10% – bez dat
  await upsertCoupon("PROMO10", {
    active: true,
    type: "PERCENT",
    percentage: 10,
    validFrom: null,
    validTo: null,
    usageLimit: null,
    perUserLimit: null,
    minOrder: null,
    usedCount: 0,
  });

  // „Darmowa wysyłka” jako rabat kwotowy 15,00 zł od min. 200,00 zł koszyka
  await upsertCoupon("FREESHIP", {
    active: true,
    type: "FIXED",
    amount: 1500,      // 15,00 zł (w groszach)
    minOrder: 20000,   // 200,00 zł (w groszach)
    validFrom: null,
    validTo: null,
    usageLimit: null,
    perUserLimit: null,
    usedCount: 0,
  });

  // Kupon powitalny 5,00 zł – z globalnym limitem i limitem na użytkownika
  await upsertCoupon("WELCOME5", {
    active: true,
    type: "FIXED",
    amount: 500,        // 5,00 zł (w groszach)
    usageLimit: 1000,   // maks. 1000 użyć globalnie
    perUserLimit: 1,    // raz na użytkownika
    validFrom: null,
    validTo: null,
    minOrder: null,
    usedCount: 0,
  });

  console.log("✅ Coupons seeded.");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
