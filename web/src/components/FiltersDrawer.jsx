import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { SlidersHorizontal } from "lucide-react";

export default function FiltersDrawer({ filters, setFilters }) {
  const [open, setOpen] = useState(false);

  const handleChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  // ESC + blokada scrolla body
  useEffect(() => {
    const onKeyDown = (e) => e.key === "Escape" && setOpen(false);
    if (open) {
      document.addEventListener("keydown", onKeyDown);
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.removeEventListener("keydown", onKeyDown);
        document.body.style.overflow = prev;
      };
    }
  }, [open]);

  const clearFilters = () => {
    setFilters((prev) => ({
      ...prev,
      minPrice: "",
      maxPrice: "",
      promo: false,
      bestseller: false,
      sort: "relevance",
    }));
  };

  // ————— PORTAL LAYER —————
  const portal = (
    <>
      {/* OVERLAY – w 100% przezroczysty, przykrywa CAŁY ekran i łapie klik */}
      {open && (
        <div
          aria-hidden
          onClick={() => setOpen(false)}
          className="fixed inset-0 bg-transparent pointer-events-auto z-[2147483646]"
        />
      )}

      {/* PANEL */}
      <aside
        role="dialog"
        aria-modal="true"
        className={[
          "fixed top-0 right-0 h-dvh w-[320px] z-[2147483647]",
          "transform transition-transform duration-300 will-change-transform",
          open ? "translate-x-0" : "translate-x-[104%]",
        ].join(" ")}
      >
        <div className="h-full bg-white/95 dark:bg-[color:var(--surface)] border-l border-gold/30 shadow-2xl rounded-l-2xl overflow-hidden backdrop-blur supports-[backdrop-filter]:backdrop-blur-md">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200/70 dark:border-[color:var(--border)]">
            <h2 className="text-lg font-bold text-mainRed">Filtry</h2>
            <button
              className="text-mainRed font-bold text-xl leading-none px-2 py-1 rounded hover:bg-gold/20"
              onClick={() => setOpen(false)}
              aria-label="Zamknij filtry"
            >
              ✕
            </button>
          </div>

          <div className="p-4 space-y-6 overflow-y-auto h-[calc(100%-56px)]">
            {/* Cena */}
            <div>
              <label className="block text-sm font-bold text-mainRed mb-2">Cena</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="Min"
                  className="f-num w-24 rounded-xl border border-gray-200/80 bg-white/90 px-3 py-2 text-[15px] shadow-inner focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold/60"
                  value={filters.minPrice}
                  onChange={(e) =>
                    handleChange("minPrice", e.target.value ? Number(e.target.value) : "")
                  }
                />
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="Max"
                  className="f-num w-24 rounded-xl border border-gray-200/80 bg-white/90 px-3 py-2 text-[15px] shadow-inner focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold/60"
                  value={filters.maxPrice}
                  onChange={(e) =>
                    handleChange("maxPrice", e.target.value ? Number(e.target.value) : "")
                  }
                />
              </div>
            </div>

            {/* Promocje */}
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={!!filters.promo}
                onChange={(e) => handleChange("promo", e.target.checked)}
                className={[
                  "appearance-none h-5 w-5 rounded-md shadow-inner transition-colors",
                  // LIGHT
                  "border border-gray-300 bg-white/95 hover:border-mainRed/60",
                  // zaznaczenie + ptaszek
                  "checked:bg-mainRed checked:border-mainRed",
                  'checked:bg-[image:var(--chk)] bg-[length:14px_14px] bg-no-repeat bg-center',
                  // focus
                  "focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold/60",
                  // DARK
                  "dark:bg-transparent dark:border-red-500/80 dark:hover:border-red-400",
                  "dark:checked:bg-red-500 dark:checked:border-red-500",
                ].join(" ")}
                style={{
                  ["--chk"]: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 24 24'%3E%3Cpath fill='white' d='M20.285 6.708a1 1 0 0 1 0 1.414l-9 9a1 1 0 0 1-1.414 0l-4-4a1 1 0 1 1 1.414-1.414L10.5 14.914l8.293-8.293a1 1 0 0 1 1.492.087Z'/%3E%3C/svg%3E")`,
                }}
              />
              <span className="text-sm font-semibold text-mainRed">Tylko promocje</span>
            </label>

            {/* Bestsellery */}
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={!!filters.bestseller}
                onChange={(e) => handleChange("bestseller", e.target.checked)}
                className={[
                  "appearance-none h-5 w-5 rounded-md shadow-inner transition-colors",
                  "border border-gray-300 bg-white/95 hover:border-mainRed/60",
                  "checked:bg-mainRed checked:border-mainRed",
                  'checked:bg-[image:var(--chk)] bg-[length:14px_14px] bg-no-repeat bg-center',
                  "focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold/60",
                  "dark:bg-transparent dark:border-red-500/80 dark:hover:border-red-400",
                  "dark:checked:bg-red-500 dark:checked:border-red-500",
                ].join(" ")}
                style={{
                  ["--chk"]: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 24 24'%3E%3Cpath fill='white' d='M20.285 6.708a1 1 0 0 1 0 1.414l-9 9a1 1 0 0 1-1.414 0l-4-4a1 1 0 1 1 1.414-1.414L10.5 14.914l8.293-8.293a1 1 0 0 1 1.492.087Z'/%3E%3C/svg%3E")`,
                }}
              />
              <span className="text-sm font-semibold text-mainRed">Tylko bestsellery</span>
            </label>

            {/* Sortowanie */}
            <div>
              <p className="text-sm font-bold text-mainRed mb-2">Sortuj</p>
              <select
                value={filters.sort}
                onChange={(e) => handleChange("sort", e.target.value)}
                className="w-full rounded-xl border border-gray-200/80 bg-white/90 px-3 py-2 shadow-inner focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold/60"
              >
                <option value="relevance">Domyślnie</option>
                <option value="priceAsc">Cena: rosnąco</option>
                <option value="priceDesc">Cena: malejąco</option>
                <option value="ratingDesc">Ocena: najwyższa</option>
              </select>
            </div>
          </div>

          {/* Akcje */}
          <div className="px-4 py-3 border-t border-gray-200/70 dark:border-[color:var(--border)] flex items-center justify-between">
            <button
              onClick={clearFilters}
              className="text-sm font-semibold text-mainRed hover:underline"
            >
              Wyczyść
            </button>

            <button
              onClick={() => setOpen(false)}
              className="px-4 py-2 rounded-xl bg-gold text-mainRed font-bold hover:bg-mainRed hover:text-gold transition"
            >
              Zastosuj
            </button>
          </div>
        </div>
      </aside>
    </>
  );

  return (
    <>
      {/* Przycisk otwierający */}
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 bg-mainRed text-white px-4 py-2 rounded-xl shadow hover:bg-gold hover:text-mainRed transition"
      >
        <SlidersHorizontal size={18} />
        <span>Filtry</span>
      </button>

      {/* PORTAL do <body> – wychodzi z lokalnych stacking-contextów */}
      {createPortal(portal, document.body)}
    </>
  );
}
