// src/utils/searchUtils.ts
// Produkcyjny helper do wyszukiwarki (Fuse.js) — Gift Store

import Fuse, { IFuseOptions } from "fuse.js";
import { mapApiProductToCard } from "./productMapper";

/** Minimalny shape rekordu w indeksie wyszukiwania */
export type SearchItem = {
  id?: string | number;
  slug: string; // wymagany — klik musi prowadzić do /product/:slug
  name: string;
  description?: string;
  image?: string;
  price?: number;
  rating?: number;
  tags?: string[];

  // 🔽 Dodatkowe pola, żeby ProductCard działał tak samo jak w kategoriach
  promo?: boolean;
  bestseller?: boolean;
  stock?: number;
  discountActive?: boolean;
  salePriceCents?: number | null;
  priceCents?: number;
  oldPrice?: number;
  media?: any[];

  [key: string]: any;
};

/** Fallback obrazka, gdy miniatura jest pusta/uszkodzona */
const FALLBACK_IMAGE = "/og-image.jpg";

/** Bezpieczna normalizacja do wyszukiwania */
export function normalizeSafe(v: unknown): string {
  if (v == null) return "";
  let s = "";

  if (Array.isArray(v)) {
    // np. tags: ["kawa", "zestaw"] → "kawa zestaw"
    s = v.map((x) => normalizeSafe(x)).filter(Boolean).join(" ");
  } else if (typeof v === "string") {
    s = v;
  } else if (typeof v === "number" || typeof v === "boolean") {
    s = String(v);
  } else if (typeof (v as any)?.toString === "function") {
    try {
      s = (v as any).toString();
    } catch {
      s = "";
    }
  }

  // .normalize może nie istnieć w bardzo starych runtime’ach — dlatego z „?”
  const base = s.normalize ? s.normalize("NFD") : s;
  return base.replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

/** Łączy i normalizuje wiele pól */
export function joinFields(...fields: unknown[]): string {
  return fields.map((f) => normalizeSafe(f)).filter(Boolean).join(" ");
}

/** Zwraca pewny URL obrazka */
function safeImage(url?: string | null): string {
  if (!url || typeof url !== "string" || !url.trim()) return FALLBACK_IMAGE;
  return url;
}

/** Mapper z surowego produktu API → SearchItem */
export function mapApiToSearchItem(p: any): SearchItem | null {
  if (!p) return null;

  const slug: string | undefined =
    p.slug ?? p.Slug ?? p.permalink ?? p.handle ?? undefined;
  if (!slug || typeof slug !== "string" || !slug.trim()) return null;

  const name: string =
    p.name ?? p.title ?? p.productName ?? String(slug).replace(/[-_]/g, " ");

  const desc: string | undefined =
    p.description ?? p.shortDescription ?? p.subtitle ?? undefined;

  const mediaUrl: string | undefined =
    p.image ||
    p.thumbnail ||
    p.cover ||
    p?.media?.[0]?.url ||
    p?.images?.[0] ||
    p?.photos?.[0];

  const tags: string[] = [
    ...(Array.isArray(p.tags) ? p.tags : []).map(String),
    ...(p.brand ? [String(p.brand)] : []),
    ...(p.category ? [String(p.category)] : []),
  ].filter(Boolean);

  // rating z API (fallback)
  const ratingFromApi =
    typeof p?.rating === "number" && p.rating >= 0
      ? p.rating
      : typeof p?.ratingAvg === "number" && p.ratingAvg >= 0
      ? p.ratingAvg
      : undefined;

  // cena: preferuj price (zł), jeśli brak – policz z priceCents
  let priceFromApi: number | undefined;
  if (typeof p?.price === "number" && Number.isFinite(p.price)) {
    priceFromApi = p.price;
  } else if (
    typeof p?.priceCents === "number" &&
    Number.isFinite(p.priceCents)
  ) {
    priceFromApi = Math.round(p.priceCents) / 100;
  }

  // 🔥 KLUCZOWE: normalizacja przez mapApiProductToCard
  // dzięki temu mamy promo/bestseller/stock/rabat tak jak w kategoriach
  let card: any = null;
  try {
    card = mapApiProductToCard(p as any) || null;
  } catch {
    card = null;
  }

  const finalPrice =
    typeof card?.price === "number" ? card.price : priceFromApi;
  const finalRating =
    typeof card?.rating === "number" ? card.rating : ratingFromApi;

  return {
    id: p.id ?? p._id ?? slug,
    slug,
    name,
    description: desc,
    image: safeImage(card?.image || mediaUrl),
    price: finalPrice,
    rating: finalRating,
    tags,

    // 🔽 dokładnie to, czego potrzebuje ProductCard
    promo: !!card?.promo,
    bestseller: !!card?.bestseller,
    stock:
      typeof card?.stock === "number" && Number.isFinite(card.stock)
        ? card.stock
        : undefined,
    discountActive: !!card?.discountActive,
    salePriceCents:
      typeof card?.salePriceCents === "number"
        ? card.salePriceCents
        : undefined,
    priceCents:
      typeof card?.priceCents === "number" ? card.priceCents : undefined,
    oldPrice:
      typeof card?.oldPrice === "number" ? card.oldPrice : undefined,
    media: card?.media,

    __raw: p, // zostawiamy do debugowania
  };
}

/* =========================
   Wewnętrzne przechowywanie
   ========================= */

let DATASET: SearchItem[] = [];

type IndexedItem = SearchItem & {
  _norm: {
    name: string;
    description: string;
    tags: string[];
  };
};

let INDEX: IndexedItem[] = [];
let fuse: Fuse<IndexedItem> | null = null;
let VERSION = 0;

/** Konfiguracja Fuse */
const fuseOptions: IFuseOptions<IndexedItem> = {
  includeScore: true,
  shouldSort: true,
  ignoreLocation: true,
  minMatchCharLength: 2,
  threshold: 0.32,
  keys: [
    { name: "_norm.name", weight: 0.6 },
    { name: "_norm.description", weight: 0.25 },
    { name: "_norm.tags", weight: 0.15 },
  ],
};

function rebuildIndex(items: SearchItem[]) {
  INDEX = items.map((p) => ({
    ...p,
    _norm: {
      name: normalizeSafe(p?.name),
      description: normalizeSafe(p?.description || ""),
      tags: (Array.isArray(p?.tags) ? p.tags : []).map((t) => normalizeSafe(t)),
    },
  }));
  fuse = new Fuse<IndexedItem>(INDEX, fuseOptions);
}

/* =========================
   API modułu
   ========================= */

/**
 * Uaktualnia dataset wyszukiwarki.
 * Przyjmuje SearchItem[] albo surowe obiekty z API (wtedy mapuje).
 * Rekordy bez `slug` są odrzucane.
 */
export function updateSearchDataset(items: any[] = []): void {
  const arr = Array.isArray(items) ? items : [];

  const mapped: SearchItem[] = arr
    .map((x) => {
      // jeśli wygląda jak SearchItem/CardProduct — tylko „uszczelnij” obrazek
      if (x && typeof x === "object" && "slug" in x && "name" in x) {
        const s = x as SearchItem;
        return { ...s, image: safeImage(s.image) };
      }
      return mapApiToSearchItem(x);
    })
    .filter((v): v is SearchItem => Boolean(v && v.slug && v.name));

  DATASET = mapped;

  // DEV sanity-check: duplikaty slugów
  if ((import.meta as any)?.env?.DEV) {
    const seen = new Set<string>();
    const dups: string[] = [];
    for (const it of DATASET) {
      if (seen.has(it.slug)) dups.push(it.slug);
      else seen.add(it.slug);
    }
    if (dups.length) {
      // eslint-disable-next-line no-console
      console.warn(
        "[search] Duplicate slugs in dataset:",
        Array.from(new Set(dups))
      );
    }
  }

  rebuildIndex(DATASET);

  VERSION++;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("search:dataset"));
  }
}

/** Aktualny dataset (read-only) */
export function getSearchDataset(): ReadonlyArray<SearchItem> {
  return DATASET;
}

/** Numer wersji datasetu (do zależności w useEffect/useMemo) */
export function getSearchVersion(): number {
  return VERSION;
}

/** Szybkie podpowiedzi (TOP N) — do dropdownu w SearchBar */
export function searchProducts(query: string, limit = 8): SearchItem[] {
  if (!query || query.trim().length < 2) return [];
  if (!INDEX.length || !fuse) return [];
  const qn = normalizeSafe(query);
  return fuse
    .search(qn)
    .filter((h) => (h.score ?? 1) <= 0.5)
    .slice(0, Math.max(1, limit))
    .map((h) => {
      const { _norm, ...orig } = h.item;
      return orig;
    });
}

/** Pełne wyniki — do strony /search */
export function searchAll(query: string): SearchItem[] {
  if (!query || query.trim().length < 2) return [];
  if (!INDEX.length || !fuse) return [];
  const qn = normalizeSafe(query);
  return fuse.search(qn).map((h) => {
    const { _norm, ...orig } = h.item;
    return orig;
  });
}

/** Dodatkowy helper — wyszukaj po slug */
export function findBySlug(slug?: string): SearchItem | undefined {
  if (!slug) return undefined;
  return DATASET.find((p) => p.slug === slug);
}

/* =========================
   Opcjonalny seed globalny
   ========================= */

(function bootstrapFromGlobal() {
  const g = typeof globalThis !== "undefined" ? (globalThis as any) : undefined;
  const seed = Array.isArray(g?.__POPULAR_FALLBACK__)
    ? g.__POPULAR_FALLBACK__
    : [];
  if (seed.length) {
    try {
      updateSearchDataset(seed);
      delete g.__POPULAR_FALLBACK__;
    } catch {
      // ignoruj – seed jest opcjonalny
    }
  }
})();
