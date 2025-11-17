// web/src/pages/InspirationPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import SeoHead from "../components/SeoHead";
import Breadcrumbs from "../components/Breadcrumbs";
import LoadMoreGrid from "../components/LoadMoreGrid";
import FiltersDrawer from "../components/FiltersDrawer";

import { env } from "../env";
import { mapApiProductToCard } from "../utils/productMapper";
import { gaEvent, mapProductsToGAItems } from "../utils/ga";

const PAGE = 48;

/* =========================
 * Pomocnicze utilsy
 * ========================= */
function isNum(x) {
  return typeof x === "number" && Number.isFinite(x);
}
function toPriceNumberMaybe(v) {
  return isNum(v) ? v : undefined;
}
function fromCentsMaybe(c) {
  return isNum(c) ? Math.round(c) / 100 : undefined;
}
// ⭐️ KLUCZOWA ZMIANA: 0/NaN/undefined -> 5
function clampRating(r) {
  const n = Number(r);
  if (!Number.isFinite(n) || n <= 0) return 5;
  return Math.min(5, n);
}

/* =========================
 * Fallback mapper (gdy API zwróci minimalny kształt)
 * ========================= */
function mapToCardSafe(p = {}) {
  // 1) Spróbuj wspólnego mappera
  try {
    const mapped = mapApiProductToCard(p);
    const hasMeaningfulPriceOrRating =
      isNum(mapped?.price) ||
      isNum(mapped?.priceCents) ||
      isNum(mapped?.oldPrice) ||
      isNum(mapped?.oldPriceCents) ||
      isNum(mapped?.rating);

    if (mapped && mapped.slug && mapped.name && hasMeaningfulPriceOrRating) {
      return {
        ...mapped,
        // 👇 nawet gdy mapped.rating = 0 → 5
        rating: clampRating(mapped?.rating ?? mapped?.ratingAvg),
        // aliasy opinii (bezpiecznie)
        reviewCount:
          Number(mapped?.reviewCount ?? mapped?.reviewsCount ?? 0) || 0,
        reviewsCount:
          Number(mapped?.reviewCount ?? mapped?.reviewsCount ?? 0) || 0,
      };
    }
  } catch {}

  // 2) Minimalny bezpieczny kształt dla ProductCard
  const price = toPriceNumberMaybe(p.price) ?? fromCentsMaybe(p.priceCents);
  const oldPrice =
    toPriceNumberMaybe(p.oldPrice) ??
    fromCentsMaybe(p.oldPriceCents) ??
    (isNum(p.compareAtPrice) ? p.compareAtPrice : undefined);

  const onSale = isNum(oldPrice) && isNum(price) ? oldPrice > price : false;

  // stock: preferuj pole produktowe, a jeśli brak — suma wariantów
  const variantsStock = Array.isArray(p.variants)
    ? p.variants.reduce((sum, v) => sum + (isNum(v?.stock) ? v.stock : 0), 0)
    : null;
  const stock = isNum(p.stock)
    ? Number(p.stock)
    : isNum(variantsStock)
    ? variantsStock
    : undefined;

  const outOfStock = typeof stock === "number" ? stock <= 0 : !!p.outOfStock;

  const priceCents =
    isNum(p.priceCents) ? Math.round(p.priceCents) : isNum(price) ? Math.round(price * 100) : undefined;
  const oldPriceCents =
    isNum(p.oldPriceCents) ? Math.round(p.oldPriceCents) : isNum(oldPrice) ? Math.round(oldPrice * 100) : undefined;

  return {
    id: p.id || p.slug,
    slug: p.slug,
    name: p.name || (p.slug ? p.slug.replace(/-/g, " ") : "Produkt"),
    description: p.description || "",
    image: p.image || p.imageUrl || "/og-image.jpg",

    price,
    oldPrice,
    priceCents,
    oldPriceCents,

    // 👇 fallback 5
    rating: clampRating(p.rating ?? p.ratingAvg),

    reviewCount: Number(p.reviewCount ?? p.reviewsCount ?? 0) || 0,
    reviewsCount: Number(p.reviewCount ?? p.reviewsCount ?? 0) || 0,

    isNew: !!p.isNew,
    featured: !!p.featured,
    bestseller: !!p.bestseller,
    onSale,
    stock,
    outOfStock,
    media: Array.isArray(p.media) ? p.media : undefined,
  };
}

/* Uładnione „na-urodziny” -> „Na urodziny” */
function humanizeSlug(s = "") {
  const t = String(s).trim().replace(/-/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export default function InspirationPage({ setToast }) {
  const { slug = "" } = useParams();

  // ===== UI state =====
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [pageState, setPageState] = useState({ items: [], total: 0, skip: 0, take: PAGE });

  // takie same filtry jak w CategoryPage
  const [filters, setFilters] = useState({
    minPrice: "",
    maxPrice: "",
    rating: "",
    sort: "relevance",
  });

  // ===== Data loader =====
  async function load(skip = 0) {
    setLoading(true);
    setErr("");
    try {
      const u = new URL(
        `/api/public/inspirations/${encodeURIComponent(slug)}/products`,
        window.location.origin
      );
      u.searchParams.set("skip", String(skip));
      u.searchParams.set("take", String(PAGE));
      if (q.trim()) u.searchParams.set("q", q.trim());

      const r = await fetch(u.toString().replace(window.location.origin, ""), {
        credentials: "include",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = await r.json();

      const rawItems = Array.isArray(json?.items) ? json.items : [];
      const items = rawItems
        .map(mapToCardSafe)
        // 👇 gwarancja: rating 1..5 oraz oba aliasy opinii
        .map((p) => ({
          ...p,
          rating: clampRating(p?.rating ?? p?.ratingAvg),
          reviewCount: Number(p?.reviewCount ?? p?.reviewsCount ?? 0) || 0,
          reviewsCount: Number(p?.reviewCount ?? p?.reviewsCount ?? 0) || 0,
        }));

      setPageState({
        items,
        total: Number(json?.total ?? items.length),
        skip,
        take: PAGE,
      });
    } catch (e) {
      setErr(e?.message || "Błąd ładowania");
      setPageState({ items: [], total: 0, skip: 0, take: PAGE });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!slug) return;
    load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, q]);

  // ===== Canonical / siteUrl =====
  const siteUrl = useMemo(() => {
    const fromEnv = (env?.SITE_URL || "").replace(/\/+$/, "");
    if (fromEnv) return fromEnv;
    if (typeof window !== "undefined") return window.location.origin.replace(/\/+$/, "");
    return "";
  }, []);
  const canonical = `${siteUrl}/inspiracje/${slug}`;

  // ===== Nazwa =====
  const label = `Inspiracja: ${humanizeSlug(slug)}`;

  // ===== GA4: view_item_list =====
  const gaItems = useMemo(() => pageState.items, [pageState.items]);
  useEffect(() => {
    if (!gaItems?.length) return;
    gaEvent("view_item_list", {
      item_list_id: `insp_${slug || "list"}`,
      item_list_name: label,
      items: mapProductsToGAItems(gaItems),
    });
  }, [gaItems?.length, slug]); // eslint-disable-line

  // ===== JSON-LD =====
  const breadcrumbsJsonLd = useMemo(
    () => ({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Strona główna", item: `${siteUrl}/` },
        { "@type": "ListItem", position: 2, name: "Inspiracje", item: `${siteUrl}/` },
        { "@type": "ListItem", position: 3, name: humanizeSlug(slug), item: canonical },
      ],
    }),
    [slug, canonical, siteUrl]
  );

  const itemListJsonLd = useMemo(
    () => ({
      "@context": "https://schema.org",
      "@type": "ItemList",
      itemListElement: pageState.items.map((p, idx) => ({
        "@type": "ListItem",
        position: idx + 1,
        url: `${siteUrl}/product/${p.slug}`,
        name: p.name,
      })),
    }),
    [pageState.items, siteUrl]
  );

  const collectionPageJsonLd = useMemo(
    () => ({
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: `${label} – Gift Store`,
      description: `Produkty przypięte do inspiracji: ${humanizeSlug(slug)}.`,
      url: canonical,
      hasPart: pageState.items.slice(0, 20).map((p) => ({
        "@type": "Product",
        name: p.name,
        url: `${siteUrl}/product/${p.slug}`,
      })),
    }),
    [label, canonical, pageState.items, siteUrl, slug]
  );

  // ===== Filtrowanie i sort =====
  const filteredProducts = useMemo(() => {
    return (pageState.items || []).filter((p) => {
      const price = Number(p.price ?? NaN);
      if (filters.minPrice !== "" && !Number.isNaN(price) && price < Number(filters.minPrice)) {
        return false;
      }
      if (filters.maxPrice !== "" && !Number.isNaN(price) && price > Number(filters.maxPrice)) {
        return false;
      }
      if (filters.rating !== "" && clampRating(p.rating) < Number(filters.rating)) {
        return false;
      }
      return true;
    });
  }, [pageState.items, filters.minPrice, filters.maxPrice, filters.rating]);

  const sortedProducts = useMemo(() => {
    const arr = [...filteredProducts];
    switch (filters.sort) {
      case "priceAsc":
        arr.sort((a, b) => Number(a.price ?? Infinity) - Number(b.price ?? Infinity));
        break;
      case "priceDesc":
        arr.sort((a, b) => Number(b.price ?? -Infinity) - Number(a.price ?? -Infinity));
        break;
      case "ratingDesc":
        arr.sort((a, b) => clampRating(b.rating) - clampRating(a.rating));
        break;
      default:
        break; // kolejność backendu
    }
    // gwarantujemy rating 1..5 w renderze
    return arr.map((p) => ({ ...p, rating: clampRating(p.rating) }));
  }, [filteredProducts, filters.sort]);

  const pages = Math.max(1, Math.ceil((pageState.total || 0) / PAGE));

  // debug (opcjonalny)
  if (typeof window !== "undefined") {
    window.__INSPIRATION__ = sortedProducts;
  }

  // ===== UI =====
  return (
    <section className="my-10 max-w-7xl mx-auto px-4">
      <SeoHead
        title={`${label} — Gift Store`}
        description={`Zobacz produkty przypięte do inspiracji: ${humanizeSlug(slug)}.`}
        canonical={canonical}
        type="website"
        image={`${siteUrl}/og-image.jpg`}
        jsonLd={[breadcrumbsJsonLd, itemListJsonLd, collectionPageJsonLd]}
      />

      <Breadcrumbs
        items={[
          { name: "Home", url: "/" },
          { name: "Inspiracje", url: "/" },
          { name: humanizeSlug(slug), url: `/inspiracje/${slug}` },
        ]}
      />

      <div className="mb-6 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-mainRed">
          {label}
        </h1>
        <FiltersDrawer filters={filters} setFilters={setFilters} />
      </div>

      {/* Szukaj w ramach inspiracji */}
      <div className="mb-6 flex items-center justify-end gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Szukaj w tej inspiracji…"
        className="w-full rounded-lg border px-3 py-2 text-sm dark:border-white/15 dark:bg-white/5 sm:w-80"
        />
        <button
          onClick={() => load(0)}
          className="rounded-lg border px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/10"
        >
          Szukaj
        </button>
      </div>

      {err && <div className="mb-4 text-sm text-red-600">{err}</div>}

      {loading ? (
        <div>Ładowanie…</div>
      ) : sortedProducts.length === 0 ? (
        <div className="text-gray-500">Brak produktów w tej inspiracji.</div>
      ) : (
        <LoadMoreGrid products={sortedProducts} setToast={setToast} />
      )}

      {!loading && pageState.total > pageState.items.length && (
        <div className="mt-6 flex items-center justify-end gap-2">
          <span className="text-xs text-neutral-500">Stron: {pages}</span>
          <button
            disabled={pageState.skip <= 0}
            onClick={() => load(Math.max(0, pageState.skip - PAGE))}
            className="rounded border px-2 py-1 text-xs disabled:opacity-50"
          >
            ←
          </button>
          <button
            disabled={pageState.skip + PAGE >= pageState.total}
            onClick={() => load(pageState.skip + PAGE)}
            className="rounded border px-2 py-1 text-xs disabled:opacity-50"
          >
            →
          </button>
        </div>
      )}
    </section>
  );
}
