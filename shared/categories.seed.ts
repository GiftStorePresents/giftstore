// shared/categories.seed.ts
// ===========================================
// Kanoniczne kategorie + helpery do importu.
// Spójność slugów: dla-dzieci, dla-niego, dla-niej,
// personalizowane, relaks, inne (+ kilka dodatkowych wspólnych).
// ===========================================

/** Minimalny typ produktu (zgodny z PopularGift) — tylko to, czego potrzebujemy. */
export type SimpleProduct = {
  slug: string;
  /** slug kategorii lub nazwa do znormalizowania (np. "Dla dziecka") */
  category?: string | null;
};

export type CategorySeed = {
  /** Nazwa wyświetlana */
  category: string;
  /** Kanoniczny slug (jeśli brak, policzymy ze 'category') */
  slug?: string;
  /** Slugi produktów do przypięcia (opcjonalnie; można generować z produktów) */
  productSlugs?: string[];
  /** Widoczność */
  showInHeader?: boolean;
  showInTiles?: boolean;
  /** Sortowanie w UI */
  sortOrder?: number;
  /** Obraz kafelka (opcjonalny; może być ścieżką względną /uploads/... lub pełnym URL) */
  imageUrl?: string | null;
};

/* =========================
 * Utils
 * ========================= */
export const slugify = (s: string) =>
  (s || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);

/** Mapowanie różnych wariantów nazwy/slugów na **kanoniczny** slug. */
export function normalizeCategoryToCanonical(input?: string | null): string | undefined {
  if (!input) return undefined;
  const raw = String(input).trim().toLowerCase();

  // Usunięcie diakrytyków i normalizacja spacji/kresek:
  const simplified = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // Słownik wariantów → slug kanoniczny
  const map: Record<string, string> = {
    // rdzeń proszony w zadaniu:
    "dla dzieci": "dla-dzieci",
    "dla dziecka": "dla-dzieci",
    "dzieci": "dla-dzieci",

    "dla niego": "dla-niego",
    "dla niej": "dla-niej",

    "personalizowane": "personalizowane",
    "personalizowany": "personalizowane",
    "personalizowana": "personalizowane",
    "personalizowane prezenty": "personalizowane",

    "relaks": "relaks",

    "inne": "inne",

    // rozszerzenia często używane w sklepie:
    "dla mamy": "dla-mamy",
    "dla taty": "dla-taty",
    "bestsellery": "bestsellery",
    "nowosci": "nowosci",
    "nowości": "nowosci",
    "na urodziny": "na-urodziny",
    "urodziny": "na-urodziny",
    "technologia": "technologia",
    "dom": "dom",
    "kuchnia": "kuchnia",
    "sport": "sport",
    "podroze": "podroze",
    "podróże": "podroze",

    // "bez kategorii" na końcu
    "bez kategorii": "bez-kategorii",
  };

  // Najpierw spróbuj dopasować dosłownie:
  if (map[simplified]) return map[simplified];

  // Jeżeli wejdzie np. kanoniczny slug — przepuść:
  const maybeSlug = slugify(simplified);
  if (map[maybeSlug]) return map[maybeSlug];

  // Domyślnie sługuj:
  return slugify(simplified);
}

/* =========================
 * Kanoniczne kategorie (rdzeń)
 * =========================
 * Flagi: header/tiles oraz sortOrder do spójnego UI.
 * imageUrl — opcjonalnie, jeśli chcesz mieć grafiki kafelków "od ręki".
 * Możesz podmienić na własne /uploads/cat/*.webp gdy już wgrasz w panelu.
 */
export const CATEGORIES_CANON: CategorySeed[] = [
  { category: "Dla niej",       slug: "dla-niej",       showInHeader: true,  showInTiles: true,  sortOrder: 10,  imageUrl: null },
  { category: "Dla niego",      slug: "dla-niego",      showInHeader: true,  showInTiles: true,  sortOrder: 20,  imageUrl: null },
  { category: "Dla dzieci",     slug: "dla-dzieci",     showInHeader: true,  showInTiles: true,  sortOrder: 30,  imageUrl: null },
  { category: "Personalizowane",slug: "personalizowane",showInHeader: true,  showInTiles: true,  sortOrder: 40,  imageUrl: null },
  { category: "Relaks",         slug: "relaks",         showInHeader: true,  showInTiles: true,  sortOrder: 50,  imageUrl: null },
  { category: "Inne",           slug: "inne",           showInHeader: false, showInTiles: false, sortOrder: 900, imageUrl: null },

  // (opcjonalne popularne rozszerzenia – włącz/wyłącz wg potrzeb)
  { category: "Dla mamy",       slug: "dla-mamy",       showInHeader: false, showInTiles: true,  sortOrder: 60,  imageUrl: null },
  { category: "Dla taty",       slug: "dla-taty",       showInHeader: false, showInTiles: true,  sortOrder: 70,  imageUrl: null },
  { category: "Na urodziny",    slug: "na-urodziny",    showInHeader: false, showInTiles: true,  sortOrder: 80,  imageUrl: null },
  { category: "Technologia",    slug: "technologia",    showInHeader: false, showInTiles: true,  sortOrder: 90,  imageUrl: null },
  { category: "Dom",            slug: "dom",            showInHeader: false, showInTiles: true,  sortOrder: 100, imageUrl: null },
  { category: "Kuchnia",        slug: "kuchnia",        showInHeader: false, showInTiles: true,  sortOrder: 110, imageUrl: null },
  { category: "Sport",          slug: "sport",          showInHeader: false, showInTiles: true,  sortOrder: 120, imageUrl: null },
  { category: "Podróże",        slug: "podroze",        showInHeader: false, showInTiles: true,  sortOrder: 130, imageUrl: null },

  // techniczne / meta
  { category: "Bestsellery",    slug: "bestsellery",    showInHeader: true,  showInTiles: false, sortOrder: 140, imageUrl: null },
  { category: "Nowości",        slug: "nowosci",        showInHeader: true,  showInTiles: true,  sortOrder: 150, imageUrl: null },

  // specjalna kategoria techniczna:
  { category: "Bez kategorii",  slug: "bez-kategorii",  showInHeader: false, showInTiles: false, sortOrder: 999, imageUrl: null },
];

/* =========================
 * Budowanie seeda z listą produktów
 * =========================
 * Użycie:
 *   import productsGiftsData from "@shared/productsGiftsData";
 *   const SEED = buildSeedWithProducts(productsGiftsData);
 *   const payload = toImportPayload(SEED); // { groups: [...] }
 */
export function buildSeedWithProducts(products: SimpleProduct[]): CategorySeed[] {
  // 1) Zrób mapę slug kanoniczny → { category, slug, ... }
  const baseBySlug = new Map<string, CategorySeed>();
  for (const c of CATEGORIES_CANON) {
    const slug = c.slug || slugify(c.category);
    baseBySlug.set(slug, {
      category: c.category,
      slug,
      showInHeader: c.showInHeader,
      showInTiles: c.showInTiles,
      sortOrder: c.sortOrder,
      imageUrl: c.imageUrl ?? null,
      productSlugs: [],
    });
  }

  // 2) Rozdziel produkty wg kanonicznego slugu (zabezpieczenie wariantów)
  for (const p of products || []) {
    const canon = normalizeCategoryToCanonical(p.category);
    if (!canon) continue;
    const bucket =
      baseBySlug.get(canon) ||
      baseBySlug.get("inne"); // domyślnie wrzucamy do "inne", jeśli nie ma dopasowania

    if (!bucket) continue;
    if (!bucket.productSlugs) bucket.productSlugs = [];
    if (p.slug) bucket.productSlugs.push(p.slug);
  }

  // 3) Usuń duplikaty i posortuj po sortOrder / nazwie
  const out = Array.from(baseBySlug.values()).map((c) => ({
    ...c,
    productSlugs: Array.from(new Set(c.productSlugs || [])).filter(Boolean),
  }));

  out.sort((a, b) => {
    const ao = typeof a.sortOrder === "number" ? a.sortOrder : 1000;
    const bo = typeof b.sortOrder === "number" ? b.sortOrder : 1000;
    if (ao !== bo) return ao - bo;
    return a.category.localeCompare(b.category);
  });

  return out;
}

/* =========================
 * Payloady dla backendu
 * ========================= */

/** Payload pod backendowy endpoint: POST /api/admin/categories/import
 *  Struktura: { groups: Array<{ category: string; productSlugs: string[] }> }
 *  Domyślnie używa CATEGORIES_CANON (z pustymi productSlugs), ale
 *  najlepiej podać wynik `buildSeedWithProducts(...)`.
 */
export function toImportPayload(seed: CategorySeed[] = CATEGORIES_CANON) {
  return {
    groups: seed.map(({ category, productSlugs }) => ({
      category,
      productSlugs: Array.from(new Set(productSlugs || [])).filter(Boolean),
    })),
  };
}

/** Payload do szybkiego tworzenia samych kategorii (np. wywołać pętlą POST /api/admin/categories) */
export function toCategoriesCreatePayload() {
  return {
    categories: CATEGORIES_CANON.map(
      ({ category, slug, showInHeader = true, showInTiles = true, sortOrder, imageUrl = null }) => ({
        name: category,
        slug: slug || slugify(category),
        showInHeader,
        showInTiles,
        sortOrder: typeof sortOrder === "number" ? sortOrder : null,
        ...(imageUrl ? { imageUrl } : {}),
      })
    ),
  };
}

/** Walidacja — zwróci listę brakujących produktów (slugów), których nie ma w DB. */
export function validateAgainst(existingProductSlugs: Set<string>, seed: CategorySeed[] = CATEGORIES_CANON) {
  const missing: Array<{ category: string; slug: string }> = [];
  for (const cat of seed) {
    for (const ps of cat.productSlugs || []) {
      if (ps && !existingProductSlugs.has(ps)) {
        missing.push({ category: cat.category, slug: ps });
      }
    }
  }
  return missing;
}

// --- Auto-seed z produktów (opcjonalny fragment) ---
import productsGiftsData from "./popularGiftsData";

export const AUTO_SEED = buildSeedWithProducts(productsGiftsData);
export const AUTO_PAYLOAD = toImportPayload(AUTO_SEED);

// Możesz to użyć np. w konsoli lub w skrypcie seed.ts do automatycznego importu:
// await fetch("/api/admin/categories/import", { method: "POST", body: JSON.stringify(AUTO_PAYLOAD) })
