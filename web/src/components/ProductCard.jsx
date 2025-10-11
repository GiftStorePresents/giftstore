// src/components/ProductCard.jsx
import { FaHeart, FaStar, FaTag, FaFire } from "react-icons/fa";
import { Link } from "react-router-dom";
import { useCart } from "../context/CartContext";
import { useState, useEffect, useMemo } from "react";
import { API_BASE } from "../api";
import SmartImage from "./SmartImage";

/* ---------- Wishlist (localStorage) ---------- */
function useWishlist() {
  const [wishlist, setWishlist] = useState(
    () => JSON.parse(localStorage.getItem("wishlist") || "[]")
  );

  const toggleWishlist = (product) => {
    let updated;
    if (wishlist.find((item) => item.slug === product.slug)) {
      updated = wishlist.filter((item) => item.slug !== product.slug);
    } else {
      const { slug, name, price } = product;
      updated = [...wishlist, { slug, name, price }];
    }
    setWishlist(updated);
    localStorage.setItem("wishlist", JSON.stringify(updated));
    window.dispatchEvent(new Event("wishlist:toggle"));
  };

  const isWishlisted = (product) =>
    wishlist.some((item) => item.slug === product.slug);

  return { toggleWishlist, isWishlisted };
}

/* ---------- helper URL obrazka ---------- */
function absImageUrl(url) {
  if (!url) return "";
  return url.startsWith("http")
    ? url
    : `${API_BASE}${url.startsWith("/") ? url : `/${url}`}`;
}

/* ---------- Komponent ---------- */
export default function ProductCard({
  product,
  setToast,
  large = false,
  scaleOnHover = true,
  /** (opcjonalnie) wymuś stałą wysokość całej karty w px, np. 480 */
  fixedHeight,
}) {
  const { addToCart } = useCart();
  const { toggleWishlist, isWishlisted } = useWishlist();
  const [hoverWish, setHoverWish] = useState(false);

  /* obrazek: media[0].url > image > placeholder */
  const imgSrc = useMemo(() => {
    const candidate = product?.image || product?.media?.[0]?.url || "";
    const built = absImageUrl(candidate);
    return built || "/placeholder.jpg";
  }, [product]);

  /* cena (PLN) */
  const priceZl = useMemo(() => {
    if (typeof product?.price === "number") return product.price;
    if (typeof product?.priceCents === "number")
      return Math.max(0, Math.round(product.priceCents) / 100);
    return 0;
  }, [product]);

  /* licznik promocji */
  const [timeLeft, setTimeLeft] = useState("");
  useEffect(() => {
    if (!product?.promoEnd) return;
    const updateTimer = () => {
      const diff = new Date(product.promoEnd) - new Date();
      if (diff <= 0) {
        setTimeLeft("Zakończona");
        return;
      }
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((diff / (1000 * 60)) % 60);
      setTimeLeft(`${days > 0 ? `${days}d ` : ""}${hours}h ${minutes}m`);
    };
    updateTimer();
    const interval = setInterval(updateTimer, 60000);
    return () => clearInterval(interval);
  }, [product?.promoEnd]);

  /* wymiary / animacje */
  const cardHeightClass = large
    ? "min-h-[460px] sm:min-h-[480px]"
    : "min-h-[420px] sm:min-h-[440px]";

  const imageSize = large
    ? "w-40 h-40 sm:w-44 sm:h-44"
    : "w-36 h-36 sm:w-40 sm:h-40";

  const scaleClass = scaleOnHover ? "hover:scale-105" : "hover:scale-102";

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
        <SmartImage
          src={imgSrc}
          alt={product.name}
          width="176"
          height="176"
          className={`${imageSize} mx-auto mb-4 rounded-2xl shadow relative`}
          imgClassName="object-cover group-hover:ring-4 group-hover:ring-gold transition-all duration-300 group-hover:brightness-110"
        />

        {/* Tytuł (responsywne rozmiary + clamp) */}
        <div className="font-bold text-base sm:text-lg text-mainRed dark:text-accent mb-1 text-center min-h-[44px] sm:min-h-[48px] flex items-center justify-center line-clamp-2 sm:line-clamp-3">
          {product.name}
        </div>

        {/* Opis (responsywnie krótszy na mobile) */}
        <div className="text-gray-600 dark:text-muted text-sm text-center line-clamp-2 sm:line-clamp-3 min-h-[40px] sm:min-h-[48px]">
          {product.description}
        </div>

        {/* Ocena */}
        <div className="flex items-center justify-center mt-2">
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
          {!product?.promoEnd && product?.stock !== undefined && product.stock <= 3 && (
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
          addToCart(product);
          setToast && setToast("Dodano do koszyka!");
          window.dispatchEvent(new Event("cart:add"));
        }}
      >
        Dodaj do koszyka
      </button>
    </div>
  );
}
