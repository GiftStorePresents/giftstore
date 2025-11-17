// src/components/SearchBar.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FaSearch } from "react-icons/fa";

// korzystamy z globalnego indeksu i wyszukiwarki
import { getSearchVersion, searchProducts } from "../utils/searchUtils";

// Mapowanie SearchItem → obiekt do renderu w liście podpowiedzi
function toUiProduct(p = {}) {
  const slug = p.slug || "";
  const name = p.name || "";
  const description = p.description || "";
  const image = p.image || "/og-image.jpg";

  // Cena: preferuj number → `xx.xx zł`, w przeciwnym razie kreska
  let priceZl = "";
  if (typeof p.price === "number" && !Number.isNaN(p.price)) {
    priceZl = Number(p.price).toFixed(2);
  }

  return { slug, name, description, image, priceZl, __orig: p };
}

export default function SearchBar() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState([]);
  const [ver, setVer] = useState(() => getSearchVersion()); // wersja datasetu
  const ref = useRef(null);
  const navigate = useNavigate();

  // 🔄 odśwież, gdy przyszły nowe dane do wyszukiwarki
  useEffect(() => {
    const onUpdate = () => setVer(getSearchVersion());
    window.addEventListener("search:dataset", onUpdate);
    return () => window.removeEventListener("search:dataset", onUpdate);
  }, []);

  // ⌛ debounce wyszukiwania (lekki, 200 ms)
  const debouncedSearch = useMemo(() => {
    let t;
    return (val) => {
      clearTimeout(t);
      t = setTimeout(() => {
        const query = (val || "").trim();
        if (query.length < 2) {
          setResults([]);
          setOpen(false);
          return;
        }

        // 🔎 właściwe wyszukiwanie (Fuse pod spodem – w utils/searchUtils)
        const hits = searchProducts(query, 8).map(toUiProduct);

        setResults(hits);
        setOpen(hits.length > 0);
      }, 200);
    };
  }, []);

  // Reaguj na wpisywanie
  useEffect(() => {
    debouncedSearch(q);
  }, [q, debouncedSearch, ver]);

  // Zamknij dropdown po kliknięciu poza nim
  useEffect(() => {
    const onClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  // Zamknij ESC
  useEffect(() => {
    const onEsc = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, []);

  // Enter → pełna strona wyników
  function submitFull(e) {
    e.preventDefault();
    const query = q.trim();
    if (!query) return;
    setOpen(false);
    navigate(`/search?q=${encodeURIComponent(query)}`);
  }

  return (
    <div className="relative w-full max-w-md" ref={ref}>
      <form onSubmit={submitFull}>
        <div className="flex items-center bg-white rounded-xl overflow-hidden shadow-sm border border-gold focus-within:ring-2 focus-within:ring-gold">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Szukaj prezentów…"
            className="w-full px-4 py-2 outline-none text-mainRed placeholder:text-gray-400"
            aria-label="Szukaj produktów"
          />
          <button
            type="submit"
            aria-label="Szukaj"
            className="px-3 py-2 text-mainRed hover:text-gold transition"
          >
            <FaSearch />
          </button>
        </div>
      </form>

      {open && (
        <div
          className="absolute left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-gold z-[60]"
          role="listbox"
          aria-label="Podpowiedzi wyszukiwania"
        >
          <ul className="max-h-96 overflow-y-auto py-2">
            {results.map((p) => (
              <li key={p.slug} role="option">
                <Link
                  to={{ pathname: `/product/${encodeURIComponent(p.slug)}` }}
                  state={{ from: "search", q }}
                  replace={false}
                  className="flex items-center gap-3 px-3 py-2 hover:bg-gold/15 transition"
                  onClick={() => setOpen(false)}
                >
                  <img
                    src={p.image || "/og-image.jpg"}
                    alt={p.name}
                    className="w-10 h-10 rounded-lg object-cover border border-gold"
                    loading="lazy"
                    onError={(e) => {
                      e.currentTarget.src = "/og-image.jpg";
                    }}
                  />
                  <div className="flex-1">
                    <div className="font-bold text-mainRed leading-tight">
                      {p.name}
                    </div>
                    <div className="text-xs text-gray-500 line-clamp-1">
                      {p.description}
                    </div>
                  </div>
                  <div className="font-extrabold text-gold whitespace-nowrap">
                    {p.priceZl ? `${p.priceZl} zł` : "—"}
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          <div className="border-t border-gray-100 p-2 text-right">
            <button
              className="text-mainRed font-bold hover:text-gold transition"
              onClick={() => {
                setOpen(false);
                const query = q.trim();
                if (query) navigate(`/search?q=${encodeURIComponent(query)}`);
              }}
            >
              Zobacz wszystkie wyniki →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
