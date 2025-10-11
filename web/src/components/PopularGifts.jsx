import { useEffect, useMemo, useState } from "react";
import ProductCard from "./ProductCard";
import { api, API_BASE } from "../api";

/* Fallback – gdy API nic nie zwróci */
const fallbackPopular = [];

/* Bezpieczne czytanie LS */
function readJSON(key, fallback) {
  try {
    if (typeof window === "undefined") return fallback;
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function getMetrics() {
  const addToCart = readJSON("metrics:addToCart", {});
  const purchased = readJSON("metrics:purchased", {});
  const wishlistArr = readJSON("wishlist", []);
  const wishlistSet = new Set(wishlistArr.map((p) => p?.slug).filter(Boolean));
  return { addToCart, purchased, wishlistSet };
}

function absImageUrl(url) {
  if (!url) return "";
  return url.startsWith("http") ? url : `${API_BASE}${url.startsWith("/") ? url : `/${url}`}`;
}

function mapApiProduct(p) {
  const firstVariant = Array.isArray(p?.variants) && p.variants.length ? p.variants[0] : null;

  const priceCents =
    typeof firstVariant?.priceCents === "number"
      ? firstVariant.priceCents
      : (typeof p?.priceCents === "number" ? p.priceCents : null);

  const rawImg =
    (Array.isArray(p?.media) && p.media.length && p.media[0]?.url) ||
    p?.image ||
    null;

  const img = absImageUrl(rawImg);

  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: p.description ?? "",
    price: typeof priceCents === "number" ? Math.max(0, Math.round(priceCents) / 100) : (p.price ?? 0),
    oldPrice: p.oldPrice ?? null,
    rating: typeof p.rating === "number" ? p.rating : 4,
    bestseller: !!p.featured,
    promo: !!p.promo,
    stock: firstVariant?.stock ?? p.stock ?? undefined,
    image: img,
    media: p.media ?? [],
  };
}

function scoreProduct(p, m) {
  const slug = p?.slug || "";
  const price = Number(p?.price ?? 0);
  const rating = Number(p?.rating ?? 0);

  const add = m.addToCart[slug] || 0;
  const buy = m.purchased[slug] || 0;
  const wish = m.wishlistSet.has(slug) ? 1 : 0;

  let score = 0;
  score += buy * 5;
  score += add * 3;
  score += wish * 2;
  score += rating;
  if (p?.bestseller) score += 1.5;
  if (p?.promo) score += 0.5;
  if (Number.isFinite(price)) score += 0.001 * (100000 - price); // delikatne faworyzowanie tańszych
  return score;
}

export default function PopularGifts({ setToast }) {
  const [visible, setVisible] = useState(20);
  const [version, setVersion] = useState(0);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const res = await api.products(1);
        const apiItems = Array.isArray(res?.items) ? res.items : [];
        const mapped = apiItems.map(mapApiProduct).filter((p) => !!p.slug && !!p.name);
        if (mounted) setItems(mapped.length ? mapped : fallbackPopular);
      } catch (err) {
        console.error("[PopularGifts] fetch error:", err);
        if (mounted) setItems(fallbackPopular);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Re-ranking po zdarzeniach
  useEffect(() => {
    if (typeof window === "undefined") return;
    const rebalance = () => setVersion((v) => v + 1);
    window.addEventListener("cart:add", rebalance);
    window.addEventListener("purchase:complete", rebalance);
    window.addEventListener("wishlist:toggle", rebalance);
    return () => {
      window.removeEventListener("cart:add", rebalance);
      window.removeEventListener("purchase:complete", rebalance);
      window.removeEventListener("wishlist:toggle", rebalance);
    };
  }, []);

  const ranked = useMemo(() => {
    const base = Array.isArray(items) ? items : [];
    const metrics = getMetrics();

    const hasAnySignals =
      Object.keys(metrics.addToCart).length > 0 ||
      Object.keys(metrics.purchased).length > 0 ||
      metrics.wishlistSet.size > 0;

    if (hasAnySignals) {
      return [...base].sort((a, b) => scoreProduct(b, metrics) - scoreProduct(a, metrics));
    }

    return [...base].sort((a, b) => {
      if (a?.bestseller && !b?.bestseller) return -1;
      if (!a?.bestseller && b?.bestseller) return 1;

      const ra = Number(a?.rating ?? 0);
      const rb = Number(b?.rating ?? 0);
      if (rb !== ra) return rb - ra;

      if (a?.promo && !b?.promo) return -1;
      if (!a?.promo && b?.promo) return 1;

      const pa = Number(a?.price ?? 0);
      const pb = Number(b?.price ?? 0);
      return pa - pb;
    });
  }, [items, version]);

  const slice = ranked.slice(0, visible);
  const canShowMore = visible < ranked.length;

  if (loading) {
    return (
      <section className="my-12">
        <h3 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-mainRed mb-3">
          Popularne prezenty
        </h3>
        <p className="text-sm text-gray-600">Ładowanie…</p>
      </section>
    );
  }

  if (!ranked.length) {
    return (
      <section className="my-12">
        <h3 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-mainRed mb-3">
          Popularne prezenty
        </h3>
        <p className="text-sm text-gray-600">Brak produktów do wyświetlenia.</p>
      </section>
    );
  }

  return (
    <section className="my-12">
      <h3 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-mainRed mb-6">
        Popularne prezenty
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 md:gap-6">
        {slice.map((product) => (
          <div key={product.slug || product.id} className="h-full">
            <ProductCard product={product} setToast={setToast} />
          </div>
        ))}
      </div>

      {canShowMore && (
        <div className="flex justify-center mt-8">
          <button
            className="w-full sm:w-auto bg-gold text-mainRed font-bold px-6 py-2 rounded-xl hover:bg-mainRed hover:text-gold transition border-2 border-gold hover:border-mainRed"
            onClick={() => setVisible((v) => v + 20)}
          >
            Pokaż więcej
          </button>
        </div>
      )}
    </section>
  );
}
