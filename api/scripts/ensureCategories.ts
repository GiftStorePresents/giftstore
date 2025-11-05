// api/scripts/ensureCategories.ts
import { PrismaClient } from "@prisma/client";
import { toCategoriesCreatePayload, AUTO_PAYLOAD } from "../../shared/categories.seed";

const prisma = new PrismaClient();

const API_URL = process.env.API_URL ?? "http://localhost:4000";

async function main() {
  console.log("🔧 Tworzenie kategorii jeśli brak…");
  const { categories } = toCategoriesCreatePayload();

  for (const cat of categories) {
    await prisma.category.upsert({
      where: { slug: cat.slug },
      update: cat,
      create: cat,
    });
  }

  console.log("✅ Kategorie OK, import przypięć produktów…");
  const res = await fetch(`${API_URL}/api/admin/categories/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(AUTO_PAYLOAD),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Import fail: HTTP ${res.status} ${text}`);
  }
  console.log("📦 Wynik importu:", await res.text());
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
