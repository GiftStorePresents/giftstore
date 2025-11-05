// src/hooks/useApiCategories.ts
import { useEffect, useMemo, useRef, useState } from "react";

/** Publiczny model kategorii używany w FE */
export type UiCategory = {
  id: string;
  name: string;
  slug: string;
  imageUrl: string;          // absolutny URL (lub pusty string)
  showInHeader: boolean;
  showInTiles: boolean;
  productsCount: number;     // liczba produktów w tej kategorii (jeśli backend zwraca _count)
  createdAt?: string | null;
  updatedAt?: string | null;
};

type ApiCategory = {
  id: string;
  name: string;
  slug: string;
  imageUrl?: string | null;
  image?: string | null;                 // na wypadek starszego pola
  showInHeader?: boolean | null;
  showInTiles?: boolean | null;
  _count?: { products?: number | null }; // Prisma include
  productsCount?: number | null;         // alternatywne pole z API
  createdAt?: string | null;
  updatedAt?: string | null;
};

type FetchResult =
  | { items: ApiCategory[] }             // częsty wariant: { items: [...] }
  | ApiCategory[];                       // lub po prostu tablica

/** Tworzy absolutny URL do obrazka (jeśli backend zwrócił ścieżkę względną) */
const toAbs = (u?: string | null): string => {
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "";
  const slash = u.startsWith("/") ? "" : "/";
  return `${origin}${slash}${u}`;
};

/** Mapowanie rekordu API → model FE */
const mapOne = (c: ApiCategory): UiCategory => ({
  id: String(c.id),
  name: String(c.name),
  slug: String(c.slug),
  imageUrl: toAbs(c.imageUrl ?? c.image ?? ""),
  showInHeader: Boolean(c.showInHeader ?? true),
  showInTiles: Boolean(c.showInTiles ?? true),
  productsCount:
    typeof c._count?.products === "number"
      ? c._count!.products!
      : typeof c.productsCount === "number"
      ? c.productsCount!
      : 0,
  createdAt: c.createdAt ?? null,
  updatedAt: c.updatedAt ?? null,
});

/** Bezpieczne pobranie i zmapowanie listy kategorii (publiczne API) */
export async function fetchCategories(signal?: AbortSignal): Promise<UiCategory[]> {
  const r = await fetch("/api/categories", {
    credentials: "include",
    signal,
    headers: { Accept: "application/json" },
  });

  // pozwala złapać 4xx/5xx z treścią
  const txt = await r.text();
  let data: FetchResult | undefined;
  try {
    data = txt ? (JSON.parse(txt) as FetchResult) : ([] as ApiCategory[]);
  } catch {
    data = [] as ApiCategory[];
  }
  if (!r.ok) {
    const msg =
      (data as any)?.error || (data as any)?.message || txt || `HTTP ${r.status}`;
    throw new Error(msg);
  }

  const arr: ApiCategory[] = Array.isArray(data) ? data : data.items ?? [];
  return arr.map(mapOne);
}

/** Małe pomocnicze selektory (nie mutują wejścia) */
export const selectHeaderCategories = (cats: UiCategory[]) =>
  cats.filter((c) => c.showInHeader);

export const selectTileCategories = (cats: UiCategory[]) =>
  cats.filter((c) => c.showInTiles);

/** Opcje hooka */
export type UseApiCategoriesOptions = {
  /** Lazy = nie ładuj automatycznie na mount */
  lazy?: boolean;
};

/** Prosty hook z `reload()` oraz stanami: {items, loading, error} */
export function useApiCategories(options: UseApiCategoriesOptions = {}) {
  const { lazy = false } = options;
  const [items, setItems] = useState<UiCategory[]>([]);
  const [loading, setLoading] = useState(!lazy);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    setError(null);
    try {
      const list = await fetchCategories(ac.signal);
      setItems(list);
    } catch (e: any) {
      setError(e?.message || "Nie udało się pobrać kategorii");
    } finally {
      setLoading(false);
    }
  };

  // automatyczny start (chyba że lazy)
  useEffect(() => {
    if (!lazy) load();
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lazy]);

  const header = useMemo(() => selectHeaderCategories(items), [items]);
  const tiles = useMemo(() => selectTileCategories(items), [items]);

  return {
    items,
    header,      // tylko showInHeader
    tiles,       // tylko showInTiles
    loading,
    error,
    reload: load,
  };
}
