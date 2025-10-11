// scripts/printSlugs.ts
import { prisma } from "../src/lib/prisma";

async function main() {
  const products = await prisma.product.findMany({
    select: { id: true, slug: true, name: true },
    orderBy: { createdAt: "desc" },
  });
  if (products.length === 0) {
    console.log("[printSlugs] Brak produktów w bazie.");
    return;
  }
  console.log(`[printSlugs] Slugi (${products.length}):`);
  for (const p of products) {
    console.log(`- ${p.slug}   (${p.name})`);
  }
}

main().finally(() => prisma.$disconnect());
