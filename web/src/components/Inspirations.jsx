// src/pages/Inspirations.jsx (lub src/components/Inspirations.jsx)
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  FaHeart,
  FaBirthdayCake,
  FaChild,
  FaCoffee,
  FaGift,
  FaStar,
} from "react-icons/fa";
import { API_BASE } from "../api";

/** Rejestr ikon – klucze muszą zgadzać się z tym, co zapisujesz w SiteSetting / defaults */
const ICON_REGISTRY = {
  heart: <FaHeart className="text-pink-500 text-3xl" />,
  cake: <FaBirthdayCake className="text-mainRed text-3xl" />,
  child: <FaChild className="text-blue-400 text-3xl" />,
  coffee: <FaCoffee className="text-amber-500 text-3xl" />,
  gift: <FaGift className="text-mainRed text-3xl" />,
  star: <FaStar className="text-yellow-400 text-3xl" />,
};

/** Twój lokalny fallback dla konkretnych slugów */
const DEFAULT_BY_SLUG = {
  "prezent-dla-mamy": { iconKey: "heart", link: "/categories/dla-mamy" },
  "na-urodziny": { iconKey: "cake", link: "/categories/na-urodziny" },
  "dla-dzieci": { iconKey: "child", link: "/categories/dla-dzieci" },
  "dla-milosnika-kawy": { iconKey: "coffee", link: "/categories/kawa" },
};

/** Statyczne inspiracje, gdy backend padnie całkowicie */
const STATIC_FALLBACK = [
  {
    slug: "prezent-dla-mamy",
    name: "Prezent dla Mamy",
    description:
      "Wzruszające pomysły na prezent, które sprawią radość każdej mamie.",
    position: 1,
  },
  {
    slug: "na-urodziny",
    name: "Na Urodziny",
    description: "Zaskocz jubilata wyjątkowym podarunkiem na jego dzień.",
    position: 2,
  },
  {
    slug: "dla-dzieci",
    name: "Dla Dzieci",
    description: "Pomysły na prezenty, które zachwycą najmłodszych.",
    position: 3,
  },
  {
    slug: "dla-milosnika-kawy",
    name: "Dla Miłośnika Kawy",
    description: "Wyjątkowe gadżety i zestawy dla kawoszy.",
    position: 4,
  },
];

export default function Inspirations() {
  const [items, setItems] = useState([]);
  const [defaults, setDefaults] = useState({}); // domyślne ikony z admina
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    (async () => {
      setLoading(true);
      // 1) pobierz inspiracje
      try {
        const r = await fetch(
          `${API_BASE}/api/public/inspirations?limit=12`,
          {
            credentials: "include",
            cache: "no-store",
            headers: { Accept: "application/json" },
          }
        );
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        const list = Array.isArray(data?.items)
          ? data.items
          : Array.isArray(data)
          ? data
          : [];
        if (mounted) setItems(list);
      } catch {
        if (mounted) setItems(STATIC_FALLBACK);
      }

      // 2) pobierz domyślne ikony z admina (SiteSetting: inspiration_defaults)
      try {
        const d = await fetch(
          `${API_BASE}/api/public/inspirations/defaults`,
          {
            credentials: "include",
            cache: "no-store",
            headers: { Accept: "application/json" },
          }
        );
        if (d.ok) {
          const json = await d.json();
          if (mounted && json && typeof json === "object") {
            setDefaults(json);
          }
        }
      } catch {
        // brak defaults = zostaje {}
      }

      if (mounted) setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const cards = useMemo(() => {
    const sorted = (items || [])
      .slice()
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

    return sorted.map((it, idx) => {
      const slug = String(it.slug || "").toLowerCase();

      // 1) iconKey z samej inspiracji (jeśli kiedyś dodasz pole iconKey w DB)
      const iconFromItem = it.iconKey && ICON_REGISTRY[String(it.iconKey)];

      // 2) domyślna ikona z admina (SiteSetting: inspiration_defaults[slug])
      const adminDefaultKey =
        defaults && typeof defaults === "object" ? defaults[slug] : undefined;
      const iconFromDefaults =
        adminDefaultKey && ICON_REGISTRY[String(adminDefaultKey)];

      // 3) lokalny fallback (kodowy)
      const local = DEFAULT_BY_SLUG[slug];
      const localIcon =
        local?.iconKey && ICON_REGISTRY[String(local.iconKey)];

      // finalna ikona
      const icon =
        iconFromItem || iconFromDefaults || localIcon || ICON_REGISTRY.heart;

      // 🔴 JEDYNA KLUCZOWA ZMIANA:
      // zamiast local.link / it.linkOverride → zawsze prowadzimy na /inspiracje/:slug
      const link = `/inspiracje/${slug || "inspiracja"}`;

      return {
        ...it,
        slug,
        icon,
        link,
        _key: it.slug || idx,
      };
    });
  }, [items, defaults]);

  return (
    <section className="my-16">
      <h3 className="mb-8 text-center text-2xl font-bold tracking-tight text-mainRed sm:text-left md:text-3xl">
        Inspiracje i pomysły na prezent
      </h3>

      {loading ? (
        <div className="text-sm text-neutral-500">Ładowanie…</div>
      ) : cards.length === 0 ? (
        <div className="text-sm text-neutral-500">
          Brak inspiracji do wyświetlenia.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((it) => (
            <Link
              to={it.link}
              key={it._key}
              className="group relative flex transform-gpu flex-col items-center rounded-3xl border border-transparent
                         bg-white p-7 text-center shadow-md transition-all duration-300
                         hover:scale-[1.03] hover:border-gold hover:shadow-[0_0_25px_rgba(255,215,0,0.2)]
                         dark:bg-[color-mix(in_oklab,var(--surface)_90%,black_10%)]"
              style={{ minHeight: 260, transformOrigin: "center center" }}
            >
              <div
                className="mb-3 flex h-16 w-16 items-center justify-center rounded-full
                           bg-gradient-to-br from-gold-100 to-white shadow-inner
                           transition-transform duration-300 group-hover:scale-110
                           dark:from-[#1f243a] dark:to-[#2a304a]"
                aria-hidden
              >
                {it.icon}
              </div>

              <h4 className="mb-2 text-lg font-bold text-mainRed transition-colors dark:text-[var(--accent)]">
                {it.name}
              </h4>

              <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                {it.description}
              </p>

              <div
                className="pointer-events-none absolute inset-0 rounded-3xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                style={{
                  boxShadow:
                    "0 0 40px 10px rgba(255,215,0,0.15), 0 0 90px 15px rgba(215,38,61,0.08)",
                }}
              />
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
