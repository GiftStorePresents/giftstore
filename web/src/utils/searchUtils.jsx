// src/utils/searchUtils.js
import Fuse from "fuse.js";
// ⛔️ USUNIĘTO: import products from "../data/popularGiftsData";
// Ten plik często nie istnieje u Ciebie, więc Vite wywala błąd podczas bundlowania.

/**
 * Wewnętrzny dataset do wyszukiwania.
 * Startowo pusty, żeby nie było błędów builda. Możesz go zasilić przez:
 *   - updateSearchDataset(items)
 *   - albo (opcjonalnie) window.__POPULAR_FALLBACK__ (jeśli ustawisz globalnie)
 */
let DATASET = Array.isArray(typeof window !== "undefined" ? window.__POPULAR_FALLBACK__ : undefined)
  ? window.__POPULAR_FALLBACK__
  : [];

// Instancja Fuse budowana leniwie na podstawie DATASET
let fuse;

/** Zbuduj/odśwież instancję Fuse */
function buildFuse() {
  fuse = new Fuse(DATASET, {
    includeScore: true,
    minMatchCharLength: 2,
    threshold: 0.38, // tolerancja fuzzy
    keys: [
      { name: "name", weight: 0.6 },
      { name: "description", weight: 0.25 },
      { name: "tags", weight: 0.15 },
    ],
  });
}

/** Lazy getter na Fuse */
function getFuse() {
  if (!fuse) buildFuse();
  return fuse;
}

/**
 * Publiczny helper do zasiania indeksu z zewnątrz (np. po pobraniu /api/products).
 * Oczekuje tablicy obiektów w kształcie:
 *   { name, description, tags?: string[], ...dowolne inne pola, np. slug }
 * (Jeśli masz „surowe” obiekty z API, zmapuj je wcześniej do ww. kształtu.)
 */
export function updateSearchDataset(items = []) {
  DATASET = Array.isArray(items) ? items : [];
  buildFuse();
}

/**
 * Wyszukiwanie skrócone (TOP N).
 * Jeśli DATASET nie jest zasilony – zwróci pustą tablicę (bez błędów).
 */
export function searchProducts(query, limit = 8) {
  if (!query || query.trim().length < 2) return [];
  if (!Array.isArray(DATASET) || DATASET.length === 0) return [];
  const fuse = getFuse();
  return fuse.search(query.trim()).slice(0, limit).map((r) => r.item);
}

/**
 * Wyszukiwanie pełne (zwraca wszystkie dopasowania).
 */
export function searchAll(query) {
  if (!query || query.trim().length < 2) return [];
  if (!Array.isArray(DATASET) || DATASET.length === 0) return [];
  const fuse = getFuse();
  return fuse.search(query.trim()).map((r) => r.item);
}
