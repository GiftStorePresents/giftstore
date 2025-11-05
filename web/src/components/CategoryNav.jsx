// src/components/CategoryNav.jsx
import { useEffect, useState, useCallback } from "react";
import { Link, useLocation } from "react-router-dom";
import { API_BASE } from "../api";

function normalizeCategories(payload) {
  const arr = Array.isArray(payload)
    ? payload
    : payload?.items || payload?.categories || [];
  return (arr || []).map((c) => ({
    id: c.id || c.slug,
    name: c.name,
    slug: c.slug,
    showInHeader: c.showInHeader !== false,
    showInTiles: c.showInTiles !== false,
    count:
      c._count?.products ??
      c.count ??
      c.productsCount ??
      (typeof c.products === "number" ? c.products : undefined),
  }));
}

export default function CategoryNav() {
  const [cats, setCats] = useState([]);
  const [loading, setLoading] = useState(true);
  const location = useLocation();
  const pathname = location.pathname;
  const search = location.search;

  const fetchCats = useCallback(async () => {
    const commonInit = { credentials: "include", cache: "no-store" };
    setLoading(true);
    try {
      // 1) public
      const r = await fetch(`${API_BASE}/api/categories`, commonInit);
      if (r.ok) {
        const data = normalizeCategories(await r.json());
        setCats(data.filter((c) => c.showInHeader && c.slug !== "bez-kategorii"));
        return;
      }
    } catch {}
    try {
      // 2) admin fallback
      const r2 = await fetch(`${API_BASE}/api/admin/categories`, commonInit);
      if (r2.ok) {
        const data = normalizeCategories(await r2.json());
        setCats(data.filter((c) => c.showInHeader && c.slug !== "bez-kategorii"));
        return;
      }
    } catch {}
    setCats([]);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      await fetchCats();
      if (!alive) return;
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [fetchCats]);

  // Nasłuch zewnętrznego odświeżenia
  useEffect(() => {
    const reload = () => fetchCats();
    window.addEventListener("categories:refresh", reload);
    return () => window.removeEventListener("categories:refresh", reload);
  }, [fetchCats]);

  const isActive = (slug) => {
    if (pathname.startsWith(`/categories/${slug}`)) return true;
    if (pathname === "/products" && search.includes(`category=${slug}`)) return true;
    return false;
  };

  return (
    <nav
      aria-label="Nawigacja kategorii"
      className="bg-white dark:bg-neutral-900 shadow-sm rounded-3xl px-4 py-3 my-4 max-w-7xl mx-auto flex gap-3 justify-center overflow-x-auto scrollbar-thin"
    >
      <Link
        to="/categories/wszystkie"
        className={`flex flex-col items-center px-3 py-1 rounded-xl transition
          ${
            pathname.startsWith("/categories/wszystkie")
              ? "bg-gold text-mainRed font-bold scale-105"
              : "text-mainRed hover:bg-gold hover:text-mainRed"
          }`}
        style={{ minWidth: 100, textDecoration: "none" }}
      >
        <img
          src="https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=400&q=80"
          alt="Wszystkie"
          className="w-12 h-12 rounded-xl object-cover mb-1 border-2 border-gold shadow"
          loading="lazy"
        />
        <span className="text-sm">Wszystkie</span>
      </Link>

      {loading && (
        <span className="px-2 py-1 text-sm text-mainRed/70">Ładowanie…</span>
      )}

      {!loading &&
        cats.map((cat) => (
          <Link
            to={`/categories/${cat.slug}`}
            key={cat.id}
            className={`flex flex-col items-center px-3 py-1 rounded-xl transition
              ${
                isActive(cat.slug)
                  ? "bg-gold text-mainRed font-bold scale-105"
                  : "text-mainRed hover:bg-gold hover:text-mainRed"
              }`}
            style={{ minWidth: 100, textDecoration: "none" }}
            aria-current={isActive(cat.slug) ? "page" : undefined}
          >
            <img
              src={`https://source.unsplash.com/200x200/?${encodeURIComponent(
                cat.slug || cat.name || "gift"
              )}`}
              alt={cat.name}
              className="w-12 h-12 rounded-xl object-cover mb-1 border-2 border-gold shadow"
              loading="lazy"
            />
            <span className="text-sm">
              {cat.name}
              {typeof cat.count === "number" ? ` (${cat.count})` : ""}
            </span>
          </Link>
        ))}
    </nav>
  );
}
