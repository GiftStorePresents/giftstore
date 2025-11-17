// src/pages/SearchResults.jsx
import { useMemo, useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
// SearchResults.jsx
import { searchAll, getSearchVersion } from "../utils/searchUtils";
import FiltersDrawer from "../components/FiltersDrawer";
import SeoHead from "../components/SeoHead";
import LoadMoreGrid from "../components/LoadMoreGrid";
import { env } from "../env";
import { gaEvent, mapProductsToGAItems } from "../utils/ga";

function useQueryParam() {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}

export default function SearchResults({ setToast }) {
  const location = useLocation();
  const params = useQueryParam();
  const query = params.get("q") || "";

  const [filters, setFilters] = useState({
    minPrice: "",
    maxPrice: "",
    rating: "",
    sort: "relevance",
  });

  // 🔄 wersja datasetu – rośnie przy updateSearchDataset(...)
  const [ver, setVer] = useState(() => getSearchVersion());
  useEffect(() => {
    const onUpdate = () => setVer(getSearchVersion());
    window.addEventListener("search:dataset", onUpdate);
    return () => window.removeEventListener("search:dataset", onUpdate);
  }, []);

  // 🔎 pełne, lokalne wyniki (Fuse działa w utils/searchUtils)
  const allResults = useMemo(() => searchAll(query), [query, ver]);

  // GA4: view_search_results – gdy zmienia się zapytanie
  useEffect(() => {
    if (!query) return;
    gaEvent("view_search_results", {
      search_term: query,
      items: mapProductsToGAItems(allResults).slice(0, 24),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, ver]);

  // GA4: view_item_list – gdy zmienia się lista wyników
  useEffect(() => {
    if (!allResults?.length) return;
    const q = new URLSearchParams(location.search).get("q") || "";
    gaEvent("view_item_list", {
      item_list_id: `search_${q || "all"}`,
      item_list_name: `Wyniki wyszukiwania: ${q}`,
      items: mapProductsToGAItems(allResults),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allResults, location.search]);

  // Canonical (SITE_URL z env albo z window)
  const SITE_URL = useMemo(() => {
    const fromEnv = (env?.SITE_URL || "").replace(/\/+$/, "");
    if (fromEnv) return fromEnv;
    if (typeof window !== "undefined") return window.location.origin.replace(/\/+$/, "");
    return "";
  }, []);
  const canonical = `${SITE_URL}/search?q=${encodeURIComponent(query)}`;

  // Filtrowanie
  const filteredResults = useMemo(() => {
    return allResults.filter((p) => {
      const priceNum = Number(p.price);
      const ratingNum = Number(p.rating);

      if (filters.minPrice !== "" && priceNum < Number(filters.minPrice)) return false;
      if (filters.maxPrice !== "" && priceNum > Number(filters.maxPrice)) return false;
      if (filters.rating !== "" && ratingNum < Number(filters.rating)) return false;

      return true;
    });
  }, [allResults, filters.minPrice, filters.maxPrice, filters.rating]);

  // Sortowanie
  const sortedResults = useMemo(() => {
    const arr = [...filteredResults];
    switch (filters.sort) {
      case "priceAsc":
        return arr.sort((a, b) => Number(a.price) - Number(b.price));
      case "priceDesc":
        return arr.sort((a, b) => Number(b.price) - Number(a.price));
      case "ratingDesc":
        return arr.sort((a, b) => Number(b.rating) - Number(a.rating));
      case "nameAsc":
        return arr.sort((a, b) => String(a.name).localeCompare(String(b.name)));
      case "nameDesc":
        return arr.sort((a, b) => String(b.name).localeCompare(String(a.name)));
      default:
        return arr; // relevance / domyślna kolejność (Fuse już posortował)
    }
  }, [filteredResults, filters.sort]);

  // ✅ Fallback obrazka dla wyników bez image/media
  const resultsWithFallbackImage = useMemo(() => {
    const FALLBACK = "/og-image.jpg"; // z public/
    return sortedResults.map((p) => {
      const hasImg = !!(p?.media?.[0]?.url || p?.image);
      if (hasImg) return p;
      return {
        ...p,
        image: FALLBACK,
        media: [{ url: FALLBACK }],
      };
    });
  }, [sortedResults]);

  return (
    <section className="my-8 max-w-7xl mx-auto px-4">
      <SeoHead
        title={
          query
            ? `Wyniki wyszukiwania: “${query}” — Gift Store`
            : "Wyszukiwarka — Gift Store"
        }
        description={
          query
            ? `Znalezione prezenty dla frazy: ${query}.`
            : "Szukaj prezentów idealnych na każdą okazję."
        }
        canonical={canonical}
        type="website"
      />

      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-extrabold text-mainRed">
          {query ? <>Wyniki dla: “{query}”</> : "Wyszukiwarka"}
        </h1>
        <FiltersDrawer filters={filters} setFilters={setFilters} />
      </div>

      {!query ? (
        <div className="text-gray-500">Wpisz szukaną frazę w polu wyszukiwania.</div>
      ) : resultsWithFallbackImage.length === 0 ? (
        <div className="text-gray-500">Brak wyników. Spróbuj innego hasła.</div>
      ) : (
        <LoadMoreGrid products={resultsWithFallbackImage} setToast={setToast} />
      )}
    </section>
  );
}
