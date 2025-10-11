import { Link, useLocation } from "react-router-dom";

// Dane kategorii – możesz dodać obrazki/ikony
const categories = [
  {
    slug: "wszystkie",
    label: "Wszystkie",
    image:
      "https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=400&q=80",
  },
  {
    slug: "dla-niej",
    label: "Dla Niej",
    image:
      "https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?auto=format&fit=crop&w=400&q=80",
  },
  {
    slug: "dla-niego",
    label: "Dla Niego",
    image:
      "https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?auto=format&fit=crop&w=400&q=80",
  },
  {
    slug: "na-urodziny",
    label: "Na Urodziny",
    image:
      "https://images.unsplash.com/photo-1465101046530-73398c7f28ca?auto=format&fit=crop&w=400&q=80",
  },
  {
    slug: "dla-dzieci",
    label: "Dla Dzieci",
    image:
      "https://images.unsplash.com/photo-1502082553048-f009c37129b9?auto=format&fit=crop&w=400&q=80",
  },
  {
    slug: "dla-mamy",
    label: "Dla Mamy",
    image:
      "https://images.unsplash.com/photo-1519125323398-675f0ddb6308?auto=format&fit=crop&w=400&q=80",
  },
  {
    slug: "dla-taty",
    label: "Dla Taty",
    image:
      "https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=400&q=80",
  },
];

export default function CategoryNav() {
  const location = useLocation();
  const pathname = location.pathname;

  return (
    <nav
      aria-label="Nawigacja kategorii"
      className="bg-white shadow-sm rounded-3xl px-4 py-3 my-4 max-w-7xl mx-auto flex gap-3 justify-center overflow-x-auto scrollbar-thin"
    >
      {categories.map((cat) => {
        const href = `/categories/${cat.slug}`;
        const isActive = pathname === href; // dokładne dopasowanie

        return (
          <Link
            to={href}
            key={cat.slug}
            className={`flex flex-col items-center px-3 py-1 rounded-xl transition
              ${isActive ? "bg-gold text-mainRed font-bold scale-105" : "text-mainRed hover:bg-gold hover:text-mainRed"}`}
            style={{ minWidth: 100, textDecoration: "none" }}
            aria-current={isActive ? "page" : undefined}
          >
            <img
              src={cat.image}
              alt={cat.label}
              className="w-12 h-12 rounded-xl object-cover mb-1 border-2 border-gold shadow"
              loading="lazy"
            />
            <span className="text-sm">{cat.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
