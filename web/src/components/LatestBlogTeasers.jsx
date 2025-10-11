// src/components/LatestBlogTeasers.jsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { env } from "../env";

/**
 * Pobiera najnowsze wpisy bloga.
 * 1) próbuje przez proxy FE:        /api/blog
 * 2) fallback bezpośrednio na API:  {API_URL}/api/blog
 */
async function fetchLatest(limit = 3) {
  const endpoints = [
    `/api/blog?limit=${limit}`,
    `${env.API_URL ? env.API_URL.replace(/\/+$/, "") : ""}/api/blog?limit=${limit}`,
  ].filter(Boolean);

  let lastErr = null;
  for (const url of endpoints) {
    try {
      const r = await fetch(url, {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      const items = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
      return items.slice(0, limit);
    } catch (e) {
      lastErr = e;
    }
  }
  console.warn("[LatestBlogTeasers] fetch failed:", lastErr);
  return [];
}

export default function LatestBlogTeasers() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);

  const SITE_URL = (env.SITE_URL || (typeof window !== "undefined" ? window.location.origin : "")).replace(/\/+$/, "");

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
            image: a?.image || a?.cover || "",
            publishedAt: a?.publishedAt || a?.createdAt || a?.updatedAt || new Date().toISOString(),
          }))
          .filter((x) => !!x.slug);
        if (on) setList(normalized);
      } finally {
        if (on) setLoading(false);
      }
    })();
    return () => {
      on = false;
    };
  }, []);

  if (loading) return null;
  if (!list.length) return null;

  return (
    <section aria-labelledby="latest-blog-heading">
      <div className="flex items-end justify-between mb-4">
        <h2 id="latest-blog-heading" className="text-2xl font-extrabold text-mainRed">
          Z bloga
        </h2>
        <Link to="/blog" className="text-mainRed hover:text-gold font-semibold underline">
          Zobacz wszystkie →
        </Link>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {list.map((a) => {
          const imgAbs = a.image
            ? /^https?:\/\//.test(a.image)
              ? a.image
              : `${SITE_URL}${a.image.startsWith("/") ? "" : "/"}${a.image}`
            : `${SITE_URL}/og-image.jpg`;

          let dateTxt = "";
          try {
            dateTxt = new Date(a.publishedAt).toLocaleDateString("pl-PL");
          } catch {}

          return (
            <article
              key={a.slug}
              className="bg-white rounded-2xl shadow-md overflow-hidden border-2 border-gold hover:border-mainRed transition"
            >
              <Link to={`/blog/${a.slug}`} className="block">
                <img
                  src={imgAbs}
                  alt={a.title}
                  className="w-full h-40 object-cover"
                  loading="lazy"
                  decoding="async"
                />
              </Link>

              <div className="p-4">
                {dateTxt && (
                  <time className="block text-xs text-gray-500 mb-1" dateTime={a.publishedAt}>
                    {dateTxt}
                  </time>
                )}

                <Link to={`/blog/${a.slug}`}>
                  <h3 className="text-lg font-bold text-mainRed leading-tight hover:underline">
                    {a.title}
                  </h3>
                </Link>

                {a.excerpt && <p className="text-gray-700 mt-2 line-clamp-3">{a.excerpt}</p>}

                <Link
                  to={`/blog/${a.slug}`}
                  className="inline-block mt-3 text-sm font-semibold text-mainRed hover:text-gold underline"
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
