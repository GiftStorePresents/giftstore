// src/pages/ProductPage.tsx
import type React from "react";
import { useState, useMemo, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { FaStar, FaHeart, FaRegHeart } from "react-icons/fa";
import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, Pagination, Thumbs, FreeMode, Autoplay } from "swiper/modules";
import type { Swiper as SwiperType } from "swiper";
import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";
import "swiper/css/thumbs";
import "swiper/css/free-mode";

import ProductCard from "../components/ProductCard";
import { useWishlist } from "../context/WishlistContext";
import { useCart } from "../context/CartContext";
import SeoHead from "../components/SeoHead";
import Breadcrumbs from "../components/Breadcrumbs";

import {
  FacebookShareButton,
  FacebookIcon,
  WhatsappShareButton,
  WhatsappIcon,
} from "react-share";

import { useApiProduct } from "../hooks/useApiProduct";
import { useApiProducts } from "../hooks/useApiProducts";
import { mapApiProductToCard } from "../utils/productMapper";

// Historia + rekomendacje
import { addViewed, getViewed } from "../utils/history";
import Recommendations from "../components/Recommendations";

/* ===== Typy (lokalne) ===== */
type CardProduct = {
  id: string | number;
  slug: string;
  name: string;
  description: string;
  longDescription?: string;
  details?: string[];
  brand?: string;
  category?: string;
  categorySlug?: string;
  price: number;
  oldPrice?: number | null;
  rating?: number;
  promo?: boolean;
  stock?: number;
  image: string;
  galleryImages?: string[];
  featured?: boolean;
};
type ApiProduct = any;

type Crumb = { name: string; url: string };

/* ===== Stałe ===== */
const FREE_SHIPPING_FROM = 200;

/* ===== Pomocnicze ===== */
function seededInt(slug: string, min: number, max: number) {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) | 0;
  const rnd = Math.abs(Math.sin(h) * 10000) % 1;
  return Math.floor(rnd * (max - min + 1)) + min;
}

function getOrInitPromoEnd(slug: string) {
  const key = `promoEnd:${slug}`;
  const stored = typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
  if (stored) {
    const t = new Date(stored).getTime();
    if (!Number.isNaN(t) && t > Date.now()) return new Date(stored);
  }
  const days = 3 + (seededInt(slug, 0, 3) % 4);
  const end = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(key, end.toISOString());
    } catch {}
  }
  return end;
}

function formatTimeLeft(ms: number) {
  if (ms <= 0) return "zakończona";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  return `${m}m ${sec}s`;
}

function uniqBySlug<T extends { slug?: string }>(list: T[]) {
  const out: T[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const slug = item?.slug;
    if (!slug) continue;
    if (seen.has(slug)) continue;
    seen.add(slug);
    out.push(item);
  }
  return out;
}

/* ===== Props ===== */
interface ProductPageProps {
  setToast?: (msg: string) => void;
}

/* ===== Komponent ===== */
export default function ProductPage({ setToast }: ProductPageProps) {
  const { slug = "" } = useParams<{ slug: string }>();

  // pojedynczy produkt
  const { product: rawProduct, loading, error } = useApiProduct(slug);
  const product: CardProduct | null = useMemo(
    () => (rawProduct ? (mapApiProductToCard(rawProduct) as CardProduct) : null),
    [rawProduct]
  );

  // lista do podobnych / bundle / recently viewed
  const { items: allRaw } = useApiProducts({ page: 1, limit: 200 });
  const all: CardProduct[] = useMemo(
    () => allRaw.map((p: ApiProduct) => mapApiProductToCard(p) as CardProduct),
    [allRaw]
  );

  // szybkie wyszukiwanie produktu po slug
  const bySlug = useMemo(() => {
    const m: Record<string, CardProduct> = {};
    for (const p of all) {
      if (p?.slug) m[p.slug] = p as CardProduct;
    }
    return m;
  }, [all]);

  const { toggleWishlist, isInWishlist } = useWishlist() as any;
  const { addToCart } = useCart();

  const inWishlist = product ? !!isInWishlist(product.slug) : false;

  const [thumbsSwiper, setThumbsSwiper] = useState<SwiperType | null>(null);
  const [promoEnd, setPromoEnd] = useState<Date | null>(null);
  const [timeLeft, setTimeLeft] = useState("");
  const [stock, setStock] = useState(0);
  const [recentlyViewed, setRecentlyViewed] = useState<string[]>([]);

  const SITE_URL = (
    import.meta.env?.VITE_SITE_URL ||
    (typeof window !== "undefined" ? window.location.origin : "http://localhost:3000")
  ).replace(/\/+$/, "");
  const shareUrl = typeof window !== "undefined" ? window.location.href : "";
  const canonical = `${SITE_URL}/product/${product?.slug || ""}`;

  /* ===== JSON-LD ===== */
  const productJsonLd = useMemo(() => {
    if (!product) return null;

    const absImage = /^https?:\/\//.test(product.image)
      ? product.image
      : `${SITE_URL}${product.image.startsWith("/") ? "" : "/"}${product.image}`;

    const currentStock = typeof product.stock === "number" ? product.stock : stock;
    const availability =
      "https://schema.org/" + (currentStock > 0 ? "InStock" : "OutOfStock");

    const base: any = {
      "@context": "https://schema.org",
      "@type": "Product",
      name: product.name,
      description: product.description,
      image: [absImage],
      sku: product.slug,
      category: product.category,
      url: canonical,
      offers: {
        "@type": "Offer",
        priceCurrency: "PLN",
        price: product.price,
        availability,
        url: canonical,
      },
    };

    if (product.brand) {
      base.brand = { "@type": "Brand", name: product.brand };
    }
    if (typeof product.rating === "number") {
      base.aggregateRating = {
        "@type": "AggregateRating",
        ratingValue: product.rating,
        reviewCount: Math.max(1, Math.round((product.rating || 0) * 8)),
      };
    }
    return base;
  }, [product, canonical, SITE_URL, stock]);

  const breadcrumbsJsonLd = useMemo(() => {
    if (!product) return null;

    const items = [
      { "@type": "ListItem", position: 1, name: "Strona główna", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: "Kategorie", item: `${SITE_URL}/categories/wszystkie` },
    ];

    if (product.category && product.category.length > 0) {
      const catSlug = (product.categorySlug || product.category || "")
        .toString()
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-");
      items.push({
        "@type": "ListItem",
        position: 3,
        name: product.category,
        item: `${SITE_URL}/categories/${catSlug}`,
      });
      items.push({
        "@type": "ListItem",
        position: 4,
        name: product.name,
        item: canonical,
      });
    } else {
      items.push({
        "@type": "ListItem",
        position: 3,
        name: product.name,
        item: canonical,
      });
    }

    return {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: items,
    };
  }, [product, SITE_URL, canonical]);

  // ===== Podobne =====
  const similar = useMemo(() => {
    if (!product) return [];
    const baseCategory = (product.category || "").toLowerCase();
    const targetPrice = Number(product.price) || 0;

    const scored = all
      .filter((p) => p.slug !== product.slug)
      .map((p) => {
        let score = 0;
        if (String(p.category || "").toLowerCase() === baseCategory) score += 2;
        if (
          p.brand &&
          product.brand &&
          String(p.brand).toLowerCase() === String(product.brand).toLowerCase()
        )
          score += 1;
        if (Math.abs((Number(p.price) || 0) - targetPrice) <= 80) score += 1;
        if ((p as any).featured) score += 0.3;
        return { item: p, score };
      })
      .sort((a, b) => b.score - a.score)
      .map((x) => x.item);

    return uniqBySlug(scored).slice(0, 12);
  }, [all, product]);

  // ===== Bundle =====
  const bundle = useMemo(() => {
    if (!product) return [];
    const baseCategory = (product.category || "").toLowerCase();
    const pool = all.filter((p) => p.slug !== product.slug);

    const picked = pool
      .filter((p) => {
        const sameCat = String(p.category || "").toLowerCase() === baseCategory;
        const complement =
          (baseCategory.includes("dla niego") &&
            String(p.category || "").toLowerCase().includes("dla niej")) ||
          (baseCategory.includes("dla niej") &&
            String(p.category || "").toLowerCase().includes("dla niego"));
        return sameCat || complement || (p as any).featured;
      })
      .sort((a, b) => Number(a.price) - Number(b.price));

    return uniqBySlug(picked).slice(0, 3);
  }, [all, product]);

  // ===== GA view_item =====
  useEffect(() => {
    if (!product) return;
    try {
      if (typeof window !== "undefined" && (window as any).gtag) {
        (window as any).gtag("event", "view_item", {
          currency: "PLN",
          value: product.price,
          items: [{ item_id: product.slug, item_name: product.name, price: product.price }],
        });
      }
    } catch {}
  }, [product]);

  // ===== Licznik promocji =====
  useEffect(() => {
    if (!product) return;
    if (product.promo) {
      const end = getOrInitPromoEnd(product.slug);
      setPromoEnd(end);
      setTimeLeft(formatTimeLeft(end.getTime() - Date.now()));
      const t = setInterval(() => {
        setTimeLeft(formatTimeLeft(end.getTime() - Date.now()));
      }, 1000);
      return () => clearInterval(t);
    } else {
      setPromoEnd(null);
      setTimeLeft("");
    }
  }, [product]);

  // ===== Stany magazynowe (fallback) =====
  useEffect(() => {
    if (!product) return;
    const explicit = product.stock ?? null;
    if (explicit !== null && explicit !== undefined) {
      setStock(explicit);
    } else {
      setStock(seededInt(product.slug, 2, 15));
    }
  }, [product]);

  // ===== Historia (addViewed) + odświeżanie stanu + nasłuch storage =====
  useEffect(() => {
    if (!product?.slug) return;
    try {
      addViewed(product);
      // bierzemy świeżą historię, bez bieżącego produktu
      const arr = getViewed().filter((s: string) => s !== product.slug);
      setRecentlyViewed(arr);
    } catch {
      setRecentlyViewed([]);
    }

    const onStorage = (e: StorageEvent) => {
      if (e.key === "gs_viewed") {
        try {
          const arr = JSON.parse(e.newValue || "[]") as string[];
          setRecentlyViewed((arr || []).filter((s) => s !== product.slug));
        } catch {}
      }
    };
    if (typeof window !== "undefined") {
      window.addEventListener("storage", onStorage);
      return () => window.removeEventListener("storage", onStorage);
    }
  }, [product?.slug]);

  // dokładnie 4 ostatnie, w kolejności historii
  const lastViewedProducts = useMemo(() => {
    const uniq = Array.from(new Set(recentlyViewed)); // zachowuje kolejność
    return uniq.map((s: string) => bySlug[s]).filter(Boolean).slice(0, 4) as CardProduct[];
  }, [recentlyViewed, bySlug]);

  if (loading) {
    return <div className="text-center mt-20">Ładowanie…</div>;
  }
  if (error) {
    return <div className="text-center mt-20 text-red-600">{String(error)}</div>;
  }
  if (!product) {
    return (
      <div className="text-center mt-20 text-mainRed font-bold">Nie znaleziono produktu.</div>
    );
  }

  const galleryImages: string[] =
    Array.isArray(product.galleryImages) && product.galleryImages.length
      ? product.galleryImages
      : [
          product.image,
          "https://images.unsplash.com/photo-1503602642458-232111445657?auto=format&fit=crop&w=400&q=80",
          "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=400&q=80",
        ];

  const qualifiesFreeShip = Number(product.price) >= FREE_SHIPPING_FROM;

  // Swiper — pętle tylko gdy mamy wystarczająco slajdów
  const canLoopGallery = galleryImages.length > 1;

  // ustawienia „podobnych”: bez coverflow, stabilny FreeMode + Navigation + Pagination
  const similarBreakpoints = {
    0: { slidesPerView: 1 },
    640: { slidesPerView: 2 },
    1024: { slidesPerView: 4 },
  } as const;
  const maxSlidesPerView = 4;
  const canLoopSimilar = similar.length > maxSlidesPerView; // loop tylko jeśli mamy więcej niż max widocznych

  /* ===== Render ===== */
  return (
    <>
      <SeoHead
        title={`${product.name} - Gift Store`}
        description={product.description?.slice(0, 160) || "Szczegóły produktu"}
        image={product.image}
        canonical={canonical}
        type="product"
        jsonLd={
          [productJsonLd, breadcrumbsJsonLd].filter(Boolean) as object[]
        }
      />

      <Breadcrumbs
        items={
          [
            { name: "Home", url: "/" },
            { name: "Kategorie", url: "/categories/wszystkie" },
            product.category
              ? {
                  name: product.category,
                  url:
                    "/categories/" +
                    (product.categorySlug ||
                      product.category.toLowerCase().replace(/\s+/g, "-")),
                }
              : null,
            { name: product.name, url: `/product/${product.slug}` },
          ].filter(Boolean) as Crumb[]
        }
      />

      <div className="bg-white rounded-3xl shadow-xl p-6 sm:p-8 max-w-5xl mx-auto mt-8 border-2 border-gold relative">
        {/* Pasek statusów */}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          {product.promo && (
            <span className="inline-flex items-center gap-1 bg-gold text-mainRed font-bold px-2.5 py-1 rounded-lg border border-mainRed/20">
              Promocja
            </span>
          )}
          {qualifiesFreeShip && (
            <span className="inline-flex items-center gap-1 bg-emerald-600 text-white font-bold px-2.5 py-1 rounded-lg">
              Darmowa dostawa
            </span>
          )}
          {(typeof product.stock === "number" ? product.stock : stock) <= 3 && (
            <span className="inline-flex items-center gap-1 bg-red-600 text-white font-bold px-2.5 py-1 rounded-lg">
              Ostatnie sztuki
            </span>
          )}
        </div>

        {/* Tytuł + wishlist */}
        <div className="flex items-start justify-between mb-2">
          <h1 className="text-3xl md:text-4xl font-extrabold text-mainRed pr-4">{product.name}</h1>
          <button
            className="text-2xl"
            onClick={() => {
              (toggleWishlist as any)(product);
              setToast &&
                setToast(inWishlist ? "Usunięto z ulubionych" : "Dodano do ulubionych");
            }}
            title={inWishlist ? "Usuń z ulubionych" : "Dodaj do ulubionych"}
            aria-label={inWishlist ? "Usuń z ulubionych" : "Dodaj do ulubionych"}
          >
            {inWishlist ? (
              <FaHeart className="text-mainRed" />
            ) : (
              <FaRegHeart className="text-gray-400 hover:text-mainRed transition" />
            )}
          </button>
        </div>

        {/* Ocena */}
        <div className="flex items-center mb-6" aria-label={`Ocena: ${product.rating || 5} na 5`}>
          {[...Array(5)].map((_, idx) => (
            <FaStar
              key={`star-${idx}`}
              className={idx < (product.rating || 5) ? "text-gold" : "text-graySoft"}
            />
          ))}
        </div>

        {/* ===== Layout: mobile kolumna, od lg dwie kolumny ===== */}
        <div className="flex flex-col lg:flex-row gap-6 lg:gap-10">
          {/* Galeria */}
          <div className="w-full lg:w-[380px] mx-auto">
            <Swiper
              modules={[Navigation, Thumbs, Pagination]}
              navigation={canLoopGallery}
              pagination={{ clickable: true }}
              thumbs={thumbsSwiper && !thumbsSwiper.destroyed ? { swiper: thumbsSwiper } : undefined}
              spaceBetween={0}
              slidesPerView={1}
              loop={canLoopGallery}
              className="w-full h-[240px] sm:h-[260px] md:h-[300px] rounded-3xl overflow-hidden border-2 border-gray-300 hover:border-mainRed transition-all duration-300 cursor-zoom-in bg-bgUltraLight"
            >
              {galleryImages.map((img, i) => (
                <SwiperSlide key={`gal-${i}`}>
                  <img
                    src={img}
                    alt={`${product.name} - zdjęcie ${i + 1}`}
                    className="object-cover w-full h-full rounded-3xl"
                    loading="lazy"
                  />
                </SwiperSlide>
              ))}
            </Swiper>

            <Swiper
              modules={[Thumbs]}
              onSwiper={setThumbsSwiper}
              spaceBetween={8}
              slidesPerView={Math.min(galleryImages.length, 5)}
              watchSlidesProgress
              className="mt-2"
            >
              {galleryImages.map((img, i) => (
                <SwiperSlide key={`thumb-${i}`}>
                  <img
                    src={img}
                    alt={`miniatura ${i + 1}`}
                    className="cursor-pointer rounded-xl border-2 border-gray-300 object-cover w-14 h-14 sm:w-16 sm:h-16"
                    style={{ aspectRatio: "1 / 1" }}
                    loading="lazy"
                  />
                </SwiperSlide>
              ))}
            </Swiper>
          </div>

          {/* Info + CTA */}
          <div className="flex-1 flex flex-col">
            {/* Cena + darmowa dostawa + licznik */}
            <div className="mb-4">
              <div className="flex items-end gap-3">
                {product.promo && product.oldPrice && (
                  <span className="text-gray-400 font-bold line-through text-lg">
                    {product.oldPrice} zł
                  </span>
                )}
                <span className="text-4xl font-extrabold text-gold">{product.price} zł</span>
              </div>

              <div className="mt-2 text-sm">
                {qualifiesFreeShip ? (
                  <span className="text-emerald-700 font-bold">✓ Darmowa dostawa dla tego produktu</span>
                ) : (
                  <span className="text-gray-600">
                    Darmowa dostawa od{" "}
                    <span className="font-bold text-mainRed">{FREE_SHIPPING_FROM} zł</span> — dodaj za{" "}
                    <span className="font-bold">
                      {Math.max(0, FREE_SHIPPING_FROM - (Number(product.price) || 0))} zł
                    </span>
                    .
                  </span>
                )}
              </div>

              {product.promo && promoEnd && (
                <div className="mt-2 inline-flex items-center gap-2 bg-mainRed/10 text-mainRed border border-mainRed/30 px-3 py-1 rounded-lg font-bold">
                  ⏳ Promocja kończy się za {timeLeft}
                </div>
              )}
            </div>

            {/* Share */}
            <div className="flex items-center gap-3 mb-4">
              <FacebookShareButton url={shareUrl} hashtag="#GiftStore">
                <FacebookIcon size={36} round />
              </FacebookShareButton>
              <WhatsappShareButton url={shareUrl} title={product.name}>
                <WhatsappIcon size={36} round />
              </WhatsappShareButton>
              <button
                className="text-sm font-bold text-mainRed underline hover:text-gold"
                onClick={() => {
                  try {
                    if (navigator?.clipboard && shareUrl) {
                      navigator.clipboard.writeText(shareUrl);
                      setToast && setToast("Skopiowano link do schowka!");
                    }
                  } catch {}
                }}
              >
                Kopiuj link
              </button>
            </div>

            {/* Opis */}
            <div className="mb-6 text-gray-700 whitespace-pre-line leading-relaxed">
              {product.longDescription || product.description}
            </div>

            {/* Szczegóły */}
            {Array.isArray(product.details) && product.details.length > 0 && (
              <div className="mb-6">
                <h2 className="font-bold text-mainRed mb-3 text-xl">Szczegóły produktu:</h2>
                <ul className="list-disc list-inside text-gray-700 space-y-1">
                  {product.details.map((detail, i) => (
                    <li key={`det-${i}`}>{detail}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* CTA */}
            <button
              className="bg-gold text-mainRed font-bold px-10 py-4 rounded-xl hover:bg-mainRed hover:text-gold transition shadow-md border-2 border-gold hover:border-mainRed mb-4 w-full text-center transform hover:scale-105 active:scale-95 duration-300"
              onClick={() => {
                addToCart({ ...product, quantity: 1 });
                setToast && setToast("Dodano do koszyka!");
                try {
                  window.dispatchEvent(new Event("cart:add"));
                } catch {}
                try {
                  if (typeof window !== "undefined" && (window as any).gtag) {
                    (window as any).gtag("event", "add_to_cart", {
                      currency: "PLN",
                      value: product.price,
                      items: [{ item_id: product.slug, item_name: product.name, price: product.price }],
                    });
                  }
                } catch {}
              }}
              aria-label="Dodaj produkt do koszyka"
            >
              Dodaj do koszyka
            </button>

            <Link
              to="/"
              className="text-mainRed underline hover:text-gold transition font-semibold block text-center"
            >
              ← Wróć do sklepu
            </Link>
          </div>
        </div>
      </div>

      {/* Info sekcja */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center mt-6 text-sm">
        <div className="flex flex-col items-center">
          <span className="text-mainRed text-2xl mb-1">↩</span>
          <span>30 dni na zwrot</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-mainRed text-2xl mb-1">⚡</span>
          <span>Szybka dostawa 24h</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-mainRed text-2xl mb-1">🔒</span>
          <span>Bezpieczne płatności</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-mainRed text-2xl mb-1">🛡</span>
          <span>2 lata gwarancji</span>
        </div>
      </div>

      {/* Kup w zestawie (cross-sell) */}
      {bundle.length > 0 && (
        <section className="my-12">
          <h3 className="text-2xl font-bold text-mainRed mb-2 text-center">Kup w zestawie</h3>
          <p className="text-center text-gray-600 mb-6">
            Dobierz dodatki, które świetnie pasują do <span className="font-semibold">{product.name}</span>.
          </p>
          <div className="flex flex-wrap gap-6 justify-center">
            {bundle.map((p, i) => (
              <div key={`bundle-${i}-${p.slug}`} className="w-[300px]">
                <ProductCard product={p} setToast={setToast} fixedHeight={460} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Podobne produkty — NOWY bezpieczny swiper */}
      {similar.length > 0 && (
        <section className="my-12">
          <h3 className="text-2xl font-bold text-mainRed mb-6 text-center">Podobne produkty</h3>
          <div className="w-full max-w-[1800px] mx-auto overflow-hidden">
            <Swiper
              // klucz na długość, aby odświeżał się poprawnie przy zmianach ilości
              key={`similar-${similar.length}`}
              modules={[Navigation, Pagination, FreeMode, Autoplay]}
              freeMode={{ enabled: true, momentum: true }}
              spaceBetween={24}
              navigation
              pagination={{ clickable: true }}
              autoplay={similar.length > 6 ? { delay: 4200, disableOnInteraction: false } : false}
              breakpoints={similarBreakpoints}
              // loop tylko gdy jest więcej niż max widocznych
              loop={canLoopSimilar}
              className="pb-6"
            >
              {similar.map((p, i) => (
                <SwiperSlide key={`sim-${i}-${p.slug}`} className="flex justify-center items-stretch py-2 h-auto">
                  <div className="w-full max-w-[360px]">
                    <ProductCard product={p} setToast={setToast} large={false} scaleOnHover fixedHeight={480} />
                  </div>
                </SwiperSlide>
              ))}
            </Swiper>
          </div>
        </section>
      )}

      {/* Rekomendacje (cross-sell z rankerem) */}
     <Recommendations
        title="Powiązane propozycje"
        hint={`${product?.category || ""} ${product?.brand || ""}`.trim()}
        exclude={[product.slug]}
        mode="cross"
        count={8}      // maksymalnie 8
        rows={2}       // 2 pełne rzędy
        fillRows       // na 3-kolumnowym układzie będzie 6 (3+3), na 4-kolumnowym 8 (4+4)
      />

      {/* Ostatnio oglądane (z historii) */}
      {lastViewedProducts.length > 0 && (
        <section className="my-12">
          <h3 className="text-2xl font-bold text-mainRed mb-6 text-center">Ostatnio oglądane</h3>
          <div className="grid gap-6 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 max-w-6xl mx-auto">
            {lastViewedProducts.map((p) => (
              <ProductCard
                key={`rv-${p.slug}`}
                product={p}
                setToast={setToast}
                fixedHeight={460}
              />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
