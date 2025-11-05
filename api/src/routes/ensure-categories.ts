import { prisma } from "../lib/prisma";

const desired = [
  { slug: "dla-niej",     name: "Dla niej" },
  { slug: "dla-niego",    name: "Dla niego" },
  { slug: "dla-dzieci",   name: "Dla dzieci" },
  { slug: "bestsellery",  name: "Bestsellery" },
  // dorzuć własne:
  // { slug: "urodziny",     name: "Urodziny" },
  // { slug: "swieta",       name: "Święta" },
  // { slug: "dom-i-wnetrze",name: "Dom i wnętrze" },
];

async function main() {
  let created = 0, updated = 0;
  for (const c of desired) {
    const existing = await prisma.category.findUnique({ where: { slug: c.slug } });
    if (!existing) {
      await prisma.category.create({ data: { slug: c.slug, name: c.name } });
      created++;
    } else if (existing.name !== c.name) {
      await prisma.category.update({ where: { slug: c.slug }, data: { name: c.name } });
      updated++;
    }
  }

  const all = await prisma.category.findMany({
    select: { id: true, slug: true, name: true, _count: { select: { products: true } } },
    orderBy: { name: "asc" },
  });

  console.log({ created, updated, total: all.length, categories: all });
}

main().finally(() => prisma.$disconnect());
