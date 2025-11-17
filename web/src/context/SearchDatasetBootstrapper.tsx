// src/context/SearchDatasetBootstrapper.tsx
import { useEffect } from "react";
import { updateSearchDataset, type SearchItem } from "../utils/searchUtils";
import { useApiProducts } from "../hooks/useApiProducts";
import { API_BASE } from "../api";

/** Zabezpieczony obrazek (absolutny URL + fallback) */
const FALLBACK_IMG = "/og-image.jpg";
function absUrl(url?: string | null): string {
  if (!url) return FALLBACK_IMG;
  if (/^https?:\/\//i.test(url)) return url;
  return `${API_BASE}${url.startsWith("/") ? url : `/${url}`}`;
}

/** Najniższa cena wariantu w zł */
function minPriceZl(variants?: Array<{ priceCents?: number }>): number | undefined {
  if (!Array.isArray(variants) || variants.length === 0) return undefined;
  const cents = variants
    .map((v) => (typeof v?.priceCents === "number" ? v.priceCents : undefined))
    .filter((n): n is number => typeof n === "number");
  if (!cents.length) return undefined;
  return cents.reduce((a, b) => Math.min(a, b)) / 100;
}

export default function SearchDatasetBootstrapper() {
  // pobiera większą paczkę produktów (np. do 500) – jak masz w hooku
  const { items } = useApiProducts({ page: 1, limit: 500 });

  useEffect(() => {
    if (!Array.isArray(items) || items.length === 0) return;

    const mapped: SearchItem[] = items
      .map((p: any) => {
        // slug i name MUSZĄ istnieć (reszta jest opcjonalna)
        const slug: string | undefined = p?.slug ?? p?.Slug ?? p?.handle;
        const name: string | undefined = p?.name ?? p?.title ?? p?.productName;

        if (!slug || !name) return null;

        // obrazek: media[0].url / image / thumbnail → absolutny URL
        const media0 =
          p?.media?.[0]?.url ??
          p?.images?.[0] ??
          p?.photos?.[0] ??
          p?.image ??
          p?.thumbnail ??
          null;
        const image = absUrl(media0);

        // cena: priceCents | min(variants[].priceCents) | price
        let price: number | undefined =
          typeof p?.priceCents === "number" ? p.priceCents / 100 : undefined;
        if (price === undefined) {
          const minZl = minPriceZl(p?.variants);
          price = typeof minZl === "number" ? minZl : undefined;
        }
        if (price === undefined && typeof p?.price === "number") {
          price = p.price;
        }

        // rating (jeśli masz w API) – fallback 5
        const rating =
          typeof p?.rating === "number" && p.rating >= 0 ? p.rating : 5;

        return {
          id: p?.id ?? p?._id ?? slug,
          slug,
          name,
          description: p?.description ?? p?.shortDescription ?? "",
          image,
          price,
          rating,
          tags: Array.isArray(p?.tags) ? p.tags : [],
          // cokolwiek jeszcze chcesz przenieść:
          brand: p?.brand,
          category: p?.category,
        } as SearchItem;
      })
      .filter(Boolean) as SearchItem[];

    updateSearchDataset(mapped);
  }, [items]);

  return null;
}
