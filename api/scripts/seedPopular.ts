/* scripts/seedPopular.ts
 * Seed / aktualizacja flagi "featured" (popularny) dla produktów.
 *
 * Sposoby użycia:
 *  - pnpm run seed:popular
 *      -> jeśli istnieje prisma/seed/popular.json (["slug-1","slug-2",...]),
 *         ustawi featured=true dla tych slugów (reszty nie zmienia).
 *
 *  - pnpm run seed:popular --clear
 *      -> najpierw featured=false dla wszystkich, potem (jeśli jest JSON) true dla wskazanych.
 *
 *  - pnpm run seed:popular --recent=20
 *      -> ignoruje JSON, oznacza N najnowszych produktów jako featured (domyślnie 20).
 */

import "dotenv/config";
import path from "path";
import fs from "fs";
import { prisma } from "../src/lib/prisma";

function readPopularJson(): string[] | null {
  const jsonPath = path.resolve(process.cwd(), "prisma", "seed", "popular.json");
  if (!fs.existsSync(jsonPath)) return null;
  try {
    const raw = fs.readFileSync(jsonPath, "utf-8");
    const arr = JSON.parse(raw);
    if (Array.isArray(arr) && arr.every((s) => typeof s === "string")) {
      return arr;
    }
    console.warn(
      `[seedPopular] prisma/seed/popular.json istnieje, ale nie jest tablicą stringów. Zignoruję.`
    );
    return null;
  } catch (e) {
    console.warn(`[seedPopular] Nie mogę odczytać popular.json: ${(e as Error).message}`);
    return null;
  }
}

function getArgFlag(name: string): boolean {
  return process.argv.some((a) => a === `--${name}`);
}
function getArgNumber(name: string, fallback: number): number {
  const prefix = `--${name}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  if (!arg) return fallback;
  const n = Number(arg.slice(prefix.length));
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function main() {
  const doClear = getArgFlag("clear");
  const recentN = getArgNumber("recent", 0);

  // 1) Opcjonalne czyszczenie
  if (doClear) {
    const updated = await prisma.product.updateMany({
      data: { featured: false },
      where: { featured: true },
    });
    console.log(`[seedPopular] Wyłączono featured dla ${updated.count} produktów.`);
  }

  // 2) Mamy dwie ścieżki: JSON ze slugami lub tryb "recent"
  const jsonSlugs = readPopularJson();

  if (recentN > 0 && (!jsonSlugs || jsonSlugs.length === 0)) {
    // Tryb: ostatnie N najnowszych produktów
    const items = await prisma.product.findMany({
      orderBy: { createdAt: "desc" },
      take: recentN,
      select: { id: true, slug: true, featured: true },
    });

    if (items.length === 0) {
      console.log("[seedPopular] Brak produktów w bazie.");
      return;
    }

    const toEnableIds = items.map((p) => p.id);
    const upd = await prisma.product.updateMany({
      where: { id: { in: toEnableIds } },
      data: { featured: true },
    });

    console.log(
      `[seedPopular] Ustawiono featured=true dla ${upd.count} najnowszych produktów (N=${recentN}).`
    );
    console.log("  Slugi:", items.map((p) => p.slug).join(", "));
    return;
  }

  if (jsonSlugs && jsonSlugs.length > 0) {
    // Tryb: lista slugów z JSON
    // (opcjonalnie) nie ruszamy reszty – tylko ustawiamy true tam, gdzie wskazane
    // Jeżeli była flaga --clear, to reszta już jest wyzerowana.
    // Aktualizujemy tylko produkty istniejące.
    const found = await prisma.product.findMany({
      where: { slug: { in: jsonSlugs } },
      select: { id: true, slug: true, featured: true },
    });

    if (found.length === 0) {
      console.log(
        "[seedPopular] W JSON są slugi, ale żaden nie istnieje w bazie. Nic do zrobienia."
      );
      return;
    }

    const ids = found.map((p) => p.id);
    const upd = await prisma.product.updateMany({
      where: { id: { in: ids } },
      data: { featured: true },
    });

    console.log(
      `[seedPopular] Ustawiono featured=true dla ${upd.count} produktów z pliku JSON.`
    );
    console.log("  Slugi:", found.map((p) => p.slug).join(", "));
    return;
  }

  // 3) Fallback – brak JSON i brak --recent => weź 20 najnowszych
  const defaultN = 20;
  const items = await prisma.product.findMany({
    orderBy: { createdAt: "desc" },
    take: defaultN,
    select: { id: true, slug: true, featured: true },
  });

  if (items.length === 0) {
    console.log("[seedPopular] Brak produktów w bazie.");
    return;
  }

  const ids = items.map((p) => p.id);
  const upd = await prisma.product.updateMany({
    where: { id: { in: ids } },
    data: { featured: true },
  });

  console.log(
    `[seedPopular] (fallback) Ustawiono featured=true dla ${upd.count} najnowszych produktów (N=${defaultN}).`
  );
  console.log("  Slugi:", items.map((p) => p.slug).join(", "));
}

main()
  .catch((e) => {
    console.error("[seedPopular] ERROR:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
