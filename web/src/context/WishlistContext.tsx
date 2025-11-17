import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from "react";

/* ——— Typy ——— */
export type WishlistItem = {
  slug: string;
  name: string;
  price?: number;
  priceCents?: number;
  oldPrice?: number;
  image?: string;
  description?: string;
  rating?: number;
  stock?: number;
  promo?: boolean;
  promoEnd?: string;              // w LS przechowujemy string (ISO)
  bestseller?: boolean;
  discountActive?: boolean;
  salePriceCents?: number | null;
  showDiscountPercent?: boolean;
  media?: Array<{ url?: string }>;
  [key: string]: unknown;
};

export interface WishlistContextValue {
  wishlist: WishlistItem[];
  toggleWishlist: (product: WishlistItem) => void;
  isInWishlist: (slug: string) => boolean;
  clearWishlist: () => void;
  /** 🔥 nowość: zmerguj świeże pola z backendu (po slug) */
  updateFromServer: (partials: Array<Partial<WishlistItem> & { slug: string }>) => void;
}

/* ——— LS helpers ——— */
function safeGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return (raw ? JSON.parse(raw) : fallback) as T;
  } catch {
    return fallback;
  }
}
function safeSet(key: string, val: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {}
}

/* ——— Utils ——— */
const toNum = (v: any): number | undefined =>
  typeof v === "number"
    ? v
    : typeof v === "string" && v.trim() !== ""
    ? Number(v)
    : undefined;

const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));

const toAbsolute = (url?: string): string | undefined => {
  if (!url) return undefined;
  try {
    if (/^https?:\/\//i.test(url)) return url;
    const base =
      typeof window !== "undefined"
        ? window.location.origin
        : "http://localhost:3000";
    return new URL(url, base).toString();
  } catch {
    return url;
  }
};

const pickImage = (p: any): string | undefined =>
  p?.image ||
  p?.thumbnail ||
  p?.cover ||
  p?.images?.[0]?.url ||
  p?.images?.[0] ||
  p?.media?.[0]?.url ||
  p?.media?.[0] ||
  undefined;

/* ——— Inicjalizacja ——— */
const STORAGE_KEY = "wishlist";
const WishlistContext = createContext<WishlistContextValue | null>(null);
const getInitialWishlist = (): WishlistItem[] =>
  safeGet<WishlistItem[]>(STORAGE_KEY, []);

/* ——— Provider ——— */
export function WishlistProvider({ children }: { children: ReactNode }) {
  const [wishlist, setWishlist] = useState<WishlistItem[]>(getInitialWishlist);

  // Normalizacja elementu zapisywanego w ULUBIONYCH
  const normalize = (p: WishlistItem | any): WishlistItem => {
    const img = pickImage(p);
    const price = toNum(p?.price);
    const priceCents = toNum(p?.priceCents);
    const oldPrice = toNum(p?.oldPrice);

    const inferPromo =
      typeof price === "number" &&
      typeof oldPrice === "number" &&
      oldPrice > price;

    return {
      ...p,
      slug: String(p?.slug),
      name: String(p?.name ?? ""),
      image: toAbsolute(typeof p?.image === "string" ? p.image : img),
      description: typeof p?.description === "string" ? p.description : undefined,

      price,
      priceCents,
      oldPrice,

      promo: Boolean(p?.promo) || inferPromo,
      bestseller: Boolean(p?.bestseller),

      discountActive: Boolean(p?.discountActive),
      salePriceCents:
        typeof p?.salePriceCents === "number" ? p.salePriceCents : undefined,
      showDiscountPercent:
        typeof p?.showDiscountPercent === "boolean" ? p.showDiscountPercent : undefined,

      rating: (() => {
        const r = toNum(p?.rating);
        return typeof r === "number" ? clamp(r, 0, 5) : undefined;
      })(),
      stock: (() => {
        const s = toNum(p?.stock);
        return typeof s === "number" ? Math.max(0, Math.floor(s)) : undefined;
      })(),

      promoEnd: p?.promoEnd ? String(p.promoEnd) : undefined,
      media: Array.isArray(p?.media) ? p.media : undefined,
    };
  };

  // Migracja starych wpisów
  useEffect(() => {
    setWishlist((prev) => prev.map(normalize));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 1) zmiany LS z innych kart
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setWishlist(getInitialWishlist());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // 2) nasz event w tej samej karcie — 1 tick po zapisie LS
  useEffect(() => {
    const onToggle = () => setTimeout(() => setWishlist(getInitialWishlist()), 0);
    window.addEventListener("wishlist:toggle", onToggle);
    return () => window.removeEventListener("wishlist:toggle", onToggle);
  }, []);

  // Persist
  useEffect(() => {
    safeSet(STORAGE_KEY, wishlist);
  }, [wishlist]);

  const isInWishlist = (slug: string) =>
    wishlist.some((i) => i.slug === slug);

  const emit = () => {
    try { window.dispatchEvent(new Event("wishlist:toggle")); } catch {}
  };

  const toggleWishlist = (product: WishlistItem) => {
    const item = normalize(product);
    setWishlist((prev) => {
      const exists = prev.some((p) => p.slug === item.slug);
      const next = exists ? prev.filter((p) => p.slug !== item.slug) : [...prev, item];

      // synchroniczny zapis przed eventem
      safeSet(STORAGE_KEY, next);

      // metryki (opcjonalnie)
      try {
        const key = exists ? "metrics:wishlist_remove" : "metrics:wishlist_add";
        const stats = safeGet<Record<string, number>>(key, {});
        stats[item.slug] = (stats[item.slug] || 0) + 1;
        safeSet(key, stats);
      } catch {}

      emit();
      return next;
    });
  };

  const clearWishlist = () => {
    setWishlist([]);
    safeSet(STORAGE_KEY, []);
    emit();
  };

  /** 🔥 merge świeżych danych z backendu (po slug) */
  const updateFromServer: WishlistContextValue["updateFromServer"] = (partials) => {
    if (!Array.isArray(partials) || !partials.length) return;
    setWishlist((prev) => {
      const map = new Map(partials.map((p) => [String(p.slug), p]));
      const next = prev.map((old) => {
        const patch = map.get(old.slug);
        if (!patch) return old;

        // tylko te pola, które realnie mogą się zmieniać dynamicznie
        const merged: WishlistItem = {
          ...old,
          // ceny
          priceCents: toNum((patch as any).priceCents) ?? old.priceCents,
          salePriceCents:
            typeof (patch as any).salePriceCents === "number"
              ? (patch as any).salePriceCents
              : old.salePriceCents,
          discountActive:
            typeof (patch as any).discountActive === "boolean"
              ? (patch as any).discountActive
              : old.discountActive,
          oldPrice: toNum((patch as any).oldPrice) ?? old.oldPrice,
          price: toNum((patch as any).price) ?? old.price,

          // stan
          stock: toNum((patch as any).stock) ?? old.stock,

          // badge
          bestseller:
            typeof (patch as any).bestseller === "boolean"
              ? (patch as any).bestseller
              : old.bestseller,
          promo:
            typeof (patch as any).promo === "boolean"
              ? (patch as any).promo
              : old.promo,

          // obrazki
          image: toAbsolute((patch as any).image) ?? old.image,
          media: Array.isArray((patch as any).media) ? (patch as any).media : old.media,
        };
        return merged;
      });

      safeSet(STORAGE_KEY, next);
      return next;
    });
  };

  const value: WishlistContextValue = useMemo(
    () => ({ wishlist, toggleWishlist, isInWishlist, clearWishlist, updateFromServer }),
    [wishlist]
  );

  return (
    <WishlistContext.Provider value={value}>
      {children}
    </WishlistContext.Provider>
  );
}

/* ——— Hook ——— */
export function useWishlist(): WishlistContextValue {
  const ctx = useContext(WishlistContext);
  if (!ctx) throw new Error("useWishlist must be used within <WishlistProvider>");
  return ctx;
}
