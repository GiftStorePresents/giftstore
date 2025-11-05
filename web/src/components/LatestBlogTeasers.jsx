// web/src/components/LatestBlogTeasers.jsx
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { API_BASE } from "../api"; // tak jak w AdminProductsPage

// Zwraca absolutny URL względem API_BASE dla względnych ścieżek (np. /uploads/…)
function withApiBase(url) {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  const base = (API_BASE || "").replace(/\/+$/, "");
  // jeśli base jest pusty (dev proxy), zwróć samą ścieżkę
  return base ? `${base}${url.startsWith("/") ? "" : "/"}${url}` : `${url.startsWith("/") ? "" : "/"}${url}`;
}

async function fetchLatest(limit = 3) {
  const base = (API_BASE || "").replace(/\/+$/, "");
  const endpoints = [
    `${base}/api/public/blog?limit=${limit}`, // najpierw public – unikamy 404
    `${base}/api/blog?limit=${limit}`,        // potem /api/blog
  ];

  let lastErr = null;
  for (const url of endpoints) {
    try {
      const r = await fetch(url, {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (r.status === 404) continue; // cicho pomijamy i próbujemy dalej
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json().catch(() => ([]));
      const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
      return items.slice(0, limit);
    } catch (e) {
      lastErr = e;
    }
  }
  console.warn("[LatestBlogTeasers] fetch failed:", lastErr); // jeśli oba padną
  return [];
}

export default function LatestBlogTeasers() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);

  // Ile elementów pokazać (2 dla 640–1023.98 px, inaczej 3)
  const [maxShown, setMaxShown] = useState(3);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia("(min-width: 640px) and (max-width: 1023.98px)");
    const apply = () => setMaxShown(mql.matches ? 2 : 3);
    apply(); // stan początkowy
    try { mql.addEventListener("change", apply); } catch { mql.addListener(apply); }
    return () => {
      try { mql.removeEventListener("change", apply); } catch { mql.removeListener(apply); }
    };
  }, []);

  useEffect(() => {
    let on = true;
    (async () => {
      try {
        const raw = await fetchLatest(3);
        const normalized = raw
          .map((a) => ({
            slug: a?.slug ?? "",
            title: a?.title || a?.name || "Artykuł",
            excerpt: a?.excerpt || a?.description || "",
            // backend może zwracać imageUrl (mapowane z Article.image)
            imageAbs: withApiBase(a?.imageUrl || a?.image || ""),
            publishedAt:
              a?.publishedAt || a?.createdAt || a?.updatedAt || new Date().toISOString(),
          }))
          .filter((x) => !!x.slug);
        if (on) setList(normalized);
      } finally {
        if (on) setLoading(false);
      }
    })();
    return () => { on = false; };
  }, []);

  // 🔧 HOOK NAD WARUNKIEM — stała kolejność hooków w każdej renderze
  const visible = useMemo(() => list.slice(0, maxShown), [list, maxShown]);

  if (loading || visible.length === 0) return null;

  return (
    <section aria-labelledby="latest-blog-heading" className="my-12">
      <div className="flex items-end justify-between mb-4">
        <h2 id="latest-blog-heading" className="text-2xl font-extrabold text-mainRed dark:text-gold">
          Z bloga
        </h2>
        <Link
          to="/blog"
          className="text-mainRed dark:text-gold/90 hover:text-gold dark:hover:text-gold underline font-semibold"
        >
          Zobacz wszystkie →
        </Link>
      </div>

      {/* Siatka zostaje: 1 / 2 (>=640) / 3 (>=1024) */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((a) => {
          const imgAbs = a.imageAbs || withApiBase("/og-image.jpg");
          let dateTxt = "";
          try {
            dateTxt = new Date(a.publishedAt).toLocaleDateString("pl-PL");
          } catch {}

          return (
            <article
              key={a.slug}
              className="
                group bg-white dark:bg-[#0c1021]
                rounded-2xl shadow-md overflow-hidden
                border-2 border-gold/80 hover:border-gold
                transition-all duration-300
              "
            >
              <Link to={`/blog/${a.slug}`} className="block">
                <div className="w-full aspect-[16/9] overflow-hidden">
                  <img
                    src={imgAbs}
                    alt={a.title}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                    loading="lazy"
                    decoding="async"
                  />
                </div>
              </Link>

              <div className="p-4">
                {dateTxt && (
                  <time
                    className="block text-xs text-gray-500 dark:text-gray-400 mb-1"
                    dateTime={a.publishedAt}
                  >
                    {dateTxt}
                  </time>
                )}

                <Link to={`/blog/${a.slug}`}>
                  <h3
                    className="
                      text-lg font-bold leading-tight
                      text-neutral-900 dark:text-gray-100
                      group-hover:underline
                    "
                  >
                    {a.title}
                  </h3>
                </Link>

                {a.excerpt && (
                  <p className="mt-2 text-gray-700 dark:text-gray-300 line-clamp-3">{a.excerpt}</p>
                )}

                <Link
                  to={`/blog/${a.slug}`}
                  className="
                    inline-block mt-3 text-sm font-semibold
                    text-mainRed dark:text-gold/90
                    hover:text-gold dark:hover:text-gold underline
                  "
                >
                  Czytaj →
                </Link>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
