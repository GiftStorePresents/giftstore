import { Link } from "react-router-dom";
import { FaHeart, FaBirthdayCake, FaChild, FaCoffee } from "react-icons/fa";

const inspirations = [
  {
    title: "Prezent dla Mamy",
    icon: <FaHeart className="text-pink-400 text-4xl mb-2" />,
    description: "Wzruszające pomysły na prezent, które sprawią radość każdej mamie.",
    link: "/categories/dla-mamy",
  },
  {
    title: "Na Urodziny",
    icon: <FaBirthdayCake className="text-mainRed text-4xl mb-2" />,
    description: "Zaskocz jubilata wyjątkowym podarunkiem na jego dzień.",
    link: "/categories/na-urodziny",
  },
  {
    title: "Dla Dzieci",
    icon: <FaChild className="text-blue-400 text-4xl mb-2" />,
    description: "Pomysły na prezenty, które zachwycą najmłodszych.",
    link: "/categories/dla-dzieci",
  },
  {
    title: "Dla Miłośnika Kawy",
    icon: <FaCoffee className="text-amber-800 text-4xl mb-2" />,
    description: "Wyjątkowe gadżety i zestawy dla kawoszy.",
    link: "/categories/kawa",
  },
];

export default function Inspirations() {
  return (
    <section className="my-14">
      <h3 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-mainRed mb-6">
        Inspiracje i pomysły na prezent
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 md:gap-6">
        {inspirations.map((item, idx) => (
          <Link
            to={item.link}
            key={idx}
            className="h-full bg-white dark:bg-surface rounded-3xl p-6 sm:p-8 flex flex-col items-center shadow-lg transition-all duration-200 group relative overflow-hidden hover:shadow-[0_4px_24px_0_rgba(255,215,0,0.25),0_1.5px_16px_0_rgba(215,38,61,0.14)] hover:scale-[1.02]"
            aria-label={item.title}
            style={{ minHeight: 280 }}
          >
            <div className="bg-white dark:bg-surface rounded-full p-4 shadow-sm mb-3 group-hover:scale-110 transition">
              {item.icon}
            </div>
            <div className="font-bold text-lg mb-2 text-mainRed group-hover:text-mainRed text-center">
              {item.title}
            </div>
            <div className="text-gray-700 dark:text-muted text-sm text-center line-clamp-3">
              {item.description}
            </div>

            <div
              className="absolute inset-0 pointer-events-none rounded-3xl opacity-0 group-hover:opacity-70 transition-opacity duration-200"
              style={{
                boxShadow:
                  "0 0 40px 8px rgba(255,215,0,0.3), 0 0 120px 12px rgba(215,38,61,0.10)",
              }}
            />
          </Link>
        ))}
      </div>
    </section>
  );
}
