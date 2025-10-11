import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FaSearch } from "react-icons/fa";
import Fuse from "fuse.js";
import products from "../../../giftstore-api/src/seed/popularGiftsData.ts"; // ten sam folder

// Normalizacja PL znaków do wyszukiwania (nie do renderu!)
function normalize(str = "") {
  return String(str)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export default function SearchBar() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState([]);
  const ref = useRef(null);
  const navigate = useNavigate();

  // Budujemy indeks: oryginalny obiekt + pola _norm.* do Fuse
  const fuse = useMemo(() => {
    const indexed = products.map(p => ({
      ...p,
      _norm: {
        name: normalize(p.name),
        description: normalize(p.description),
        tags: Array.isArray(p.tags) ? p.tags.map(normalize) : [],
      },
    }));

    return new Fuse(indexed, {
      includeScore: true,
      keys: [
        { name: "_norm.name", weight: 0.6 },
        { name: "_norm.description", weight: 0.25 },
        { name: "_norm.tags", weight: 0.15 },
      ],
      threshold: 0.32,           // węższe dopasowanie
      ignoreLocation: true,
      minMatchCharLength: 2,     // od 2 znaków
      shouldSort: true,
    });
  }, []);

  // debounce wyszukiwania
  const debouncedSearch = useMemo(() => {
    let t;
    return (val) => {
      clearTimeout(t);
      t = setTimeout(() => {
        const query = val.trim();
        if (query.length < 2) {
          setResults([]);
          setOpen(false);
          return;
        }
        const qn = normalize(query);
        const hits = fuse.search(qn);

        // odfiltruj słabe trafienia i ogranicz liczbę
        const filtered = hits
          .filter(h => (h.score ?? 1) <= 0.5) // im mniejszy score tym lepiej
          .slice(0, 5)
          .map(h => {
            // Zwracamy ORYGINALNY obiekt do renderu (z polskimi znakami)
            const { _norm, ...original } = h.item;
            return original;
          });

        setResults(filtered);
        setOpen(filtered.length > 0);
      }, 200);
    };
  }, [fuse]);

  useEffect(() => { debouncedSearch(q); }, [q, debouncedSearch]);

  // zamykanie po kliknięciu poza dropdown
  useEffect(() => {
    const onClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function submitFull(e) {
    e.preventDefault();
    if (!q.trim()) return;
    setOpen(false);
    navigate(`/search?q=${encodeURIComponent(q.trim())}`);
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
        <div className="absolute left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-gold z-[60]">
          <ul className="max-h-96 overflow-y-auto py-2">
            {results.map((p) => (
              <li key={p.slug}>
                <Link
                  to={`/product/${p.slug}`}
                  className="flex items-center gap-3 px-3 py-2 hover:bg-gold/15 transition"
                  onClick={() => setOpen(false)}
                >
                  <img
                    src={p.image}
                    alt={p.name}
                    className="w-10 h-10 rounded-lg object-cover border border-gold"
                    loading="lazy"
                  />
                  <div className="flex-1">
                    <div className="font-bold text-mainRed leading-tight">{p.name}</div>
                    <div className="text-xs text-gray-500 line-clamp-1">
                      {p.description}
                    </div>
                  </div>
                  <div className="font-extrabold text-gold whitespace-nowrap">
                    {p.price} zł
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
                navigate(`/search?q=${encodeURIComponent(q.trim())}`);
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
