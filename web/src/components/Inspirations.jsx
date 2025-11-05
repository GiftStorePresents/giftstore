import { Link } from "react-router-dom";
import { FaHeart, FaBirthdayCake, FaChild, FaCoffee } from "react-icons/fa";

const inspirations = [
  {
    title: "Prezent dla Mamy",
    icon: <FaHeart className="text-pink-500 text-3xl" />,
    description: "Wzruszające pomysły na prezent, które sprawią radość każdej mamie.",
    link: "/categories/dla-mamy",
  },
  {
    title: "Na Urodziny",
    icon: <FaBirthdayCake className="text-mainRed text-3xl" />,
    description: "Zaskocz jubilata wyjątkowym podarunkiem na jego dzień.",
    link: "/categories/na-urodziny",
  },
  {
    title: "Dla Dzieci",
    icon: <FaChild className="text-blue-400 text-3xl" />,
    description: "Pomysły na prezenty, które zachwycą najmłodszych.",
    link: "/categories/dla-dzieci",
  },
  {
    title: "Dla Miłośnika Kawy",
    icon: <FaCoffee className="text-amber-500 text-3xl" />,
    description: "Wyjątkowe gadżety i zestawy dla kawoszy.",
    link: "/categories/kawa",
  },
];

export default function Inspirations() {
  return (
    <section className="my-16">
      <h3 className="text-2xl md:text-3xl font-bold tracking-tight text-mainRed mb-8 text-center sm:text-left">
        Inspiracje i pomysły na prezent
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {inspirations.map((item, idx) => (
          <Link
            to={item.link}
            key={idx}
            className="group relative flex flex-col items-center text-center rounded-3xl p-7 bg-white dark:bg-[color-mix(in_oklab,var(--surface)_90%,black_10%)]
                       shadow-md border border-transparent transition-all duration-300 hover:shadow-[0_0_25px_rgba(255,215,0,0.2)] hover:border-gold 
                       hover:scale-[1.03] transform-gpu will-change-transform"
            style={{
              minHeight: 260,
              transformOrigin: "center center", // stabilizuje efekt
            }}
          >
            {/* okrągła ikona */}
            <div className="w-16 h-16 rounded-full flex items-center justify-center bg-gradient-to-br from-gold-100 to-white dark:from-[#1f243a] dark:to-[#2a304a] shadow-inner group-hover:scale-110 transition-transform duration-300 mb-3">
              {item.icon}
            </div>

            <h4 className="font-bold text-lg text-mainRed dark:text-[var(--accent)] mb-2 transition-colors">
              {item.title}
            </h4>

            <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">
              {item.description}
            </p>

            {/* subtelna poświata */}
            <div
              className="absolute inset-0 rounded-3xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-300"
              style={{
                boxShadow:
                  "0 0 40px 10px rgba(255,215,0,0.15), 0 0 90px 15px rgba(215,38,61,0.08)",
              }}
            />
          </Link>
        ))}
      </div>
    </section>
  );
}
