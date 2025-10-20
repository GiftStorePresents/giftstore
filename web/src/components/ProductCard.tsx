// src/components/ProductCard.tsx
import React, { useEffect, useMemo, useState } from "react";
import { FaHeart, FaStar, FaTag, FaFire } from "react-icons/fa";
import { Link } from "react-router-dom";
import { useCart } from "../context/CartContext";
import type { CartItem } from "../context/CartContext";
import { API_BASE } from "../api";

/* =========================
   Typy pomocnicze
   ========================= */
type MediaItem = { url?: string };

export type CardProduct = {
  slug: string;
  name: string;
  description?: string;
  price?: number;          // preferowane
  priceCents?: number;     // alternatywa
  rating?: number;         // 0–5
  promo?: boolean;
  oldPrice?: number | string | null;
  bestseller?: boolean;
  stock?: number;
  image?: string;
  media?: MediaItem[];
  promoEnd?: string | Date; // ISO lub Date
};

type ProductCardProps = {
  product: CardProduct;
  setToast?: (msg: string) => void;
  large?: boolean;
  scaleOnHover?: boolean;
  /** Wymuś stałą wysokość całej karty (px), np. 480 */
  fixedHeight?: number;
};

/* =========================
   Wishlist (localStorage)
   ========================= */
function useWishlist() {
  const [wishlist, setWishlist] = useState<CardProduct[]>(() => {
    try {
      if (typeof window === "undefined") return [];
      return JSON.parse(localStorage.getItem("wishlist") || "[]");
    } catch {
      return [];
    }
  });

  const toggleWishlist = (product: CardProduct) => {
    let updated: CardProduct[];
    if (wishlist.find((item) => item.slug === product.slug)) {
      updated = wishlist.filter((item) => item.slug !== product.slug);
    } else {
      const { slug, name, price, priceCents } = product;
      updated = [...wishlist, { slug, name, price, priceCents } as CardProduct];
    }
    setWishlist(updated);
    try {
      localStorage.setItem("wishlist", JSON.stringify(updated));
      window.dispatchEvent(new Event("wishlist:toggle"));
    } catch {}
  };

  const isWishlisted = (product: CardProduct) =>
    wishlist.some((item) => item.slug === product.slug);

  return { toggleWishlist, isWishlisted };
}

/* =========================
   Helpery
   ========================= */

// 1) główny fallback – Twoje og-image z public/
const FALLBACK_IMG_FILE = "/og-image.jpg";

// 2) awaryjny fallback – inline SVG (bez requestów)
const FALLBACK_IMG_INLINE =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(`
  <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'>
    <defs>
      <linearGradient id='g' x1='0' x2='1' y1='0' y2='1'>
        <stop offset='0%' stop-color='#f9f7f6'/>
        <stop offset='100%' stop-color='#efeae8'/>
      </linearGradient>
    </defs>
    <rect width='200' height='200' rx='24' fill='url(#g)'/>
    <g>
      <rect x='30' y='92' width='140' height='70' rx='12' fill='#D7263D'/>
      <rect x='38' y='70' width='124' height='28' rx='10' fill='#D7263D'/>
      <rect x='96' y='62' width='8' height='108' rx='4' fill='#FFC857'/>
      <circle cx='86' cy='62' r='14' fill='#D7263D'/>
      <circle cx='114' cy='62' r='14' fill='#D7263D'/>
    </g>
  </svg>
`);

function absImageUrl(url?: string): string {
  if (!url) return "";
  return url.startsWith("http")
    ? url
    : `${API_BASE}${url.startsWith("/") ? url : `/${url}`}`;
}

/** Konwersja CardProduct -> CartItem */
const toCartItem = (p: CardProduct): CartItem => {
  return {
    ...(p as unknown as Omit<CartItem, "quantity">),
    quantity: 1,
  } as CartItem;
};

/* =========================
   Komponent
   ========================= */
export default function ProductCard({
  product,
  setToast,
  large = false,
  scaleOnHover = true,
  fixedHeight,
}: ProductCardProps) {
  const { addToCart } = useCart();
  const { toggleWishlist, isWishlisted } = useWishlist();
  const [hoverWish, setHoverWish] = useState(false);

  // Kandydat źródła obrazka (media[0].url > image)
  const candidateSrc = useMemo(() => {
    const candidate = product?.media?.[0]?.url || product?.image || "";
    return absImageUrl(candidate);
  }, [product]);

  // Aktualne źródło z dwustopniowym fallbackiem
  const [imgSrc, setImgSrc] = useState<string>(
    candidateSrc && candidateSrc.trim() ? candidateSrc : FALLBACK_IMG_FILE
  );
  useEffect(() => {
    setImgSrc(candidateSrc && candidateSrc.trim() ? candidateSrc : FALLBACK_IMG_FILE);
  }, [candidateSrc]);

  // Cena w PLN
  const priceZl = useMemo(() => {
    if (typeof product?.price === "number") return product.price!;
    if (typeof product?.priceCents === "number")
      return Math.max(0, Math.round(product.priceCents!) / 100);
    return 0;
  }, [product]);

  // Licznik promocji (minutowa aktualizacja)
  const [timeLeft, setTimeLeft] = useState("");
  useEffect(() => {
    if (!product?.promoEnd) return;

    const getDiffText = (end: Date) => {
      const diff = +end - Date.now();
      if (diff <= 0) return "Zakończona";
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((diff / (1000 * 60)) % 60);
      return `${days > 0 ? `${days}d ` : ""}${hours}h ${minutes}m`;
    };

    const end =
      typeof product.promoEnd === "string"
        ? new Date(product.promoEnd)
        : (product.promoEnd as Date);

    const update = () => setTimeLeft(getDiffText(end));
    update();
    const i = setInterval(update, 60 * 1000);
    return () => clearInterval(i);
  }, [product?.promoEnd]);

  // Wymiary / animacje (👈 zmniejszone obrazki)
  const cardHeightClass = large
    ? "min-h-[460px] sm:min-h-[480px]"
    : "min-h-[420px] sm:min-h-[440px]";

  const imageSize = large
    ? "w-36 h-36 sm:w-40 sm:h-40" // wcześniej 40/44 → subtelnie mniejsze
    : "w-32 h-32 sm:w-36 sm:h-36"; // wcześniej 36/40

  const scaleClass = scaleOnHover ? "hover:scale-105" : "hover:scale-[1.02]";

  return (
    <div
      className={`relative w-full max-w-xs ${cardHeightClass} flex flex-col
      bg-white dark:bg-surface rounded-3xl shadow-xl hover:shadow-gold
      ${scaleClass} transition-all duration-300 p-5 md:p-6 border-2 border-transparent
      hover:border-gold overflow-hidden group`}
      style={fixedHeight ? { height: `${fixedHeight}px` } : undefined}
    >
      {/* Dekoracyjny pasek u góry */}
      <div className="absolute left-0 top-0 w-full h-2 bg-gradient-to-r from-mainRed via-gold to-mainRed opacity-80 rounded-t-3xl" />

      {/* ❤️ Wishlist */}
      <button
        className="absolute top-4 right-4 z-20 transition-transform duration-200"
        title={isWishlisted(product) ? "Usuń z ulubionych" : "Dodaj do ulubionych"}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          toggleWishlist(product);
          setToast &&
            setToast(
              isWishlisted(product) ? "Usunięto z ulubionych" : "Dodano do ulubionych"
            );
        }}
        onMouseEnter={() => setHoverWish(true)}
        onMouseLeave={() => setHoverWish(false)}
        aria-label="Dodaj do ulubionych"
      >
        <FaHeart
          className={`text-2xl drop-shadow transition-all ${
            isWishlisted(product) ? "text-mainRed" : "text-gray-300"
          } ${hoverWish ? "scale-110" : ""}`}
          style={{ filter: hoverWish ? "drop-shadow(0 2px 8px #ffabab44)" : undefined }}
        />
      </button>

      {/* Rezerwacja miejsca na badge (stała wysokość) */}
      <div className="h-6 mb-3 flex items-center justify-center gap-2">
        {product?.promo && (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-gold/90 text-mainRed border border-gold/60">
            <FaTag /> Promocja
          </span>
        )}
        {product?.bestseller && (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-mainRed text-white border border-mainRed/70">
            <FaFire /> Bestseller
          </span>
        )}
      </div>

      {/* Treść karty */}
      <Link
        to={`/product/${product.slug}`}
        className="block w-full flex-1 flex flex-col"
        tabIndex={-1}
        aria-label={product.name}
        style={{ textDecoration: "none" }}
      >
        {/* Pole obrazka z dwustopniowym fallbackiem */}
        <div className="mx-auto mb-4 rounded-2xl shadow relative bg-gray-100 dark:bg-[#0f1424] flex items-center justify-center overflow-hidden">
          <img
            src={imgSrc}
            onError={() => {
              // jeśli plikowy fallback nie istnieje lub 404 – przełącz na inline i nie zapętlaj
              setImgSrc((prev) =>
                prev === FALLBACK_IMG_FILE ? FALLBACK_IMG_INLINE : prev || FALLBACK_IMG_INLINE
              );
            }}
            alt={product.name}
            width={176}
            height={176}
            className={`${imageSize} object-cover rounded-2xl group-hover:ring-4 group-hover:ring-gold transition-all duration-300 group-hover:brightness-110 shadow-md`}
            loading="lazy"
          />
        </div>

        {/* Tytuł */}
        <div className="font-bold text-base sm:text-lg text-mainRed dark:text-accent mb-1 text-center min-h-[44px] sm:min-h-[48px] flex items-center justify-center line-clamp-2 sm:line-clamp-3">
          {product.name}
        </div>

        {/* Opis */}
        <div className="text-gray-600 dark:text-muted text-sm text-center line-clamp-2 sm:line-clamp-3 min-h-[40px] sm:min-h-[48px]">
          {product.description}
        </div>

        {/* Ocena */}
        <div className="flex items-center justify-center mt-2" aria-label={`Ocena: ${product?.rating ?? 0} na 5`}>
          {[...Array(5)].map((_, idx) => (
            <FaStar
              key={idx}
              className={idx < (product?.rating ?? 0) ? "text-gold" : "text-graySoft"}
            />
          ))}
        </div>

        {/* Cena + rabat */}
        <div className="mt-2 text-center min-h-[30px]">
          {product?.promo && product?.oldPrice && (
            <span className="text-gray-400 font-semibold line-through mr-2">
              {Number(product.oldPrice).toFixed(2)} zł
            </span>
          )}
          <span className="text-lg sm:text-xl font-semibold sm:font-bold text-gold [text-shadow:0_1px_2px_rgba(0,0,0,.2)]">
            {priceZl.toFixed(2)} zł
          </span>
        </div>

        {/* Informacje dodatkowe (promo / stock) */}
        <div className="min-h-[20px] mt-1 text-center">
          {product?.promoEnd && (
            <span className="text-xs text-mainRed font-bold">
              Promocja kończy się za {timeLeft}
            </span>
          )}
          {!product?.promoEnd && typeof product?.stock === "number" && product.stock <= 3 && (
            <span className="text-xs text-red-600 font-bold">
              Zostały tylko {product.stock} sztuki!
            </span>
          )}
        </div>
      </Link>
      {/* CTA przyklejone do dołu karty */}
      <button
        className="mt-auto bg-gradient-to-r from-gold to-yellow-400 text-mainRed font-bold px-6 py-2 rounded-xl hover:from-mainRed hover:to-mainRed hover:text-gold transition shadow-md border-2 border-gold hover:border-mainRed"
        style={{ letterSpacing: "0.03em" }}
        onClick={() => {
          addToCart(toCartItem(product));
          setToast && setToast("Dodano do koszyka!");
          try {
            window.dispatchEvent(new Event("cart:add"));
          } catch {}
        }}
      >
        Dodaj do koszyka
      </button>
    </div>
  );
}