// =======================================================================
// src/components/ProductGrid.jsx — Gift Store
// Wersja: 2025-10-25
// Zmiany:
// - elastyczna siatka: 1–2–3–4 kolumny (w zależności od szerokości ekranu)
// - idealne centrowanie kart i równe odstępy
// - w pełni kompatybilne z Twoją konfiguracją Tailwind (container + max-w)
// =======================================================================

export default function ProductGrid({ children, className = "" }) {
  return (
    <div
      className={`
        /* === Wrapper sekcji === */
        container mx-auto
        px-4 sm:px-5 md:px-6   /* dopasowane paddingi z Twojego App.jsx */
        w-full max-w-[1200px]  /* bezpieczna szerokość */

        /* === Siatka kart === */
        grid
        grid-cols-1            /* telefony: 1 kolumna */
        xs:grid-cols-2         /* małe ekrany: 2 kolumny */
        md:grid-cols-3         /* średnie ekrany: 3 kolumny */
        lg:grid-cols-4         /* duże ekrany: 4 kolumny */

        /* === Wygląd i proporcje === */
        gap-5 md:gap-6         /* równy odstęp w pionie i poziomie */
        auto-rows-fr           /* wszystkie rzędy o tej samej wysokości */
        items-stretch          /* karty rozciągają się na pełną wysokość */
        justify-items-center   /* każda karta wyśrodkowana w swojej kolumnie */

        ${className}
      `}
    >
      {children}
    </div>
  );
}
