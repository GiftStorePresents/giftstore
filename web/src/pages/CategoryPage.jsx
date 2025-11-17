// src/pages/CategoryPage.jsx
import { useParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import FiltersDrawer from "../components/FiltersDrawer";
import SeoHead from "../components/SeoHead";
import LoadMoreGrid from "../components/LoadMoreGrid";
import Breadcrumbs from "../components/Breadcrumbs";
import { env } from "../env";
import { useApiProducts } from "../hooks/useApiProducts";
import { mapApiProductToCard } from "../utils/productMapper";
import { gaEvent, mapProductsToGAItems } from "../utils/ga";

const categoryNameMap = {
  wszystkie: "Wszystkie produkty",
  "dla-niej": "Dla niej",
  "dla-niego": "Dla niego",
  "dla-mamy": "Dla mamy",
  "dla-taty": "Dla taty",
  "na-urodziny": "Na urodziny",
  "dla-dzieci": "Dla dzieci",
};

export default function CategoryPage({ setToast }) {
  const { slug = "wszystkie" } = useParams();
  const label = categoryNameMap[slug] || categoryNameMap["wszystkie"];

  // Kategoria do API (pusta = wszystkie)
  const categoryParam = slug && slug !== "wszystkie" ? slug : "";

  // Pobranie listy produktów
  const { items, loading, error } = useApiProducts({
    page: 1,
    limit: 200,
    category: categoryParam,
  });

  // Mapowanie do jednolitego modelu karty (filtrowanie nulli na wypadek błędnych rekordów)
  const mapped = useMemo(
    () => (Array.isArray(items) ? items.map(mapApiProductToCard).filter(Boolean) : []),
    [items]
  );

  const [filters, setFilters] = useState({
    minPrice: "",
    maxPrice: "",
    rating: "",
    sort: "relevance",
  });

  /* ---------------- GA4: view_item_list ---------------- */
  useEffect(() => {
    if (!mapped?.length) return;
    gaEvent("view_item_list", {
      item_list_id: `cat_${slug || "list"}`,
      item_list_name: label || slug || "Lista kategorii",
      items: mapProductsToGAItems(mapped),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapped?.length, slug]);

  /* ---------------- SITE_URL / canonical ---------------- */
  const siteUrl = useMemo(() => {
    const fromEnv = (env?.SITE_URL || "").replace(/\/+$/, "");
    if (fromEnv) return fromEnv;
    if (typeof window !== "undefined") return window.location.origin.replace(/\/+$/, "");
    return "";
  }, []);

  const canonical = `${siteUrl}/categories/${slug || "wszystkie"}`;

  /* ---------------- JSON-LD ---------------- */

  // 1) BreadcrumbList
  const breadcrumbsJsonLd = useMemo(
    () => ({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Strona główna", item: `${siteUrl}/` },
        { "@type": "ListItem", position: 2, name: "Kategorie", item: `${siteUrl}/categories/wszystkie` },
        { "@type": "ListItem", position: 3, name: label, item: canonical },
      ],
    }),
    [label, canonical, siteUrl]
  );

  // 2) Filtry (front)
  const filteredProducts = useMemo(() => {
    return mapped.filter((p) => {
      if (filters.minPrice !== "" && Number(p.price) < Number(filters.minPrice)) return false;
      if (filters.maxPrice !== "" && Number(p.price) > Number(filters.maxPrice)) return false;
      if (filters.rating !== "" && Number(p.rating) < Number(filters.rating)) return false;
      return true;
    });
  }, [mapped, filters.minPrice, filters.maxPrice, filters.rating]);

  // 3) Sortowanie
  const sortedProducts = useMemo(() => {
    const arr = [...filteredProducts];
    switch (filters.sort) {
      case "priceAsc":
        arr.sort((a, b) => Number(a.price) - Number(b.price));
        break;
      case "priceDesc":
        arr.sort((a, b) => Number(b.price) - Number(a.price));
        break;
      case "ratingDesc":
        arr.sort((a, b) => Number(b.rating) - Number(a.rating));
        break;
      default:
        // relevance / backend order
        break;
    }
    return arr;
  }, [filteredProducts, filters.sort]);

  // 🔍 Debug: udostępnij w konsoli aktualną listę po mapowaniu/filtrach/sortowaniu
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.__LAST_PRODUCTS__ = sortedProducts;
    }
  }, [sortedProducts]);

  // 4) ItemList (lista produktów na stronie kategorii)
  const itemListJsonLd = useMemo(
    () => ({
      "@context": "https://schema.org",
      "@type": "ItemList",
      itemListElement: sortedProducts.map((p, idx) => ({
        "@type": "ListItem",
        position: idx + 1,
        url: `${siteUrl}/product/${p.slug}`,
        name: p.name,
      })),
    }),
    [sortedProducts, siteUrl]
  );

  // 5) CollectionPage (semantyka strony kategorii)
  const collectionPageJsonLd = useMemo(
    () => ({
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: `Kategoria: ${label} – Gift Store`,
      description:
        label === "Wszystkie produkty"
          ? "Pełna lista produktów Gift Store – prezenty na każdą okazję."
          : `Produkty w kategorii ${label}.`,
      url: canonical,
      hasPart: sortedProducts.slice(0, 20).map((p) => ({
        "@type": "Product",
        name: p.name,
        url: `${siteUrl}/product/${p.slug}`,
      })),
    }),
    [label, canonical, sortedProducts, siteUrl]
  );

  /* ---------------- UI ---------------- */
  if (loading) {
    return (
      <section className="my-10 max-w-7xl mx-auto px-4">
        <h1 className="text-3xl font-bold text-mainRed">{label}</h1>
        <div className="mt-6">Ładowanie…</div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="my-10 max-w-7xl mx-auto px-4">
        <h1 className="text-3xl font-bold text-mainRed">{label}</h1>
        <div className="mt-6 text-red-600">{String(error)}</div>
      </section>
    );
  }

  return (
    <section className="my-10 max-w-7xl mx-auto px-4">
      <SeoHead
        title={`${label} — Gift Store`}
        description={`Przeglądaj kategorię: ${label}. Szybka wysyłka, świetne ceny i sprawdzone bestsellery.`}
        canonical={canonical}
        type="website"
        image={`${siteUrl}/og-image.jpg`}
        jsonLd={[breadcrumbsJsonLd, itemListJsonLd, collectionPageJsonLd]}
      />

      <Breadcrumbs
        items={[
          { name: "Home", url: "/" },
          { name: "Kategorie", url: "/categories/wszystkie" },
          { name: label, url: `/categories/${slug || "wszystkie"}` },
        ]}
      />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-mainRed">
          {label}
        </h1>

        <FiltersDrawer filters={filters} setFilters={setFilters} />
      </div>

      {sortedProducts.length === 0 ? (
        <div className="text-gray-500">Brak produktów w tej kategorii.</div>
      ) : (
        <LoadMoreGrid
          products={sortedProducts}
          setToast={setToast}
        />
      )}
    </section>
  );
}
