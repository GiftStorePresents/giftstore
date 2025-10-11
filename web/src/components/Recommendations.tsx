// src/components/Recommendations.tsx
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { rankProducts } from "../ai/ranker";
import { getViewed } from "../utils/history";
import { api } from "../api";

/* ---------- Typy ---------- */
type Product = {
  slug: string;
  name: string;
  image?: string;
  galleryImages?: string[];
  category?: string;
  brand?: string;
  price?: number; // PLN
  _reason?: string;
};

type CartItemLite = { slug?: string; priceCents?: number };

type RecommendationsProps = {
  title?: string;
  hint?: string;
  exclude?: string[];
  mode?: "cross" | "upsell";
  /** maksymalna liczba kart do pokazania (zanim przytniemy do pełnych rzędów) */
  count?: number;
  className?: string;
  cartItems?: CartItemLite[];
  /** ile pełnych rzędów ma być wypełnionych (domyślnie 2) */
  rows?: number;
  /** jeśli true, przycina do pełnych rzędów w zależności od liczby kolumn (2/3/4) */
  fillRows?: boolean;
};

/* ---------- Placeholders (różnorodne) ---------- */
const FALLBACKS_GENERIC = [
  "https://images.unsplash.com/photo-1512436991641-6745cdb1723f?auto=format&fit=crop&w=800&q=60",
  "https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=800&q=60",
  "https://images.unsplash.com/photo-1516387938699-a93567ec168e?auto=format&fit=crop&w=800&q=60",
  "https://images.unsplash.com/photo-1520975922284-9d5633b7e0e2?auto=format&fit=crop&w=800&q=60",
  "https://images.unsplash.com/photo-1503342452485-86ff0a8bddd6?auto=format&fit=crop&w=800&q=60",
  "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=800&q=60",
  "https://images.unsplash.com/photo-1491553895911-0055eca6402d?auto=format&fit=crop&w=800&q=60",
  "https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&w=800&q=60",
];

const FALLBACKS_BY_CATEGORY: Record<string, string[]> = {
  "dla niej": [
    "https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=800&q=60",
    "https://images.unsplash.com/photo-1503342217505-b0a15cf70489?auto=format&fit=crop&w=800&q=60",
  ],
  "dla niego": [
    "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=800&q=60",
    "https://images.unsplash.com/photo-1491553895911-0055eca6402d?auto=format&fit=crop&w=800&q=60",
  ],
  gadżety: [
    "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=800&q=60",
    "https://images.unsplash.com/photo-1518779578993-ec3579fee39f?auto=format&fit=crop&w=800&q=60",
  ],
  dom: [
    "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=800&q=60",
    "https://images.unsplash.com/photo-1501045661006-fcebe0257c3f?auto=format&fit=crop&w=800&q=60",
  ],
};

const hash = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};

const categoryFallback = (p: Product) => {
  const cat = String(p.category || "").toLowerCase();
  for (const key of Object.keys(FALLBACKS_BY_CATEGORY)) {
    if (cat.includes(key)) {
      const arr = FALLBACKS_BY_CATEGORY[key];
      return arr[hash(p.slug) % arr.length];
    }
  }
  return FALLBACKS_GENERIC[hash(p.slug) % FALLBACKS_GENERIC.length];
};

/* ---------- Utils ---------- */
function ensureAbs(url?: string): string | undefined {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  try {
    const origin =
      (import.meta as any)?.env?.VITE_SITE_URL ||
      (typeof window !== "undefined" ? window.location.origin : "");
    if (!origin) return url;
    const needsSlash = url && !url.startsWith("/") && !String(origin).endsWith("/");
    return `${origin}${needsSlash ? "/" : ""}${url}`;
  } catch {
    return url;
  }
}

function pickImage(p: Product): string {
  const fromProduct =
    ensureAbs(p.image) ||
    ensureAbs(Array.isArray(p.galleryImages) ? p.galleryImages[0] : undefined);
  return fromProduct || categoryFallback(p);
}

function uniqBySlug<T extends { slug?: string }>(arr: T[]): T[] {
  const out: T[] = [];
  const seen = new Set<string>();
  for (const it of arr) {
    const s = it?.slug;
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(it);
  }
  return out;
}

const priceToCents = (pln?: number): number =>
  typeof pln === "number" && isFinite(pln) ? Math.round(pln * 100) : 0;

/* ---------- hook: liczba kolumn wg breakpointów (2 / 3 / 4) ---------- */
function useGridCols() {
  const [cols, setCols] = useState(2);
  useEffect(() => {
    const calc = () => {
      const w = window.innerWidth || 0;
      // Tailwind: <640 = 2, >=640 = 3, >=1024 = 4
      setCols(w >= 1024 ? 4 : w >= 640 ? 3 : 2);
    };
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, []);
  return cols;
}

/* ---------- Komponent ---------- */
export default function Recommendations({
  title = "Powiązane propozycje",
  hint,
  exclude = [],
  mode = "cross",
  count = 8,
  className = "",
  cartItems = [],
  rows = 2,
  fillRows = true,
}: RecommendationsProps) {
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  // kolumny wg viewportu
  const cols = useGridCols();
  const desiredCount = fillRows ? Math.min(count, Math.max(1, rows) * Math.max(1, cols)) : count;

  // średnia cena z koszyka (w groszach)
  const cartAvgCents = useMemo(() => {
    const nums = (cartItems || [])
      .map((i) => i?.priceCents ?? 0)
      .filter((v) => typeof v === "number" && v > 0);
    if (!nums.length) return 0;
    return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
  }, [cartItems]);

  // wykluczenia: props + koszyk
  const excludeKey = useMemo(() => {
    const fromCart = (cartItems || [])
      .map((i) => i.slug)
      .filter((s): s is string => !!s);
    return [...new Set([...(exclude || []), ...fromCart])].filter(Boolean).sort().join(",");
  }, [exclude, cartItems]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setLoading(true);

        // 1) Pula
        const resp = await api.products(1);
        const pool: Product[] = Array.isArray(resp?.items) ? resp.items : [];

        // 2) Kontekst z historii
        const viewed = getViewed();
        const lastSlug = viewed?.[0];
        const last = lastSlug ? pool.find((p) => p.slug === lastSlug) : undefined;

        // 3) Hint
        const effectiveHint =
          (hint && hint.trim()) ||
          (last ? `${last.category || ""} ${last.brand || ""}`.trim() : "prezent uniwersalny");

        // 4) Wykluczenia
        const excludeSet = new Set(excludeKey ? excludeKey.split(",") : []);
        let filtered = pool.filter((p) => p?.slug && !excludeSet.has(p.slug));

        // 5) Upsell (10–80% drożej od średniej koszyka lub „ostatniego”)
        if (mode === "upsell") {
          const baseCents = cartAvgCents > 0 ? cartAvgCents : priceToCents(last?.price);
          if (baseCents > 0) {
            const minCents = Math.round(baseCents * 1.1);
            const maxCents = Math.round(baseCents * 1.8);
            const upsellOnly = filtered.filter((p) => {
              const pc = priceToCents(p.price);
              return pc >= minCents && pc <= maxCents;
            });
            filtered =
              upsellOnly.length >= Math.min(desiredCount, 4)
                ? upsellOnly
                : uniqBySlug([
                    ...upsellOnly,
                    ...filtered.filter((p) => !upsellOnly.find((x) => x.slug === p.slug)),
                  ]);
          }
        }

        // 6) Ranking
        const rankedRes: any = rankProducts(filtered, effectiveHint, {
          topN: Math.max(desiredCount * 2, 16),
        });
        const ranked: Product[] = Array.isArray(rankedRes)
          ? rankedRes
          : Array.isArray(rankedRes?.items)
          ? rankedRes.items
          : [];

        // 7) Final + fallback
        let finalItems = uniqBySlug(
          ranked.map((p) => ({
            ...p,
            image: pickImage(p),
          }))
        )
          .filter((p) => !!p.slug && !new Set(excludeKey.split(",")).has(p.slug))
          .slice(0, desiredCount);

        if (finalItems.length === 0) {
          finalItems = uniqBySlug(
            filtered.slice(0, desiredCount * 2).map((p) => ({ ...p, image: pickImage(p) }))
          ).slice(0, desiredCount);
        }

        if (mounted) setItems(finalItems);
      } catch {
        if (mounted) setItems([]);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [hint, mode, count, rows, fillRows, cols, excludeKey, cartAvgCents]);

  if (!items.length && !loading) return null;

  // siatka: 2 / 3 / 4 kolumny (Tailwind)
  const gridCols = "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4";

  return (
    <section className={`mt-10 ${className}`}>
      <h3 className="text-xl font-semibold mb-4">{title}</h3>

      {/* Skeleton */}
      {loading && (
        <div className={`grid ${gridCols} gap-4`}>
          {Array.from({ length: Math.min(8, desiredCount) }).map((_, i) => (
            <div key={`sk-${i}`} className="animate-pulse">
              <div className="w-full h-40 bg-gray-200 rounded-lg" />
              <div className="h-4 bg-gray-200 rounded mt-2 w-3/4" />
              <div className="h-3 bg-gray-100 rounded mt-1 w-1/2" />
            </div>
          ))}
        </div>
      )}

      {!loading && items.length > 0 && (
        <div className={`grid ${gridCols} gap-4`}>
          {items.map((p) => {
            const fallback = categoryFallback(p);
            return (
              <Link key={p.slug} to={`/product/${p.slug}`} className="block group">
                <div className="w-full h-40 rounded-lg overflow-hidden border bg-white">
                  <img
                    src={pickImage(p)}
                    alt={p.name}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    loading="lazy"
                    onError={(e) => {
                      const el = e.currentTarget as HTMLImageElement;
                      if (el.src !== fallback) el.src = fallback;
                    }}
                  />
                </div>
                <div className="mt-2 text-sm">{p.name}</div>
                {p._reason && <div className="text-xs text-gray-500">{p._reason}</div>}
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
