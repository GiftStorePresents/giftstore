import React, { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";

/* ————— Typy ————— */
export type WishlistItem = {
  slug: string;
  name: string;
  price?: number;
  image?: string;
  description?: string;
  // Dopuszczamy dodatkowe pola (np. brand, category), ale nie są wymagane.
  [key: string]: unknown;
};

export interface WishlistContextValue {
  wishlist: WishlistItem[];
  toggleWishlist: (product: WishlistItem) => void;
  isInWishlist: (slug: string) => boolean;
  clearWishlist: () => void;
}

/* ————— Bezpieczne localStorage ————— */
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

/* ————— Inicjalizacja ————— */
const STORAGE_KEY = "wishlist";
const WishlistContext = createContext<WishlistContextValue | null>(null);

const getInitialWishlist = (): WishlistItem[] => safeGet<WishlistItem[]>(STORAGE_KEY, []);

/* ————— Provider ————— */
export function WishlistProvider({ children }: { children: ReactNode }) {
  const [wishlist, setWishlist] = useState<WishlistItem[]>(getInitialWishlist);

  // Persist do localStorage
  useEffect(() => {
    safeSet(STORAGE_KEY, wishlist);
  }, [wishlist]);

  // Normalizacja produktu: trzymamy tylko najważniejsze pola,
  // żeby ProductCard zadziałał i żeby uniknąć wylewania całego obiektu z API.
  const normalize = (p: WishlistItem): WishlistItem => ({
    slug: String(p.slug),
    name: String(p.name || ""),
    price: typeof p.price === "number" ? p.price : undefined,
    image: typeof p.image === "string" ? p.image : (typeof (p as any)?.media?.[0]?.url === "string" ? (p as any).media[0].url : undefined),
    description: typeof p.description === "string" ? p.description : undefined,
    ...p, // resztę pól zostawiamy, jeśli były (np. category, brand)
  });

  const isInWishlist = (slug: string) => wishlist.some((p) => p.slug === slug);

  const toggleWishlist = (product: WishlistItem) => {
    const item = normalize(product);
    setWishlist((prev) => {
      const exists = prev.find((p) => p.slug === item.slug);
      if (exists) {
        // metryka usunięcia (opcjonalnie)
        try {
          const key = "metrics:wishlist_remove";
          const stats = safeGet<Record<string, number>>(key, {});
          stats[item.slug] = (stats[item.slug] || 0) + 1;
          safeSet(key, stats);
        } catch {}
        return prev.filter((p) => p.slug !== item.slug);
      } else {
        // metryka dodania (opcjonalnie)
        try {
          const key = "metrics:wishlist_add";
          const stats = safeGet<Record<string, number>>(key, {});
          stats[item.slug] = (stats[item.slug] || 0) + 1;
          safeSet(key, stats);
        } catch {}
        return [...prev, item];
      }
    });

    // Event dla ewentualnych nasłuchów w UI
    try {
      window.dispatchEvent(new Event("wishlist:toggle"));
    } catch {}
  };

  const clearWishlist = () => setWishlist([]);

  const value: WishlistContextValue = useMemo(
    () => ({ wishlist, toggleWishlist, isInWishlist, clearWishlist }),
    [wishlist]
  );

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

/* ————— Hook ————— */
export function useWishlist(): WishlistContextValue {
  const ctx = useContext(WishlistContext);
  if (!ctx) {
    throw new Error("useWishlist must be used within <WishlistProvider>");
  }
  return ctx;
}
