// src/context/SearchDatasetBootstrapper.tsx
import { useEffect } from "react";
import { updateSearchDataset, type SearchItem } from "../utils/searchUtils";
import { useApiProducts } from "../hooks/useApiProducts";

/** Minimalny kształt produktu z API potrzebny do indeksu wyszukiwarki */
type ApiProduct = {
  id?: string | number;
  slug?: string;
  name?: string;
  description?: string;
  tags?: string[];
  image?: string;
  price?: number;
};

export default function SearchDatasetBootstrapper() {
  // Dostosuj parametry do swojego API (page/limit)
  const { items } = useApiProducts({ page: 1, limit: 500 });

  useEffect(() => {
    if (!Array.isArray(items) || items.length === 0) return;

    const toSearchItem = (p: ApiProduct): SearchItem => ({
      name: p.name ?? "",
      description: p.description ?? "",
      tags: p.tags ?? [],
      slug: p.slug,
      id: p.id,
      image: p.image,
      price: p.price,
    });

    updateSearchDataset(items.map(toSearchItem));
  }, [items]);

  return null;
}
