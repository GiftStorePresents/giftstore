// src/components/header/HeaderCategoriesDropdown.jsx
import { Link } from "react-router-dom";
import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";

const categories = [
  { name: "Dla niej", link: "/categories/dla-niej" },
  { name: "Dla niego", link: "/categories/dla-niego" },
  { name: "Dla dzieci", link: "/categories/dla-dzieci" },
  { name: "Na urodziny", link: "/categories/na-urodziny" },
  { name: "Dla mamy", link: "/categories/dla-mamy" },
  { name: "Dla taty", link: "/categories/dla-taty" },
];

export default function HeaderCategoriesDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    if (open) {
      document.addEventListener("mousedown", onClickOutside);
      return () => document.removeEventListener("mousedown", onClickOutside);
    }
  }, [open]);

  return (
    <div ref={ref} className="relative hidden sm:block">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 hover:text-gold transition"
      >
        Kategorie <ChevronDown size={18} />
      </button>

      {open && (
        <div className="absolute right-0 top-full w-52 bg-white text-mainRed rounded-xl shadow-2xl border border-gold z-50 animate-fadeIn flex flex-col py-2">
          {categories.map((cat) => (
            <Link
              key={cat.link}
              to={cat.link}
              className="px-5 py-2 hover:bg-gold hover:text-mainRed rounded-lg transition font-bold"
              onClick={() => setOpen(false)}
            >
              {cat.name}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
