import { Link } from "react-router-dom";
import SmartImage from "./SmartImage";

const categories = [
  { name: "Dla niej",   image: "https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?auto=format&fit=crop&w=800&q=80", link: "/categories/dla-niej" },
  { name: "Dla niego",  image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=800&q=80", link: "/categories/dla-niego" },
  { name: "Na urodziny",image: "https://images.unsplash.com/photo-1465101046530-73398c7f28ca?auto=format&fit=crop&w=800&q=80", link: "/categories/na-urodziny" },
  { name: "Dla dzieci", image: "https://images.unsplash.com/photo-1502082553048-f009c37129b9?auto=format&fit=crop&w=800&q=80", link: "/categories/dla-dzieci" },
  { name: "Dla mamy",   image: "https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?auto=format&fit=crop&w=800&q=80", link: "/categories/dla-mamy" },
  { name: "Dla taty",   image: "https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=800&q=80", link: "/categories/dla-taty" },
];

export default function CategoryTiles() {
  return (
    <section id="categories" className="my-10">
      <h3 className="text-2xl font-bold mb-6 text-mainRed">Wybierz kategorię prezentów</h3>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
        {categories.map((cat) => (
          <Link
            to={cat.link}
            key={cat.name}
            className="
              relative w-full h-44 md:h-56 rounded-2xl overflow-hidden group
              border-2 border-mainRed hover:border-gold transition shadow-lg
            "
            aria-label={cat.name}
          >
            {/* Obraz pełnoekranowy w kafelku */}
            <SmartImage
              src={cat.image}
              alt={cat.name}
              fill
              className="rounded-2xl"     // wrapper: pełny kafel
              imgClassName="rounded-2xl"   // obraz docięty do zaokrągleń
            />

            {/* overlay LIGHT */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent z-10 group-hover:from-black/50 transition-colors rounded-2xl" />

            {/* overlay DARK – bordowe aurory */}
            <div
              className="absolute inset-0 z-10 pointer-events-none hidden dark:block rounded-2xl"
              style={{
                background:
                  "radial-gradient(600px 260px at 80% 20%, rgba(186,26,88,.28), transparent 70%)," +
                  "radial-gradient(520px 220px at 20% 80%, rgba(32,216,171,.18), transparent 70%)",
              }}
              aria-hidden
            />

            <div className="absolute bottom-3 left-0 w-full text-center z-20">
              <span className="text-white font-bold text-xl drop-shadow-md group-hover:text-gold transition">
                {cat.name}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
