// src/components/HeroSection.jsx
export default function HeroSection() {
  return (
    <section
      className="
        hero-banner relative rounded-3xl overflow-hidden mb-10
        h-72 md:h-96 flex items-center justify-center shadow-lg
      "
    >
      {/* Zdjęcie tła */}
      <img
        src="https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=1600&q=80"
        alt="Prezent"
        className="hero-photo absolute w-full h-full object-cover"
        loading="lazy"
      />

      {/* LIGHT overlay (pomarańcz → złoto) */}
      <div className="hero-overlay-light absolute inset-0 pointer-events-none bg-gradient-to-br from-mainRed/80 to-gold/70" />

      {/* DARK overlay (burgundowy gradient – styl niżej w CSS) */}
      <div className="hero-overlay-dark absolute inset-0 pointer-events-none" />

      {/* Tekst + CTA */}
      <div className="relative z-10 text-center px-4">
        <h1 className="hero-title text-3xl md:text-5xl font-extrabold mb-3 drop-shadow-xl">
          Najlepsze prezenty na każdą okazję!
        </h1>

        <p className="hero-subtitle text-lg md:text-2xl mb-6 font-semibold">
          Znajdź coś wyjątkowego dla bliskich – szybka wysyłka, bogata oferta.
        </p>

        <a
          href="#categories"
          className="hero-cta inline-block font-bold px-8 py-3 rounded-2xl shadow-xl
                    bg-mainRed text-white hover:brightness-110 transition"
        >
          Zobacz kategorie
        </a>
      </div>
    </section>
  );
}