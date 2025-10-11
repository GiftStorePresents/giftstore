// src/utils/productMapper.js
import { API_BASE } from "../api";

/** Buduje absolutny URL do obrazka (obsługa /uploads/...) */
export function absUrl(url) {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  return `${API_BASE}${url.startsWith("/") ? url : `/${url}`}`;
}

function minPriceCents(variants) {
  if (!Array.isArray(variants) || variants.length === 0) return null;
  const vals = variants.map((v) => v?.priceCents).filter((n) => typeof n === "number");
  if (!vals.length) return null;
  return Math.min(...vals);
}

export function mapApiProductToCard(raw) {
  if (!raw) return null;

  const priceCents = minPriceCents(raw.variants);
  const price = typeof priceCents === "number" ? Math.round(priceCents / 100) : 0;

  const media = Array.isArray(raw.media) ? raw.media : [];
  const image = media.length ? absUrl(media[0].url) : "";

  const galleryImages = media.map((m) => absUrl(m.url)).filter(Boolean);

  const promo = !!raw.promo;
  const oldPrice =
    typeof raw.oldPrice === "number"
      ? raw.oldPrice
      : promo
      ? Math.round(price * 1.1)
      : undefined;

  const rating = typeof raw.rating === "number" && raw.rating >= 0 ? raw.rating : 5;

  const tags =
    Array.isArray(raw.tags) && raw.tags.length
      ? raw.tags
      : [raw.category, raw.brand].filter(Boolean);

  return {
    id: raw.id,
    name: raw.name,
    slug: raw.slug,

    price,
    oldPrice,
    promo,

    description: raw.description || "",
    longDescription: raw.longDescription || "",
    details: Array.isArray(raw.details) ? raw.details : [],
    brand: raw.brand || "",
    category: raw.category || "",
    featured: !!raw.featured,
    rating,

    image:
      image ||
      "https://images.unsplash.com/photo-1503602642458-232111445657?auto=format&fit=crop&w=600&q=80",
    galleryImages: galleryImages.length ? galleryImages : image ? [image] : [],

    stock:
      Array.isArray(raw.variants) && raw.variants[0] && typeof raw.variants[0].stock === "number"
        ? raw.variants[0].stock
        : undefined,
    variants: Array.isArray(raw.variants) ? raw.variants : [],

    tags,
  };
}
