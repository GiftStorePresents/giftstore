// src/components/GiftOfTheWeek.jsx
import ProductCard from "./ProductCard";
import { useApiProducts } from "../hooks/useApiProducts";
import { mapApiProductToCard } from "../utils/productMapper";
import { useVisibleCount } from "../hooks/useVisibleCount"; // 👈 dynamiczny limit

export default function GiftOfTheWeek({ setToast }) {
  const { items, loading, error } = useApiProducts({ page: 1, limit: 20 });
  const visibleCount = useVisibleCount(); // np. 6 / 9 / 12 zależnie od rozdzielczości

  if (loading) return <section className="my-14 p-4">Ładowanie…</section>;
  if (error)
    return (
      <section className="my-14 p-4 text-red-600">
        {String(error)}
      </section>
    );

  // ✅ dynamiczny limit oraz defensywne mapowanie → ProductCard ma pełen zestaw pól
  const selected = Array.isArray(items)
    ? items
        .slice(0, Math.min(visibleCount, items.length))
        .map((p) => mapApiProductToCard(p))
        .filter(Boolean)
    : [];

  // (opcjonalnie) debug w konsoli
  if (typeof window !== "undefined") {
    window.__GIFTS__ = selected;
  }

  return (
    <section className="my-14">
      <h3 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-mainRed mb-6 text-center sm:text-left">
        Wybrane prezenty tygodnia
      </h3>

      {/* Siatka 1→2→3→4 kolumny w zależności od breakpointów */}
      <div
        className="
          grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4
          gap-5 md:gap-6
          justify-items-center
          auto-rows-fr
        "
      >
        {selected.map((gift, i) => (
          <div key={gift?.id ?? gift?.slug ?? i} className="h-full w-full max-w-[340px]">
            <ProductCard product={gift} setToast={setToast} />
          </div>
        ))}
      </div>
    </section>
  );
}
