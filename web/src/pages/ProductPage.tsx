// src/pages/ProductPage.tsx
import type React from "react";
import { useState, useMemo, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { FaStar, FaHeart, FaRegHeart } from "react-icons/fa";
import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, Pagination, Thumbs, FreeMode } from "swiper/modules";
import type { Swiper as SwiperType } from "swiper";

import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";
import "swiper/css/thumbs";
import "swiper/css/free-mode";

import ProductCard from "../components/ProductCard";
import SimilarSlider from "../components/SimilarSlider";
import { useWishlist, type WishlistContextValue } from "../context/WishlistContext";
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

import { addViewed, getViewed } from "../utils/history";

// ⭐ API_BASE + helper ciastka (jak w LoginPage)
import { API_BASE } from "../api";
function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(
    new RegExp(`(?:^|; )${name.replace(/([.*+?^${}()|[\\]\\\\])/g, "\\$1")}=([^;]*)`)
  );
  return m ? decodeURIComponent(m[1]) : null;
}
const CSRF_COOKIE_NAME = "csrf";

/* ============== Typy ============== */
type CategoryLike =
  | string
  | {
      id?: string;
      name?: string;
      slug?: string;
    }
  | null
  | undefined;

type CardProduct = {
  id: string | number;
  slug: string;
  name: string;
  description: string;
  longDescription?: string;
  details?: string[];
  brand?: string;
  /** Może być string LUB obiekt relacyjny — dlatego helpery poniżej */
  category?: CategoryLike;
  /** Jeżeli mapper już zapewnia slug — użyjemy, ale i tak mamy fallback */
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

/* ============== Stałe / utils ============== */
const FREE_SHIPPING_FROM = 200;
const REL_MIN = 260;

function slugify(s: string) {
  return (s || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** Zwraca slug kategorii niezależnie od formatu */
function getCategorySlug(p?: { category?: CategoryLike; categorySlug?: string }) {
  if (!p) return "";
  if (typeof p.categorySlug === "string" && p.categorySlug.trim()) return slugify(p.categorySlug);
  const c = p.category;
  if (typeof c === "string") return slugify(c);
  if (c && typeof c === "object") {
    if (c.slug) return slugify(c.slug);
    if (c.name) return slugify(c.name);
  }
  return "";
}

/** Zwraca nazwę kategorii do wyświetlenia */
function getCategoryName(p?: { category?: CategoryLike }) {
  if (!p) return "";
  const c = p.category;
  if (typeof c === "string") return c;
  if (c && typeof c === "object") return c.name || c.slug || "";
  return "";
}

/** Porównanie produktów po kategorii (po slugach) */
function sameCategory(a?: { category?: CategoryLike; categorySlug?: string }, b?: { category?: CategoryLike; categorySlug?: string }) {
  return getCategorySlug(a) && getCategorySlug(a) === getCategorySlug(b);
}

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
  try {
    window.localStorage.setItem(key, end.toISOString());
  } catch {}
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
  const set = new Set<string>();
  for (const it of list) {
    const s = it?.slug;
    if (!s || set.has(s)) continue;
    set.add(s);
    out.push(it);
  }
  return out;
}

/* ============== Hook: 4→3→2/4→1/4 dla siatek Bundle/LastViewed ============== */
function useGridPlan() {
  const get = () => {
    const w = typeof window !== "undefined" ? window.innerWidth : 1920;
    if (w >= 1280) return { cols: 4, show: 4 };
    if (w >= 1024) return { cols: 3, show: 3 };
    if (w >= 768) return { cols: 2, show: 4 };
    return { cols: 1, show: 4 };
  };
  const [plan, setPlan] = useState(get);
  useEffect(() => {
    const onR = () => setPlan(get());
    window.addEventListener("resize", onR);
    return () => window.removeEventListener("resize", onR);
  }, []);
  return plan;
}

/* ============== Hook: Powiązane propozycje 8 / 9 / 8 / 8 ============== */
function useRelatedPlan() {
  const get = () => {
    const w = typeof window !== "undefined" ? window.innerWidth : 1920;
    if (w >= 1280) return { cols: 4, count: 8 }; // 4+4
    if (w >= 1024) return { cols: 3, count: 9 }; // 3+3+3
    if (w >= 768) return { cols: 2, count: 8 }; // 2+2+2+2
    return { cols: 1, count: 8 }; // 1×8
  };
  const [state, setState] = useState(get);
  useEffect(() => {
    const onR = () => setState(get());
    window.addEventListener("resize", onR);
    return () => window.removeEventListener("resize", onR);
  }, []);
  return state;
}

/* ============== Strona produktu ============== */
interface ProductPageProps {
  setToast?: (msg: string) => void;
}

export default function ProductPage({ setToast }: ProductPageProps) {
  const { slug = "" } = useParams<{ slug: string }>();

  const { product: rawProduct, loading, error } = useApiProduct(slug);
  const product: CardProduct | null = useMemo(
    () => (rawProduct ? (mapApiProductToCard(rawProduct) as CardProduct) : null),
    [rawProduct]
  );

  const { items: allRaw } = useApiProducts({ page: 1, limit: 200 });
  const all: CardProduct[] = useMemo(
    () => allRaw.map((p: ApiProduct) => mapApiProductToCard(p) as CardProduct),
    [allRaw]
  );
  const bySlug = useMemo(() => {
    const m: Record<string, CardProduct> = {};
    for (const p of all) if (p?.slug) m[p.slug] = p as CardProduct;
    return m;
  }, [all]);

  const { toggleWishlist, isInWishlist } = useWishlist() as WishlistContextValue;
  const { addToCart } = useCart();
  const inWishlist = product ? !!isInWishlist(product.slug) : false;

  const [thumbsSwiper, setThumbsSwiper] = useState<SwiperType | null>(null);
  const [promoEnd, setPromoEnd] = useState<Date | null>(null);
  const [timeLeft, setTimeLeft] = useState("");
  const [stock, setStock] = useState(0);
  // A) isOut – po stanie stock:
  const isOut = (typeof product?.stock === "number" ? product!.stock : stock) <= 0;

  const [recentlyViewed, setRecentlyViewed] = useState<string[]>([]);

  const SITE_URL = (
    import.meta.env?.VITE_SITE_URL ||
    (typeof window !== "undefined" ? window.location.origin : "http://localhost:3000")
  ).replace(/\/+$/, "");
  const shareUrl = typeof window !== "undefined" ? window.location.href : "";
  const canonical = `${SITE_URL}/product/${product?.slug || ""}`;

  const catSlug = product ? getCategorySlug(product) : "";
  const catName = product ? getCategoryName(product) : "";

  /* JSON-LD */
  const productJsonLd = useMemo(() => {
    if (!product) return null;
    const absImage = /^https?:\/\//.test(product.image)
      ? product.image
      : `${SITE_URL}${product.image.startsWith("/") ? "" : "/"}${product.image}`;
    const currentStock = typeof product.stock === "number" ? product.stock : stock;

    const base: any = {
      "@context": "https://schema.org",
      "@type": "Product",
      name: product.name,
      description: product.description,
      image: [absImage],
      sku: product.slug,
      category: catName || catSlug,
      url: canonical,
      offers: {
        "@type": "Offer",
        priceCurrency: "PLN",
        price: product.price,
        availability: "https://schema.org/" + (currentStock > 0 ? "InStock" : "OutOfStock"),
        url: canonical,
      },
    };

    if (product.brand) base.brand = { "@type": "Brand", name: product.brand };
    if (typeof product.rating === "number") {
      base.aggregateRating = {
        "@type": "AggregateRating",
        ratingValue: product.rating,
        reviewCount: Math.max(1, Math.round((product.rating || 0) * 8)),
      };
    }
    return base;
  }, [product, canonical, SITE_URL, stock, catName, catSlug]);

  const breadcrumbsJsonLd = useMemo(() => {
    if (!product) return null;
    const items: any[] = [
      { "@type": "ListItem", position: 1, name: "Strona główna", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: "Kategorie", item: `${SITE_URL}/categories/wszystkie` },
    ];
    if (catName || catSlug) {
      items.push({
        "@type": "ListItem",
        position: 3,
        name: catName || catSlug,
        item: `${SITE_URL}/categories/${catSlug || "wszystkie"}`,
      });
      items.push({ "@type": "ListItem", position: 4, name: product.name, item: canonical });
    } else {
      items.push({ "@type": "ListItem", position: 3, name: product.name, item: canonical });
    }
    return { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: items };
  }, [product, SITE_URL, canonical, catName, catSlug]);

  /* listy: podobne / bundle / historia */
  const similar = useMemo(() => {
    if (!product) return [];
    const targetPrice = Number(product.price) || 0;

    const scored = all
      .filter((p) => p.slug !== product.slug)
      .map((p) => {
        let score = 0;
        if (sameCategory(p, product)) score += 2;
        if (p.brand && product.brand && String(p.brand).toLowerCase() === String(product.brand).toLowerCase())
          score += 1;
        if (Math.abs((Number(p.price) || 0) - targetPrice) <= 80) score += 1;
        if ((p as any).featured) score += 0.3;
        return { item: p, score };
      })
      .sort((a, b) => b.score - a.score)
      .map((x) => x.item);

    return uniqBySlug(scored).slice(0, 12);
  }, [all, product]);

  const bundle = useMemo(() => {
    if (!product) return [];
    const baseSlug = getCategorySlug(product);
    const pool = all.filter((p) => p.slug !== product.slug);

    const picked = pool
      .filter((p) => {
        const sameCat = sameCategory(p, product);
        const cat = getCategorySlug(p);
        const complement =
          (baseSlug.includes("dla-niego") && cat.includes("dla-niej")) ||
          (baseSlug.includes("dla-niej") && cat.includes("dla-niego"));
        return sameCat || complement || (p as any).featured;
      })
      .sort((a, b) => Number(a.price) - Number(b.price));

    return uniqBySlug(picked).slice(0, 8);
  }, [all, product]);

  /* GA view */
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

  /* Promocja – timer */
  useEffect(() => {
    if (!product) return;
    if (product.promo) {
      const end = getOrInitPromoEnd(product.slug);
      setPromoEnd(end);
      setTimeLeft(formatTimeLeft(end.getTime() - Date.now()));
      const t = setInterval(() => setTimeLeft(formatTimeLeft(end.getTime() - Date.now())), 1000);
      return () => clearInterval(t);
    } else {
      setPromoEnd(null);
      setTimeLeft("");
    }
  }, [product]);

  /* Stock (symulacja / podkład) */
  useEffect(() => {
    if (!product) return;
    const explicit = product.stock ?? null;
    if (explicit !== null && explicit !== undefined) setStock(explicit);
    else setStock(seededInt(product.slug, 2, 15));
  }, [product]);

  /* Historia: ostatnio oglądane */
  useEffect(() => {
    if (!product?.slug) return;
    try {
      addViewed(product);
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
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [product?.slug]);

  const lastViewedProducts = useMemo(() => {
    const uniq = Array.from(new Set(recentlyViewed));
    return uniq.map((s: string) => bySlug[s]).filter(Boolean) as CardProduct[];
  }, [recentlyViewed, bySlug]);

  /* Stany błędów */
  if (loading) return <div className="text-center mt-20">Ładowanie…</div>;
  if (error) return <div className="text-center mt-20 text-red-600">{String(error)}</div>;
  if (!product) return <div className="text-center mt-20 text-mainRed font-bold">Nie znaleziono produktu.</div>;

  /* Galeria */
  const galleryImages: string[] =
    Array.isArray(product.galleryImages) && product.galleryImages.length
      ? product.galleryImages
      : [
          product.image,
          "https://images.unsplash.com/photo-1503602642458-232111445657?auto=format&fit=crop&w=800&q=80",
          "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=800&q=80",
        ];

  const qualifiesFreeShip = Number(product.price) >= FREE_SHIPPING_FROM;
  const canLoopGallery = galleryImages.length > 1;

  const ArrowStyles = () => (
    <style>{`
      .swiper-nav--pretty .swiper-button-prev,
      .swiper-nav--pretty .swiper-button-next{
        width:42px;height:42px;border-radius:999px;
        background:#fff;color:var(--mainRed,#d7263d);
        box-shadow:0 8px 22px rgba(0,0,0,.12), inset 0 0 0 1.5px rgba(215,38,61,.25);
      }
      .swiper-nav--pretty .swiper-button-prev:after,
      .swiper-nav--pretty .swiper-button-next:after{ font-size:18px;font-weight:900; }
      .swiper-nav--pretty .swiper-button-prev:hover,
      .swiper-nav--pretty .swiper-button-next:hover{ filter:brightness(1.05); transform:translateY(-1px); }
      .swiper-nav--pretty .swiper-button-disabled{ opacity:.35!important; cursor:not-allowed; }
    `}</style>
  );

  return (
    <>
      <SeoHead
        title={`${product.name} - Gift Store`}
        description={product.description?.slice(0, 160) || "Szczegóły produktu"}
        image={product.image}
        canonical={canonical}
        type="product"
        jsonLd={[productJsonLd, breadcrumbsJsonLd].filter(Boolean) as object[]}
      />
      <ArrowStyles />

      <Breadcrumbs
        items={
          [
            { name: "Home", url: "/" },
            { name: "Kategorie", url: "/categories/wszystkie" },
            catName || catSlug
              ? {
                  name: catName || catSlug,
                  url: `/categories/${catSlug || "wszystkie"}`,
                }
              : null,
            { name: product.name, url: `/product/${product.slug}` },
          ].filter(Boolean) as Crumb[]
        }
      />

      {/* Główna karta produktu */}
      <div className="max-w-[1120px] mx-auto w-full px-3 sm:px-4">
        <section className="bg-white rounded-3xl shadow-xl p-5 sm:p-7 mt-6 border-2 border-gold relative">
          {/* Statusy */}
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
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
            {!isOut && (typeof product.stock === "number" ? product.stock : stock) <= 3 && (
              <span className="inline-flex items-center gap-1 bg-red-600 text-white font-bold px-2.5 py-1 rounded-lg">
                Ostatnie sztuki
              </span>
            )}
            {isOut && (
              <span className="inline-flex items-center gap-1 bg-gray-400 text-white font-bold px-2.5 py-1 rounded-lg">
                Wyprzedane
              </span>
            )}
          </div>

          {/* Tytuł + wishlist */}
          <div className="flex items-start justify-between mb-2">
            <h1 className="text-3xl md:text-4xl font-extrabold text-mainRed pr-4">{product.name}</h1>
            <button
              className="text-2xl"
              onClick={() => {
                (toggleWishlist as WishlistContextValue["toggleWishlist"])(product);
                setToast && setToast(inWishlist ? "Usunięto z ulubionych" : "Dodano do ulubionych");
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
          <div className="flex items-center mb-5" aria-label={`Ocena: ${product.rating || 5} na 5`}>
            {[...Array(5)].map((_, idx) => (
              <FaStar key={`star-${idx}`} className={idx < (product.rating || 5) ? "text-gold" : "text-graySoft"} />
            ))}
          </div>

          {/* Layout 2 kolumny od lg */}
          <div className="flex flex-col lg:flex-row gap-6 lg:gap-10">
            {/* Galeria */}
            <div className="w-full lg:w-[420px] mx-auto">
              <div className="rounded-3xl overflow-hidden border-2 border-gray-300 hover:border-mainRed transition">
                <Swiper
                  modules={[Navigation, Thumbs, Pagination]}
                  navigation={canLoopGallery}
                  pagination={{ clickable: true }}
                  thumbs={thumbsSwiper && !thumbsSwiper.destroyed ? { swiper: thumbsSwiper } : undefined}
                  loop={canLoopGallery}
                  autoHeight
                  className="swiper-nav--pretty"
                >
                  {galleryImages.map((img, i) => (
                    <SwiperSlide key={`gal-${i}`}>
                      <div className="w-full aspect-[4/3] md:aspect-[16/10] bg-bgUltraLight">
                        <img
                          src={img}
                          alt={`${product.name} - zdjęcie ${i + 1}`}
                          className="object-cover w-full h-full"
                          loading="lazy"
                        />
                      </div>
                    </SwiperSlide>
                  ))}
                </Swiper>
              </div>

              {/* Miniatury */}
              <Swiper
                modules={[Thumbs, FreeMode]}
                onSwiper={setThumbsSwiper}
                freeMode
                spaceBetween={10}
                slidesPerView={"auto"}
                watchSlidesProgress
                className="mt-3 pl-1"
              >
                {galleryImages.map((img, i) => (
                  <SwiperSlide key={`thumb-${i}`} style={{ width: 68 }}>
                    <img
                      src={img}
                      alt={`miniatura ${i + 1}`}
                      className="cursor-pointer rounded-xl border-2 border-gray-300 object-cover w-[68px] h-[68px]"
                      loading="lazy"
                    />
                  </SwiperSlide>
                ))}
              </Swiper>
            </div>

            {/* Info + CTA */}
            <div className="flex-1 flex flex-col">
              <div className="mb-4">
                <div className="flex items-end gap-3">
                  {product.promo && product.oldPrice && (
                    <span className="text-gray-400 font-bold line-through text-lg">{product.oldPrice} zł</span>
                  )}
                  <span className="text-4xl font-extrabold text-gold">{product.price} zł</span>
                </div>

                <div className="mt-2 text-sm">
                  {qualifiesFreeShip ? (
                    <span className="text-emerald-700 font-bold">✓ Darmowa dostawa dla tego produktu</span>
                  ) : (
                    <span className="text-gray-600">
                      Darmowa dostawa od <span className="font-bold text-mainRed">{FREE_SHIPPING_FROM} zł</span> — dodaj
                      za <span className="font-bold">{Math.max(0, FREE_SHIPPING_FROM - (Number(product.price) || 0))} zł</span>.
                    </span>
                  )}
                </div>

                {product.promo && promoEnd && (
                  <div className="mt-2 inline-flex items-center gap-2 bg-mainRed/10 text-mainRed border border-mainRed/30 px-3 py-1 rounded-lg font-bold">
                    ⏳ Promocja kończy się za {timeLeft}
                  </div>
                )}
              </div>

              {/* Opis */}
              <div className="mb-6 text-gray-700 whitespace-pre-line leading-relaxed">
                {product.longDescription || product.description}
              </div>

              {/* C) CTA: Dodaj / Niedostępny + Powiadom mnie */}
              {!isOut ? (
                <button
                  className="bg-gold text-mainRed font-bold px-8 py-4 rounded-xl hover:bg-mainRed hover:text-gold transition shadow-md border-2 border-gold hover:border-mainRed mb-4 w-full text-center transform hover:scale-105 active:scale-95 duration-300"
                  onClick={() => {
                    addToCart({ ...product, quantity: 1 });
                    setToast && setToast("Dodano do koszyka!");
                    try { window.dispatchEvent(new Event("cart:add")); } catch {}
                    try {
                      if ((window as any).gtag) {
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
              ) : (
                <div className="space-y-2 mb-4">
                  <button
                    className="w-full px-8 py-4 rounded-xl font-bold border-2 cursor-not-allowed bg-gray-200 text-gray-500 border-gray-300"
                    aria-disabled
                    title="Produkt jest chwilowo niedostępny"
                  >
                    Niedostępny
                  </button>

                  {/* D) Powiadom mnie */}
                  <NotifyMeButton
                    productSlug={product.slug}
                    productName={product.name}
                    setToast={setToast}
                  />
                </div>
              )}

              <Link to="/" className="text-mainRed underline hover:text-gold transition font-semibold block text-center">
                ← Wróć do sklepu
              </Link>
            </div>
          </div>
        </section>
      </div>

      {/* Ikony zalet */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center mt-6 text-sm max-w-[1120px] mx-auto px-3 sm:px-4">
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

      {/* Sekcje pod kartą */}
      {bundle.length > 0 && (
        <BundleSection products={bundle} setToast={setToast} hostProductName={product?.name || ""} />
      )}
      {similar.length > 0 && <SimilarSlider title="Podobne produkty" products={similar} setToast={setToast} />}
      <RelatedSection all={all} currentSlug={product?.slug || ""} />
      {lastViewedProducts.length > 0 && <LastViewedSection items={lastViewedProducts} setToast={setToast} />}
    </>
  );
}

/* ============== Sekcje siatki (bundle/last/related) ============== */
function BundleSection({
  products,
  setToast,
  hostProductName,
}: {
  products: CardProduct[];
  setToast?: (msg: string) => void;
  hostProductName: string;
}) {
  const { cols, show } = useGridPlan();
  const visible = useMemo(() => products.slice(0, show), [products, show]);
  if (!visible.length) return null;

  return (
    <section className="my-12 max-w-[1320px] mx-auto px-4 md:px-6 xl:px-0">
      <h3 className="text-2xl font-bold text-mainRed mb-2 text-center">Kup w zestawie</h3>
      <p className="text-center text-gray-600 mb-6">
        Dobierz dodatki, które świetnie pasują do <span className="font-semibold">{hostProductName}</span>.
      </p>

      <div
        className={`grid gap-6 ${
          cols === 4 ? "grid-cols-4" : cols === 3 ? "grid-cols-3" : cols === 2 ? "grid-cols-2" : "grid-cols-1"
        }`}
        style={{ gridAutoRows: "1fr" }}
      >
        {visible.map((p) => (
          <div key={`bundle-${p.slug}`} className="w-full max-w-[360px] mx-auto h-full">
            <ProductCard product={p} setToast={setToast} fixedHeight={490} />
          </div>
        ))}
      </div>
    </section>
  );
}

function LastViewedSection({
  items,
  setToast,
}: {
  items: CardProduct[];
  setToast?: (msg: string) => void;
}) {
  const { cols, show } = useGridPlan();
  const visible = useMemo(() => items.slice(0, show), [items, show]);
  if (!visible.length) return null;

  return (
    <section className="my-12 max-w-[1320px] mx-auto px-4 md:px-6 xl:px-0">
      <h3 className="text-2xl font-bold text-mainRed mb-6 text-center">Ostatnio oglądane</h3>
      <div
        className={`grid gap-6 ${
          cols === 4 ? "grid-cols-4" : cols === 3 ? "grid-cols-3" : cols === 2 ? "grid-cols-2" : "grid-cols-1"
        }`}
        style={{ gridAutoRows: "1fr" }}
      >
        {visible.map((p) => (
          <div key={`rv-${p.slug}`} className="w-full max-w-[360px] mx-auto h-full">
            {/* ⬇️ Podniesiona wysokość + rozciąganie wrappera */}
            <ProductCard product={p} setToast={setToast} fixedHeight={500} />
          </div>
        ))}
      </div>
    </section>
  );
}

/* ============== Powiązane propozycje — 8 / 9 / 8 / 8 ============== */
function RelatedSection({ all, currentSlug }: { all: CardProduct[]; currentSlug: string }) {
  const { cols, count } = useRelatedPlan();

  const list = useMemo(() => all.filter((p) => p.slug !== currentSlug).slice(0, count), [all, currentSlug, count]);

  if (!list.length) return null;

  return (
    <section className="my-12 max-w={[1320]} mx-auto px-4 md:px-6 xl:px-0">
      <h3 className="text-2xl font-bold text-mainRed mb-4">Powiązane propozycje</h3>
      <div
        className={`grid gap-5 ${
          cols === 4 ? "grid-cols-4" : cols === 3 ? "grid-cols-3" : cols === 2 ? "grid-cols-2" : "grid-cols-1"
        }`}
        style={{ gridAutoRows: "1fr", minWidth: REL_MIN }}
      >
        {list.map((p) => (
          <article
            key={`rel-${p.slug}`}
            className="rounded-2xl border-2 border-gold bg-white shadow-sm overflow-hidden transition hover:shadow-md"
          >
            <Link to={`/product/${p.slug}`} className="block">
              <div className="aspect-[16/10] w-full bg-bgUltraLight">
                <img src={p.image} alt={p.name} className="w-full h-full object-cover" loading="lazy" />
              </div>
            </Link>
            <div className="p-4">
              <Link to={`/product/${p.slug}`} className="font-semibold text-mainRed hover:underline">
                {p.name}
              </Link>
              <p className="mt-1 text-sm text-gray-600 line-clamp-2">{p.description}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

/* ====================== D) NotifyMeButton ====================== */
function NotifyMeButton({
  productSlug,
  productName,
  setToast,
}: {
  productSlug: string;
  productName: string;
  setToast?: (msg: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);

  async function submit() {
    const mail = (email || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
      setToast && setToast("Podaj poprawny adres e-mail.");
      return;
    }
    setBusy(true);
    try {
      // === request jak w LoginPage ===
      const csrf = getCookie(CSRF_COOKIE_NAME);
      const res = await fetch(`${API_BASE}/api/notify/back-in-stock`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(csrf ? { "X-CSRF-Token": csrf } : {}),
        },
        body: JSON.stringify({ email: mail, slug: productSlug, name: productName }),
      });

      if (!res.ok) {
        let text = await res.text().catch(() => "");
        if (res.status === 403 && !text) {
          text = "Odrzucono z powodu CSRF. Odśwież stronę i spróbuj ponownie.";
        }
        if (res.status === 429) text ||= "Poczekaj chwilę przed ponowną próbą.";
        throw new Error(text || "Nie udało się zapisać zgłoszenia.");
      }

      // lokalny cache
      try {
        const key = "notify:back-in-stock";
        const arr = JSON.parse(localStorage.getItem(key) || "[]");
        arr.push({ slug: productSlug, email: mail, ts: Date.now() });
        localStorage.setItem(key, JSON.stringify(arr));
      } catch {}

      setOk(true);
      setToast && setToast("Zgłoszenie zapisane. Powiadomimy, gdy wróci!");
    } catch (e: any) {
      // fallback mailto (gdy backend niedostępny)
      const admin = "admin@giftstore.pl";
      const subj = encodeURIComponent("Prośba o powiadomienie: produkt niedostępny");
      const body = encodeURIComponent(
        `Proszę o powiadomienie, gdy produkt wróci na stan.\n\nProdukt: ${productName}\nSlug: ${productSlug}\nE-mail: ${mail}\n`
      );
      try {
        window.location.href = `mailto:${admin}?subject=${subj}&body=${body}`;
      } catch {}
      setToast && setToast(e?.message || "Nie udało się wysłać zgłoszenia.");
    } finally {
      setBusy(false);
    }
  }

  if (ok) {
    return (
      <div className="text-sm text-emerald-700 dark:text-emerald-300 font-semibold">
        Dziękujemy! Damy znać, gdy produkt będzie ponownie dostępny.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
      <input
        type="email"
        placeholder="Twój e-mail (powiadomimy, gdy wróci)"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="px-3 py-3 rounded-xl border border-gray-300 dark:border-white/20 dark:bg-white/10 outline-none focus:border-mainRed"
      />
      <button
        onClick={submit}
        disabled={busy}
        className="px-4 py-3 rounded-xl font-bold bg-mainRed text-white hover:bg-gold hover:text-mainRed transition disabled:opacity-60"
        aria-label="Powiadom mnie, gdy będzie na stanie"
      >
        {busy ? "Wysyłanie…" : "Powiadom mnie"}
      </button>
    </div>
  );
}
