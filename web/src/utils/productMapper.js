// src/utils/productMapper.js
import { API_BASE } from "../api";

/** Buduje absolutny URL do obrazka (obsługa /uploads/...) */
export function absUrl(url) {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  return `${API_BASE}${url.startsWith("/") ? url : `/${url}`}`;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function fromCents(c) {
  const n = num(c);
  return n != null ? Math.round(n) / 100 : null;
}
function toCents(zl) {
  const n = num(zl);
  return n != null ? Math.round(n * 100) : null;
}

/**
 * Minimalna cena z wariantów, z uwzględnieniem rabatu.
 * base  – bazowa cena (priceCents) wariantu, z którego bierzemy rabat
 * sale  – cena po rabacie (salePriceCents) dla tego wariantu (jeśli jest)
 * eff   – efektywna cena (po rabacie lub bazowa) – do wyliczenia "price"
 * old   – stara cena (jeśli był rabat) – do "oldPrice"
 * anyDiscount – czy jakikolwiek wariant ma aktywny rabat
 */
function minVariantPriceInfo(variants) {
  if (!Array.isArray(variants) || variants.length === 0) {
    return { base: null, sale: null, eff: null, old: null, anyDiscount: false };
  }

  let base = null;
  let sale = null;
  let eff = null;
  let old = null;
  let anyDiscount = false;

  for (const v of variants) {
    const baseC = num(v?.priceCents);
    const saleC =
      v?.discountActive && num(v?.salePriceCents) != null
        ? num(v?.salePriceCents)
        : null;

    const hasDisc =
      baseC != null && saleC != null && saleC < baseC;

    const effC = hasDisc ? saleC : baseC;
    if (effC == null) continue;

    if (eff == null || effC < eff) {
      eff = effC;
      base = baseC;
      sale = hasDisc ? saleC : null;
      old = hasDisc ? baseC : null;
      anyDiscount = anyDiscount || hasDisc;
    }
  }

  return { base, sale, eff, old, anyDiscount };
}

export function mapApiProductToCard(raw) {
  if (!raw) return null;

  // ----- obrazki
  const media = Array.isArray(raw.media) ? raw.media : [];
  const firstMedia =
    media[0]?.url ||
    raw.image ||
    raw.imageUrl ||
    (Array.isArray(raw.images) ? raw.images[0] : "") ||
    "";
  const image = absUrl(firstMedia);
  const galleryImages = media.map((m) => absUrl(m.url)).filter(Boolean);

  // ----- ceny
  const variantInfo = minVariantPriceInfo(raw.variants);

  // price / oldPrice w zł
  let price = num(raw.price);
  let oldPrice = num(raw.oldPrice);
  if (oldPrice == null) oldPrice = num(raw.compareAtPrice);

  if (price == null) price = fromCents(raw.priceCents);
  if (oldPrice == null) oldPrice = fromCents(raw.oldPriceCents);

  // jeśli w ogóle nie mieliśmy ceny – bierzemy z wariantów
  if (price == null && variantInfo.eff != null) {
    price = fromCents(variantInfo.eff);
  }
  if (oldPrice == null && variantInfo.old != null) {
    oldPrice = fromCents(variantInfo.old);
  }

  // ceny w groszach (bazowo z "price", potem ewentualnie nadpiszemy)
  let priceCents = price != null ? toCents(price) : null;
  const oldPriceCents = oldPrice != null ? toCents(oldPrice) : null;

  // ----- rabaty (discountActive / salePriceCents)
  let discountActive = !!raw.discountActive;
  let salePriceCents = num(raw.salePriceCents);

  // jeżeli nie ma "globalnego" rabatu, sprawdź warianty
  if (!discountActive && variantInfo.anyDiscount) {
    discountActive = true;
    if (variantInfo.sale != null) {
      salePriceCents = variantInfo.sale;
    }
  }

  // jeżeli rabat pochodzi z wariantu – zadbaj, żeby priceCents było ceną bazową
  if (
    discountActive &&
    salePriceCents != null &&
    variantInfo.base != null
  ) {
    priceCents = variantInfo.base;
  }

  // ----- rating (fallback 5) + licznik opinii
  const providedRating = raw.rating ?? raw.ratingAvg ?? raw.reviewsAvg;
  const rating = (() => {
    const r = Number(providedRating);
    return Number.isFinite(r) ? Math.max(0, Math.min(5, r)) : 5;
  })();

  const providedReviewCount =
    raw.reviewCount ?? raw.reviewsCount ?? raw.numReviews;
  const reviewCount =
    typeof providedReviewCount === "number" && providedReviewCount >= 0
      ? providedReviewCount
      : 0;

  // ----- stock (produkt + wszystkie warianty)
  let stock = num(raw.stock) ?? 0;
  if (Array.isArray(raw.variants)) {
    for (const v of raw.variants) stock += num(v?.stock) ?? 0;
  }
  const outOfStock = stock <= 0;

  // ----- tagi / flagi + promo
  const tags =
    Array.isArray(raw.tags) && raw.tags.length
      ? raw.tags
      : [raw.category, raw.brand].filter(Boolean);

  const lowerTags = Array.isArray(tags)
    ? tags.map((t) => String(t).toLowerCase())
    : [];
  const hasBestsellerTag = lowerTags.includes("bestseller");

  const isNew =
    !!(raw.isNew ||
    lowerTags.includes("nowość") ||
    lowerTags.includes("nowosc"));

  const bestseller = !!(
    raw.bestseller ||
    raw.featured ||
    hasBestsellerTag ||
    (raw?.salesCount > 100)
  );

  const pricePairValid =
    price != null && oldPrice != null && oldPrice > price;
  const onSale = pricePairValid || !!raw.promo;

  // ważne dla badge „Promocja” w ProductCard
  const promo = !!raw.promo || pricePairValid || discountActive;

  return {
    id: raw.id,
    name: raw.name,
    slug: raw.slug,

    // ceny w zł – price = aktualna, oldPrice = stara (jeśli jest)
    price: price ?? undefined,
    oldPrice: oldPrice ?? undefined,

    // ceny w groszach – priceCents = cena bazowa (do %), salePriceCents = po rabacie
    priceCents: priceCents ?? undefined,
    oldPriceCents: oldPriceCents ?? undefined,
    discountActive,
    salePriceCents: salePriceCents ?? undefined,
    showDiscountPercent: true,

    promo,

    description: raw.description || "",
    longDescription: raw.longDescription || "",
    details: Array.isArray(raw.details) ? raw.details : [],
    brand: raw.brand || "",
    category: raw.category || "",
    featured: !!raw.featured,

    rating,
    ratingMax: 5,
    reviewCount,
    reviewsCount: reviewCount,

    image: image || "/og-image.jpg",
    galleryImages: galleryImages.length
      ? galleryImages
      : image
      ? [image]
      : [],

    stock,
    outOfStock,
    inStock: !outOfStock,
    variants: Array.isArray(raw.variants) ? raw.variants : [],

    isNew,
    bestseller,
    onSale,

    tags,
    media: media.length ? media : undefined,
  };
}
