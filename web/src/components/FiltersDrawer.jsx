// src/components/FiltersDrawer.js
import { useState, useEffect, useRef } from "react";
import { SlidersHorizontal } from "lucide-react";

export default function FiltersDrawer({ filters, setFilters }) {
  const [open, setOpen] = useState(false);
  const drawerRef = useRef(null);

  const handleChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  // ESC zamyka drawer
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener("keydown", onKeyDown);
      return () => document.removeEventListener("keydown", onKeyDown);
    }
  }, [open]);

  return (
    <>
      {/* Ikona otwierająca */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 bg-mainRed text-white px-4 py-2 rounded-xl shadow hover:bg-gold hover:text-mainRed transition"
      >
        <SlidersHorizontal size={18} />
        <span>Filtry</span>
      </button>

      {/* Tło (overlay) */}
      {open && (
        <div
          className="fixed inset-0 bg-black bg-opacity-40 z-40"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Panel boczny */}
      <aside
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        className={`fixed top-0 right-0 h-full w-80 bg-white shadow-2xl border-l border-gold z-50 transform transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex justify-between items-center p-4 border-b border-gray-200">
          <h2 className="text-lg font-bold text-mainRed">Filtry</h2>
          <button
            className="text-mainRed font-bold text-xl"
            onClick={() => setOpen(false)}
            aria-label="Zamknij filtry"
          >
            ✕
          </button>
        </div>

        <div className="p-4 flex flex-col gap-6 overflow-y-auto h-full">
          {/* Cena */}
          <div>
            <label className="block text-sm font-bold text-mainRed mb-2">
              Cena
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="Min"
                className="border rounded px-2 py-1 w-20"
                value={filters.minPrice}
                onChange={(e) =>
                  handleChange(
                    "minPrice",
                    e.target.value ? Number(e.target.value) : ""
                  )
                }
              />
              <input
                type="number"
                placeholder="Max"
                className="border rounded px-2 py-1 w-20"
                value={filters.maxPrice}
                onChange={(e) =>
                  handleChange(
                    "maxPrice",
                    e.target.value ? Number(e.target.value) : ""
                  )
                }
              />
            </div>
          </div>

          {/* Ocena */}
          <div>
            <label className="block text-sm font-bold text-mainRed mb-2">
              Ocena
            </label>
            <select
              value={filters.rating}
              onChange={(e) =>
                handleChange(
                  "rating",
                  e.target.value ? Number(e.target.value) : ""
                )
              }
              className="border rounded px-2 py-1 w-full"
            >
              <option value="">Wszystkie</option>
              <option value="4">4★ i wyżej</option>
              <option value="3">3★ i wyżej</option>
              <option value="2">2★ i wyżej</option>
            </select>
          </div>

          {/* Promocja */}
          <div className="flex items-center gap-2">
            <input
              id="promo"
              type="checkbox"
              checked={!!filters.promo}
              onChange={(e) => handleChange("promo", e.target.checked)}
            />
            <label htmlFor="promo" className="text-sm font-bold text-mainRed">
              Tylko promocje
            </label>
          </div>

          {/* Bestseller */}
          <div className="flex items-center gap-2">
            <input
              id="bestseller"
              type="checkbox"
              checked={!!filters.bestseller}
              onChange={(e) => handleChange("bestseller", e.target.checked)}
            />
            <label
              htmlFor="bestseller"
              className="text-sm font-bold text-mainRed"
            >
              Tylko bestsellery
            </label>
          </div>

          {/* Tagi */}
          <div>
            <label className="block text-sm font-bold text-mainRed mb-2">
              Tagi
            </label>
            <select
              value={filters.tag}
              onChange={(e) => handleChange("tag", e.target.value)}
              className="border rounded px-2 py-1 w-full"
            >
              <option value="">Wszystkie</option>
              <option value="dla dzieci">Dla dzieci</option>
              <option value="dom">Dom</option>
              <option value="organizacja">Organizacja</option>
            </select>
          </div>

          {/* Sortowanie */}
          <div>
            <label className="block text-sm font-bold text-mainRed mb-2">
              Sortuj
            </label>
            <select
              value={filters.sort}
              onChange={(e) => handleChange("sort", e.target.value)}
              className="border rounded px-2 py-1 w-full"
            >
              <option value="relevance">Domyślnie</option>
              <option value="priceAsc">Cena: rosnąco</option>
              <option value="priceDesc">Cena: malejąco</option>
              <option value="ratingDesc">Ocena: najwyższa</option>
            </select>
          </div>

          {/* Zastosuj */}
          <button
            onClick={() => setOpen(false)}
            className="bg-mainRed text-white py-2 rounded-xl font-bold hover:bg-gold hover:text-mainRed transition"
          >
            Zastosuj
          </button>
        </div>
      </aside>
    </>
  );
}
