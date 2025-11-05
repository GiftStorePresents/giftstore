import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const data: Array<{ productSlug: string; category: string }> = [
  { productSlug: "zestaw-prezentowy-rose", category: "dla-niej" },
  { productSlug: "kubek-z-nadrukiem", category: "dla-niego" },
];

function slugify(s: string) {
  return s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

async function main() {
  for (const row of data) {
    const catSlug = slugify(row.category);
    const category = await prisma.category.upsert({
      where: { slug: catSlug },
      create: { name: row.category, slug: catSlug },
      update: {},
    });

    await prisma.product.update({
      where: { slug: row.productSlug },
      data: { category: { connect: { id: category.id } } },
    });
  }
}

main().then(() => prisma.$disconnect());
