// src/components/Testimonials.jsx
const testimonials = [
  {
    name: "Agnieszka",
    text: "Najlepszy sklep z prezentami! Szybka wysyłka, oryginalne produkty i piękne opakowanie.",
    avatar: "https://randomuser.me/api/portraits/women/60.jpg",
  },
  {
    name: "Karol",
    text: "Polecam! Moja dziewczyna była zachwycona złotą różą. Na pewno wrócę po więcej.",
    avatar: "https://randomuser.me/api/portraits/men/32.jpg",
  },
  {
    name: "Ewa",
    text: "Wyjątkowy wybór prezentów, świetna obsługa klienta. 10/10.",
    avatar: "https://randomuser.me/api/portraits/women/43.jpg",
  },
  {
    name: "Michał",
    text: "Świetna jakość produktów, szybka dostawa i bardzo miła obsługa. Zdecydowanie polecam!",
    avatar: "https://randomuser.me/api/portraits/men/67.jpg",
  },
];

export default function Testimonials() {
  return (
    <section className="my-16">
      <h3 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-mainRed mb-6 text-center">
        Opinie naszych klientów
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6 max-w-6xl mx-auto">
        {testimonials.map((t, i) => (
          <div
            key={i}
            className={`
              h-full
              bg-white dark:bg-[#0c1021]
              rounded-2xl shadow-lg
              p-6 flex flex-col items-center justify-center text-center
              border-t-4 border-gold
              hover:shadow-[0_0_20px_rgba(255,215,0,0.4)]
              transition-all duration-300
              ${i === 3 ? "hidden sm:flex lg:hidden" : ""}
            `}
          >
            {/* Avatar */}
            <img
              src={t.avatar}
              alt={t.name}
              className="w-16 h-16 rounded-full border-4 border-gold mb-3 object-cover"
              loading="lazy"
            />
            {/* Imię */}
            <p className="text-gold font-semibold mb-2 text-lg drop-shadow-sm">
              {t.name}
            </p>
            {/* Treść opinii */}
            <p
              className="
                text-gray-700
                dark:text-gray-200
                text-center text-base italic leading-relaxed
                max-w-[90%]
              "
            >
              “{t.text}”
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
