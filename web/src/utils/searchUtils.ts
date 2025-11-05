// src/utils/searchUtils.ts
import Fuse, { IFuseOptions } from "fuse.js";

export type SearchItem = {
  name: string;
  description?: string;
  tags?: string[];
  id?: string | number;
  slug?: string;
  image?: string;
  price?: number;
  [key: string]: any;
};

/** Pobierz ewentualny seed z globalThis.__POPULAR_FALLBACK__ (np. SSR) */
function getGlobalFallback(): SearchItem[] {
  const g = typeof globalThis !== "undefined" ? (globalThis as any) : undefined;
  const val = g?.__POPULAR_FALLBACK__;
  return Array.isArray(val) ? (val as SearchItem[]) : [];
}

/** Wewnętrzny dataset Fuse */
let DATASET: SearchItem[] = getGlobalFallback();

/** Leniwa instancja Fuse */
let fuse: Fuse<SearchItem> | null = null;

/** Konfiguracja Fuse — typowana przez IFuseOptions */
const fuseOptions: IFuseOptions<SearchItem> = {
  includeScore: true,
  minMatchCharLength: 2,
  threshold: 0.38,
  keys: [
    // Uwaga: tu używamy literalnych stringów (wymaganie typów fuse.js),
    // a nie `keyof SearchItem`, żeby uniknąć TS2322.
    { name: "name",        weight: 0.6 },
    { name: "description", weight: 0.25 },
    { name: "tags",        weight: 0.15 },
  ],
};

function buildFuse(): void {
  fuse = new Fuse<SearchItem>(DATASET, fuseOptions);
}

function getFuse(): Fuse<SearchItem> {
  if (!fuse) buildFuse();
  return fuse!;
}

/** Zasil/odśwież indeks wyszukiwarki z zewnątrz (np. po fetchu z API). */
export function updateSearchDataset(items: SearchItem[] = []): void {
  DATASET = Array.isArray(items) ? items : [];
  buildFuse();
}

/** Szybkie wyszukiwanie (TOP N) – dobre do podpowiedzi w polu szukajki. */
export function searchProducts(query: string, limit = 8): SearchItem[] {
  if (!query || query.trim().length < 2) return [];
  if (!Array.isArray(DATASET) || DATASET.length === 0) return [];
  return getFuse().search(query.trim()).slice(0, limit).map((r) => r.item);
}

/** Pełne wyniki (wszystkie dopasowania) – na stronie /search. */
export function searchAll(query: string): SearchItem[] {
  if (!query || query.trim().length < 2) return [];
  if (!Array.isArray(DATASET) || DATASET.length === 0) return [];
  return getFuse().search(query.trim()).map((r) => r.item);
}

/** (opcjonalnie) odczyt aktualnego datasetu (read-only) */
export function getSearchDataset(): ReadonlyArray<SearchItem> {
  return DATASET;
}
