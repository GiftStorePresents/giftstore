import React, { useEffect, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import ProductCard from "../components/ProductCard";
import { useWishlist } from "../context/WishlistContext";
import { mapApiProductToCard } from "../utils/productMapper";
import { API_BASE } from "../api";

/** Czy obiekt wygląda już jak CardProduct (żeby nie mapować drugi raz) */
function looksRaw(p: any) {
  if (!p) return true;
  const hasCardPrice =
    typeof p.price === "number" || typeof p.priceCents === "number";
  const hasImage = typeof p.image === "string";
  const hasName = typeof p.name === "string" && p.name.length > 0;
  return !(hasCardPrice && hasImage && hasName);
}

export default function WishlistPage() {
  const { wishlist, updateFromServer } = useWishlist();
  const ticking = useRef(false);

  // 🔄 pobierz świeże dane dla slugs i zmerguj do kontekstu
  async function refreshOnce() {
    if (ticking.current) return;
    ticking.current = true;
    try {
      const slugs = (wishlist || []).map((w) => w.slug).filter(Boolean);
      if (!slugs.length) return;

      const url = `${API_BASE}/api/public/products/compact?slugs=${encodeURIComponent(
        slugs.join(",")
      )}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      const items = Array.isArray(data?.items) ? data.items : [];

      // przemapuj dane z API do tego, co chcemy trzymać w wishlist
      const patches = items.map((p: any) => {
        const v0 = Array.isArray(p?.variants) && p.variants.length ? p.variants[0] : null;

        // stan: suma lub pierwszy wariant
        const stock =
          Array.isArray(p?.variants)
            ? p.variants.reduce((acc: number, v: any) => acc + (Number(v?.stock) || 0), 0)
            : (Number((p as any)?.stock) || undefined);

        // ceny
        const priceCents =
          typeof v0?.priceCents === "number"
            ? v0.priceCents
            : (typeof p?.priceCents === "number" ? p.priceCents : undefined);

        const discountActive =
          v0?.discountActive === true ||
          (Array.isArray(p?.variants) && p.variants.some((v: any) => v?.discountActive));

        const salePriceCents = (() => {
          if (!Array.isArray(p?.variants)) return undefined;
          const all = p.variants
            .map((v: any) => (v?.discountActive ? Number(v?.salePriceCents) : NaN))
            .filter((x: any) => Number.isFinite(x));
          if (!all.length) return undefined;
          return Math.min(...all);
        })();

        return {
          slug: String(p.slug),
          priceCents,
          salePriceCents,
          discountActive: !!discountActive,
          oldPrice: typeof p?.oldPriceCents === "number" ? p.oldPriceCents / 100 : undefined,
          // pomocniczo także price (w zł) – przydaje się do kart bez groszy
          price: typeof priceCents === "number" ? Math.round(priceCents) / 100 : undefined,

          stock: Number.isFinite(stock) ? (stock as number) : undefined,

          // badge
          bestseller: !!p?.featured,
          promo: !!p?.promo,

          // obrazki
          image: typeof p?.image === "string" ? p.image : undefined,
          media: Array.isArray(p?.media) ? p.media : undefined,
        };
      });

      updateFromServer(patches);
    } catch {
      // cicho – to tylko “miękkie” odświeżanie
    } finally {
      ticking.current = false;
    }
  }

  // ⏱️ harmonogram: montaż, toggle, widoczność, co 45 s
  useEffect(() => {
    if (!wishlist?.length) return;
    refreshOnce();

    const onToggle = () => refreshOnce();
    window.addEventListener("wishlist:toggle", onToggle);

    const onVis = () => { if (document.visibilityState === "visible") refreshOnce(); };
    document.addEventListener("visibilitychange", onVis);

    const iv = setInterval(() => {
      if (document.visibilityState === "visible") refreshOnce();
    }, 45000);

    return () => {
      window.removeEventListener("wishlist:toggle", onToggle);
      document.removeEventListener("visibilitychange", onVis);
      clearInterval(iv);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wishlist?.length]);

  if (!wishlist || wishlist.length === 0) {
    return (
      <div className="text-center mt-20 text-mainRed font-bold text-xl">
        Lista życzeń jest pusta! <br />
        <Link to="/" className="underline text-gold">Odkrywaj prezenty</Link>
      </div>
    );
  }

  const normalized = useMemo(
    () =>
      (wishlist || [])
        .map((p) => (looksRaw(p) ? mapApiProductToCard(p) || p : p))
        .filter((p: any) => p && p.slug && p.name),
    [wishlist]
  );

  if (typeof window !== "undefined") {
    (window as any).__WISHLIST__ = normalized;
  }

  return (
    <div className="max-w-5xl mx-auto mt-10">
      <h1 className="text-3xl font-extrabold text-mainRed mb-6 text-center">
        Twoja lista życzeń
      </h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-7">
        {normalized.map((product: any) => (
          <ProductCard key={product.id ?? product.slug} product={product} />
        ))}
      </div>
    </div>
  );
}
