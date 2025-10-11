// scripts/seedSampleProducts.ts
import { prisma } from "../src/lib/prisma";

async function upsertProduct(
  slug: string,
  name: string,
  priceCents: number,
  opts?: {
    description?: string;
    brand?: string | null;
    category?: string;
    stock?: number;
  }
) {
  const description =
    opts?.description ?? `${name} — przykładowy opis produktu do seeda.`;
  const brand = opts?.brand ?? "Demo";
  const category = opts?.category ?? "demo";
  const stock = typeof opts?.stock === "number" ? opts!.stock : 10;

  let p = await prisma.product.findUnique({ where: { slug } as any });
  if (!p) {
    p = await prisma.product.create({
      data: {
        slug,
        name,
        description,
        brand,
        category,
        variants: {
          create: {
            sku: `${slug}-SKU`,
            priceCents,
            stock,
          },
        },
      },
      include: { variants: true, media: true },
    });
    console.log(`[seedSample] Utworzono: ${slug}`);
  } else {
    console.log(`[seedSample] Istnieje: ${slug}`);
  }
  return p;
}

async function main() {
  await upsertProduct("kubek-tata", "Kubek dla Taty", 3999, {
    description:
      "Kubek dla Taty — idealny prezent na Dzień Ojca lub urodziny.",
    brand: "GiftStore",
    category: "dla-taty",
    stock: 25,
  });

  await upsertProduct("tshirt-birthday-2025", "T-shirt Birthday 2025", 6999, {
    description:
      "Koszulka urodzinowa 2025 — wygodna, bawełniana, unisex.",
    brand: "GiftStore",
    category: "na-urodziny",
    stock: 30,
  });

  console.log("[seedSample] Gotowe ✔");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
