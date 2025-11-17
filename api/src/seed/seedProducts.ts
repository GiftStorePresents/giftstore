/// <reference types="node" />
import { PrismaClient, MediaType, Prisma } from "@prisma/client";

// 🔴 ZMIEŃ TYLKO TĘ ŚCIEŻKĘ jeśli Twój plik z danymi leży gdzie indziej:
//   przykład alternatyw:
//   "../../shared/productsGiftsData"
//   "../../../web/src/shared/productsGiftsData"
import productsGiftsData from "./popularGiftsData";

const prisma = new PrismaClient();

type SeedItem = {
  slug: string;
  name: string;
  description?: string | null;
  brand?: string | null;
  featured?: boolean;
  sku?: string | null;
  priceCents?: number | null;
  stock?: number | null;
  personalize?: boolean | null;
  imageUrl?: string | null;
  category?: string | null; // slug kategorii (opcjonalnie)
};

function fallbackSku(slug: string) {
  return (
    (slug || "ITEM")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 20) + "-SKU"
  );
}

async function ensureCategoryBySlug(slug?: string | null) {
  const s = String(slug || "").trim().toLowerCase();
  if (!s) return null;
  const cat = await prisma.category.upsert({
    where: { slug: s },
    update: {},
    create: {
      slug: s,
      name: s.replace(/[-_]/g, " ").replace(/\s+/g, " ").trim() || s,
    },
    select: { id: true },
  });
  return cat.id;
}

async function upsertMedia(productId: string, url?: string | null) {
  if (!url) return;
  const exists = await prisma.media.findFirst({
    where: { productId, url, kind: MediaType.image },
    select: { id: true },
  });
  if (!exists) {
    await prisma.media.create({
      data: {
        productId,
        url,
        kind: MediaType.image,
        position: 0,
      },
    });
  }
}

async function upsertVariant(
  productId: string,
  sku: string,
  priceCents: number,
  stock = 0,
  personalize = false
) {
  await prisma.variant.upsert({
    where: { productId_sku: { productId, sku } }, // wymaga @@unique([productId, sku], name: "productId_sku")
    update: {
      priceCents,
      stock,
      personalize,
      discountActive: false,
      salePriceCents: null,
      showDiscountPercent: true,
    },
    create: {
      productId,
      sku,
      priceCents,
      stock,
      personalize,
      discountActive: false,
      salePriceCents: null,
      showDiscountPercent: true,
    },
  });
}

async function main() {
  const items = (productsGiftsData as SeedItem[]) || [];
  console.log(`Seeding ${items.length} products…`);

  for (const p of items) {
    const slug = p.slug.trim().toLowerCase();
    const sku = (p.sku || fallbackSku(slug)).trim().toUpperCase();
    const price = Number.isFinite(p.priceCents as number) ? (p.priceCents as number) : 0;

    // (opcjonalnie) kategoria z danych
    const categoryId = await ensureCategoryBySlug(p.category ?? null);

    // 1) Produkt
    const product = await prisma.product.upsert({
      where: { slug },
      update: {
        name: p.name,
        description: p.description ?? null,
        brand: p.brand ?? null,
        featured: !!p.featured,
        ...(categoryId ? { categoryId } : {}),
        deletedAt: null as unknown as Prisma.NullableDateTimeFieldUpdateOperationsInput, // w razie „odkopania”
      },
      create: {
        slug,
        name: p.name,
        description: p.description ?? null,
        brand: p.brand ?? null,
        featured: !!p.featured,
        ...(categoryId ? { categoryId } : {}),
      },
      select: { id: true },
    });

    // 2) Wariant (cena/stan/personalizacja)
    await upsertVariant(
      product.id,
      sku,
      Math.max(0, Math.floor(price)),
      Math.max(0, Math.floor(p.stock ?? 0)),
      !!p.personalize
    );

    // 3) Miniatura w Media
    await upsertMedia(product.id, p.imageUrl ?? undefined);
  }

  console.log("✅ Seed products done");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
