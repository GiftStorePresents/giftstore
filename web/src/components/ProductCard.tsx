// src/components/ProductCard.tsx
import React, { useEffect, useMemo, useState } from "react";
import { FaHeart, FaStar, FaTag, FaFire } from "react-icons/fa";
import { Link } from "react-router-dom";
import { useCart } from "../context/CartContext";
import type { CartItem } from "../context/CartContext";
import { API_BASE } from "../api";
import { useWishlist } from "../context/WishlistContext";

/* =========================
   Typy pomocnicze
   ========================= */
type MediaItem = { url?: string };

export type CardProduct = {
  slug: string;
  name: string;
  description?: string;
  price?: number; // preferowane
  priceCents?: number; // alternatywa
  rating?: number; // 0–5
  promo?: boolean;
  oldPrice?: number | string | null;
  bestseller?: boolean;
  stock?: number;
  image?: string;
  media?: MediaItem[];
  promoEnd?: string | Date; // ISO lub Date

  // 🔹 opcjonalne (rabat wariantu)
  discountActive?: boolean;
  salePriceCents?: number | null;
  showDiscountPercent?: boolean;
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
   Helpery
   ========================= */

// 1) główny fallback – og-image z public/
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

// 🔹 formatowanie cen w groszach
const fmt = (cents?: number | null) =>
  typeof cents === "number" ? (cents / 100).toFixed(2) + " zł" : "—";

const percentOff = (orig?: number | null, sale?: number | null) => {
  if (
    typeof orig !== "number" ||
    typeof sale !== "number" ||
    orig <= 0 ||
    sale >= orig
  )
    return null;
  return Math.round((1 - sale / orig) * 100);
};

// 🔧 nie doklejaj API_BASE do ścieżek zaczynających się od "/"
function absImageUrl(url?: string): string {
  if (!url) return "";
  if (url.startsWith("http")) return url;
  if (url.startsWith("/")) return url;
  return `${API_BASE}/${url}`;
}

/** Konwersja CardProduct -> CartItem */
const toCartItem = (p: CardProduct): CartItem => {
  return {
    ...(p as unknown as Omit<CartItem, "quantity">),
    quantity: 1,
  } as CartItem;
};

/** ✅ promoEnd: string | Date -> string | undefined (zgodnie z WishlistItem) */
const toIsoOrUndef = (v?: string | Date) =>
  v instanceof Date ? v.toISOString() : typeof v === "string" ? v : undefined;

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

  // ✅ globalny wishlist
  const { toggleWishlist, isInWishlist, wishlist } = useWishlist();

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
    setImgSrc(
      candidateSrc && candidateSrc.trim() ? candidateSrc : FALLBACK_IMG_FILE
    );
  }, [candidateSrc]);

  // Cena w PLN (liczona z propsów)
  const priceZl = useMemo(() => {
    if (typeof product?.price === "number") return product.price!;
    if (typeof product?.priceCents === "number")
      return Math.max(0, Math.round(product.priceCents!) / 100);
    return 0;
  }, [product]);

  // 🔹 bazowa cena w groszach (do obliczeń rabatu)
  const basePriceCents: number | undefined = useMemo(() => {
    if (typeof product?.priceCents === "number") return product.priceCents;
    if (typeof product?.price === "number")
      return Math.round(product.price * 100);
    return undefined;
  }, [product]);

  // 🔹 logika rabatu
  const saleActive =
    !!product?.discountActive &&
    typeof product?.salePriceCents === "number" &&
    product.salePriceCents! > 0;
  const saleCents: number | null = saleActive
    ? (product?.salePriceCents as number)
    : null;
  const showPct = product?.showDiscountPercent !== false; // zostaje na przyszłość
  const pctVal = saleActive ? percentOff(basePriceCents, saleCents) : null;

  const hasPromoRibbon = !!product?.promo || saleActive;

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

  // Wymiary / animacje (obrazek subtelnie mniejszy)
  const cardHeightClass = large
    ? "min-h-[460px] sm:min-h-[480px]"
    : "min-h-[420px] sm:min-h-[440px]";

  const imageSize = large
    ? "w-44 h-44 sm:w-48 sm:h-48"
    : "w-36 h-36 sm:w-40 sm:h-40";

  const scaleClass = scaleOnHover ? "hover:scale-105" : "hover:scale-[1.02]";

  // OUT OF STOCK flag (obsłuż również boolean outOfStock)
  const outOfStock =
    typeof product?.stock === "number"
      ? product.stock <= 0
      : !!(product as any)?.outOfStock;

  // ✅ stan „czy w ulubionych” z kontekstu
  const inFav = useMemo(
    () => isInWishlist(product.slug),
    [wishlist, isInWishlist, product.slug]
  );

  // ⭐ Bezpieczny rating (fallback 5 jeśli brak/nieprawidłowy)
  const ratingN = useMemo(() => {
    const r = Number((product as any)?.rating);
    if (!Number.isFinite(r) || r <= 0) return 5;
    return Math.min(5, r);
  }, [product]);

  // Tekst na taśmie (zostaje, choć teraz używamy stałego tekstu)
  const promoText = useMemo(() => {
    if (!hasPromoRibbon) return "";
    if (pctVal !== null) {
      return `SUPER PROMOCJA • -${pctVal}% • SUPER PROMOCJA • -${pctVal}% • SUPER PROMOCJA • -${pctVal}% • `;
    }
    return "SUPER PROMOCJA • SUPER PROMOCJA • SUPER PROMOCJA • SUPER PROMOCJA • ";
  }, [hasPromoRibbon, pctVal]);

  // ✅ serduszko nie nawiguje
  const onHeartClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    toggleWishlist({
      slug: product.slug,
      name: product.name,
      price: typeof product.price === "number" ? product.price : undefined,
      priceCents:
        typeof product.priceCents === "number"
          ? product.priceCents
          : undefined,
      oldPrice:
        product?.oldPrice != null && !Number.isNaN(Number(product.oldPrice))
          ? Number(product.oldPrice)
          : undefined,
      image: product.image ?? product?.media?.[0]?.url,
      media: product.media,
      rating:
        typeof (product as any).rating === "number"
          ? (product as any).rating
          : undefined,
      stock: typeof product.stock === "number" ? product.stock : undefined,
      promo: !!product.promo,
      bestseller: !!(product as any).bestseller,
      promoEnd: toIsoOrUndef(product.promoEnd),
      description: product.description,
      discountActive: !!(product as any).discountActive,
      salePriceCents:
        typeof (product as any).salePriceCents === "number"
          ? (product as any).salePriceCents
          : undefined,
      showDiscountPercent:
        typeof (product as any).showDiscountPercent === "boolean"
          ? (product as any).showDiscountPercent
          : undefined,
    });

    setToast &&
      setToast(inFav ? "Usunięto z ulubionych" : "Dodano do ulubionych");
  };

  return (
    <div
      className={`relative w-full ${cardHeightClass} h-full flex flex-col
      bg-white dark:bg-surface rounded-3xl shadow-xl hover:shadow-gold
      ${scaleClass} transition-all duration-300 p-5 md:p-6 border-2
      ${
        outOfStock
          ? "border-black/10 dark:border-white/10"
          : hasPromoRibbon
          ? "border-mainRed/70 ring-1 ring-mainRed/40"
          : "border-transparent hover:border-gold"
      }
      overflow-hidden group
      ${
        outOfStock
          ? "opacity-70 grayscale-[35%] pointer-events-auto"
          : ""
      }`}
      style={fixedHeight ? { height: `${fixedHeight}px` } : undefined}
    >
      {/* SOLD OUT overlay */}
      {outOfStock && (
        <div className="absolute inset-0 z-30 bg-[rgba(15,20,36,0.38)] pointer-events-none" />
      )}

      {/* Dekoracyjny pasek u góry */}
      <div className="absolute left-0 top-0 w-full h-2 bg-gradient-to-r from-mainRed via-gold to-mainRed opacity-80 rounded-t-3xl" />

{/* 🔶 Pomarańczowa taśma SUPER PROMOCJA – dokładnie jak wcześniej, ale z animacją */}
{hasPromoRibbon && (
  <div
    className="
      pointer-events-none absolute 
      -left-16     /* DOKŁADNIE to samo co w starym */
      top-6        /* DOKŁADNIE to samo co w starym */
      rotate-[-32deg]
      bg-gradient-to-r from-orange-400 via-orange-500 to-orange-600
      text-[10px] sm:text-xs font-extrabold uppercase tracking-[0.22em]
      text-white py-1.5 px-20 shadow-2xl drop-shadow-xl border border-orange-700
      overflow-hidden
    "
    style={{ width: "260px" }}  // gwarancja stałej szerokości jak w starym
  >
    <span className="promo-marquee inline-block whitespace-nowrap">
      SUPER PROMOCJA • SUPER PROMOCJA • SUPER PROMOCJA • SUPER PROMOCJA •
    </span>
  </div>
)}

      {/* ❤️ Wishlist + pomarańczowy badge %  */}
      <div className="absolute top-3 right-3 z-40 flex flex-col items-end gap-1">
        <button
          className="transition-transform duration-200 touch-manipulation"
          title={inFav ? "Usuń z ulubionych" : "Dodaj do ulubionych"}
          onClick={onHeartClick}
          onMouseEnter={() => setHoverWish(true)}
          onMouseLeave={() => setHoverWish(false)}
          aria-label="Dodaj do ulubionych"
          aria-pressed={inFav}
        >
          <FaHeart
            className={`text-2xl drop-shadow transition-all ${
              inFav ? "text-mainRed" : "text-gray-300"
            } ${hoverWish ? "scale-110" : ""}`}
            style={{
              filter: hoverWish ? "drop-shadow(0 2px 8px #ffabab44)" : undefined,
            }}
          />
        </button>

        {/* Wyrazisty POMARAŃCZOWY badge z % rabatu (pulsujący) */}
        {saleCents != null &&
          typeof basePriceCents === "number" &&
          pctVal !== null && (
            <div
              className="
                px-2.5 py-0.5 rounded-full text-[11px] font-black 
                bg-gradient-to-r from-orange-400 via-orange-500 to-orange-600
                text-white border border-orange-700
                shadow-lg shadow-orange-500/40 uppercase tracking-wide
                animate-pulse
              "
            >
              -{pctVal}%
            </div>
          )}
      </div>

      {/* Rząd badge'y – żółta 'Promocja' + Bestseller */}
      <div className="h-6 mb-3 flex items-center justify-center gap-2 z-10">
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
        {outOfStock && (
          <span
            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold
            bg-gray-400/90 text-white border border-gray-500/70"
          >
            Wyprzedane
          </span>
        )}
      </div>

      {/* Treść karty */}
      <Link
        to={{ pathname: `/product/${encodeURIComponent(product.slug)}` }}
        className="block w-full flex-1 flex flex-col z-10"
        tabIndex={-1}
        aria-label={product.name}
        style={{ textDecoration: "none" }}
      >
        {/* Pole obrazka z dwustopniowym fallbackiem */}
        <div className="mx-auto mb-4 rounded-2xl shadow relative bg-gray-100 dark:bg-[#0f1424] flex items-center justify-center overflow-hidden">
          <img
            src={imgSrc}
            onError={() => {
              setImgSrc(FALLBACK_IMG_FILE);
            }}
            alt={product.name}
            width={160}
            height={160}
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
        <div
          className="flex items-center justify-center mt-2"
          aria-label={`Ocena: ${ratingN} na 5`}
        >
          {[...Array(5)].map((_, idx) => (
            <FaStar
              key={idx}
              className={idx < ratingN ? "text-gold" : "text-graySoft"}
            />
          ))}
        </div>

        {/* Cena (bez % na dole) */}
        <div className="mt-2 text-center min-h-[30px]">
          {saleCents != null && typeof basePriceCents === "number" ? (
            <div className="flex items-baseline justify-center gap-2">
              <span className="text-mainRed font-extrabold">
                {fmt(saleCents)}
              </span>
              <span className="text-sm line-through opacity-70">
                {fmt(basePriceCents)}
              </span>
            </div>
          ) : (
            <>
              {product?.promo && product?.oldPrice && (
                <span className="text-gray-400 font-semibold line-through mr-2">
                  {Number(product.oldPrice).toFixed(2)} zł
                </span>
              )}
              <span className="text-lg sm:text-xl font-semibold sm:font-bold text-gold [text-shadow:0_1px_2px_rgba(0,0,0,.2)]">
                {priceZl.toFixed(2)} zł
              </span>
            </>
          )}
        </div>

        {/* Informacje dodatkowe */}
        <div className="min-h-[20px] mt-1 text-center">
          {product?.promoEnd && (
            <span className="text-xs text-mainRed font-bold">
              Promocja kończy się za {timeLeft}
            </span>
          )}
          {!product?.promoEnd &&
            typeof product?.stock === "number" &&
            product.stock > 0 &&
            product.stock <= 3 && (
              <span className="text-xs text-red-600 font-bold">
                Zostały tylko {product.stock} sztuki!
              </span>
            )}
        </div>
      </Link>

      {/* CTA przyklejone do dołu karty */}
      <button
        className={`mt-auto font-bold px-6 py-2 rounded-xl transition shadow-md border-2
          ${
            outOfStock
              ? "bg-gray-200 text-gray-500 border-gray-300 cursor-not-allowed"
              : "bg-gradient-to-r from-gold to-yellow-400 text-mainRed hover:from-mainRed hover:to-mainRed hover:text-gold border-gold hover:border-mainRed"
          }`}
        style={{ letterSpacing: "0.03em" }}
        onClick={() => {
          if (outOfStock) return;
          addToCart(toCartItem(product));
          setToast && setToast("Dodano do koszyka!");
          try {
            window.dispatchEvent(new Event("cart:add"));
          } catch {}
        }}
        aria-disabled={outOfStock}
      >
        {outOfStock ? "Niedostępny" : "Dodaj do koszyka"}
      </button>
    </div>
  );
}
