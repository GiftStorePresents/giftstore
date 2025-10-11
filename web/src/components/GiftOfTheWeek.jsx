import ProductCard from "./ProductCard";
import { useApiProducts } from "../hooks/useApiProducts";
import { mapApiProductToCard } from "../utils/productMapper";

export default function GiftOfTheWeek({ setToast }) {
  const { items, loading, error } = useApiProducts({ page: 1, limit: 20 });

  if (loading) return <section className="my-14 p-4">Ładowanie…</section>;
  if (error) return <section className="my-14 p-4 text-red-600">{String(error)}</section>;

  const selected = items.slice(0, 8).map(mapApiProductToCard);

  return (
    <section className="my-14">
      <h3 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-mainRed mb-6">
        Wybrane prezenty tygodnia
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 md:gap-6">
        {selected.map((gift) => (
          <div key={gift.id} className="h-full">
            <ProductCard product={gift} setToast={setToast} />
          </div>
        ))}
      </div>
    </section>
  );
}
