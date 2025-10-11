// src/pages/BlogIndexPage.jsx
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import SeoHead from "../components/SeoHead";
import Breadcrumbs from "../components/Breadcrumbs";
import { env } from "../env";

/** Prosty fetcher listy artykułów (proxy + fallback) */
async function fetchArticles() {
  const endpoints = [
    "/api/blog", // domyślny route/proxy przez frontend
    `${env.API_URL ? env.API_URL.replace(/\/+$/, "") : ""}/api/blog`, // bezpośrednio do API
  ].filter(Boolean);

  let lastErr = null;
  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // API może zwrócić tablicę albo { items: [...] }
      return Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("Nie udało się pobrać listy artykułów");
}

export default function BlogIndexPage() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState("all");

  const [searchParams, setSearchParams] = useSearchParams();
  const PER_PAGE = 8;

  const SITE_URL = (env.SITE_URL || (typeof window !== "undefined" ? window.location.origin : ""))
    .replace(/\/+$/, "");

  // numer strony z URL (min 1)
  const pageFromQS = Number.parseInt(searchParams.get("page") || "1", 10);
  const page = Number.isFinite(pageFromQS) && pageFromQS > 0 ? pageFromQS : 1;

  // canonical uwzględnia page > 1
  const canonical = `${SITE_URL}/blog${page > 1 ? `?page=${page}` : ""}`;

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const data = await fetchArticles();

        // normalizacja pól
        const normalized = data
          .map((a) => ({
            slug: a?.slug ?? "",
            title: a?.title || a?.name || "Artykuł",
            excerpt: a?.excerpt || a?.lead || "",
            description: a?.description || a?.excerpt || "",
            image: a?.image || a?.cover || "",
            author:
              (a?.author && (a.author.name || a.author)) ||
              (a?.user && a.user.name) ||
              "Gift Store",
            publishedAt:
              a?.publishedAt || a?.createdAt || a?.updatedAt || new Date().toISOString(),
            updatedAt:
              a?.updatedAt || a?.modifiedAt || a?.publishedAt || new Date().toISOString(),
            tags: Array.isArray(a?.tags) ? a.tags : [],
          }))
          .filter((x) => !!x.slug); // tylko wpisy ze slugiem

        if (alive) setList(normalized);
      } catch (e) {
        if (alive) setErr(e);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Resetuj paginację do 1 przy zmianie filtra lub wyszukiwanej frazy
  useEffect(() => {
    if (page !== 1) {
      const next = new URLSearchParams(searchParams);
      next.set("page", "1");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTag, query]);

  // Zbiór tagów do filtra
  const allTags = useMemo(() => {
    const s = new Set();
    list.forEach((a) => (a.tags || []).forEach((t) => s.add(String(t))));
    return ["all", ...Array.from(s).sort()];
  }, [list]);

  // Filtrowanie
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list.filter((a) => {
      const byTag = activeTag === "all" || (a.tags || []).includes(activeTag);
      const inText =
        !q ||
        a.title.toLowerCase().includes(q) ||
        a.excerpt.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q);
      return byTag && inText;
    });
  }, [list, query, activeTag]);

  // Paginacja
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const clampedPage = Math.min(page, totalPages); // jeśli ktoś wpisze z palca za duży page
  const start = (clampedPage - 1) * PER_PAGE;
  const end = start + PER_PAGE;
  const pageItems = filtered.slice(start, end);

  const hasPrev = clampedPage > 1;
  const hasNext = clampedPage < totalPages;
  const prevHref = `/blog?page=${clampedPage - 1}`;
  const nextHref = `/blog?page=${clampedPage + 1}`;

  // JSON-LD: Breadcrumbs
  const breadcrumbsJsonLd = useMemo(
    () => ({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Strona główna", item: `${SITE_URL}/` },
        { "@type": "ListItem", position: 2, name: "Blog", item: `${SITE_URL}/blog` },
      ],
    }),
    [SITE_URL]
  );

  // JSON-LD: Blog + CollectionPage (hasPart/blogPost) – na bazie aktualnej strony
  const collectionPageJsonLd = useMemo(() => {
    const mapPost = (a) => ({
      "@type": "BlogPosting",
      headline: a.title,
      url: `${SITE_URL}/blog/${a.slug}`,
      ...(a.excerpt ? { description: a.excerpt } : a.description ? { description: a.description } : {}),
      ...(a.image
        ? {
            image: [
              /^https?:\/\//.test(a.image)
                ? a.image
                : `${SITE_URL}${a.image.startsWith("/") ? "" : "/"}${a.image}`,
            ],
          }
        : {}),
      ...(a.publishedAt ? { datePublished: a.publishedAt } : {}),
      ...(a.updatedAt ? { dateModified: a.updatedAt } : {}),
      author: { "@type": "Person", name: a.author || "Gift Store" },
      publisher: {
        "@type": "Organization",
        name: "Gift Store",
        logo: { "@type": "ImageObject", url: `${SITE_URL}/og-image.jpg` },
      },
    });

    return {
      "@context": "https://schema.org",
      "@type": ["Blog", "CollectionPage"],
      name: `Blog – artykuły i poradniki${totalPages > 1 ? ` (strona ${clampedPage}/${totalPages})` : ""}`,
      url: canonical,
      ...(pageItems.length ? { hasPart: pageItems.map(mapPost), blogPost: pageItems.map(mapPost) } : {}),
    };
  }, [pageItems, SITE_URL, canonical, clampedPage, totalPages]);

  return (
    <section className="my-10 max-w-5xl mx-auto px-4">
      {/* rel="prev/next" w <head> */}
      {(hasPrev || hasNext) && (
        <Helmet>
          {hasPrev && <link rel="prev" href={prevHref} />}
          {hasNext && <link rel="next" href={nextHref} />}
        </Helmet>
      )}

      <SeoHead
        title={`Blog – Gift Store${totalPages > 1 ? ` (strona ${clampedPage})` : ""}`}
        description="Porady, inspiracje prezentowe i przewodniki zakupowe."
        image={`${SITE_URL}/og-image.jpg`}
        canonical={canonical}
        type="website"
        jsonLd={[collectionPageJsonLd, breadcrumbsJsonLd]}
      />

      <Breadcrumbs
        items={[
          { name: "Strona główna", url: "/" },
          { name: "Blog", url: "/blog" },
        ]}
      />

      <header className="mb-6">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-mainRed tracking-tight">Blog</h1>
        <p className="text-gray-600 mt-2">
          Przeglądaj poradniki i inspiracje — znajdź idealny prezent.
        </p>
      </header>

      {/* Filtry */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">Tag:</label>
          <select
            className="border-2 border-gold rounded-xl px-3 py-2 focus:outline-none"
            value={activeTag}
            onChange={(e) => setActiveTag(e.target.value)}
          >
            {allTags.map((t) => (
              <option value={t} key={t}>
                {t === "all" ? "Wszystko" : `#${t}`}
              </option>
            ))}
          </select>
        </div>

        <input
          type="search"
          placeholder="Szukaj w artykułach…"
          className="w-full sm:w-80 border-2 border-gold rounded-xl px-4 py-2 focus:outline-none"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {/* Stany */}
      {loading && <div className="mt-8">Ładowanie…</div>}
      {err && (
        <div className="mt-8 text-red-600">
          Błąd: {String(err.message || err)} — spróbuj odświeżyć stronę.
        </div>
      )}

      {/* Lista artykułów */}
      {!loading && !err && pageItems.length === 0 && (
        <div className="mt-8 text-gray-500">Brak artykułów dla wybranych filtrów.</div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {pageItems.map((a) => {
          const imgAbs = a.image
            ? /^https?:\/\//.test(a.image)
              ? a.image
              : `${SITE_URL}${a.image.startsWith("/") ? "" : "/"}${a.image}`
            : `${SITE_URL}/og-image.jpg`;

          const dateTxt = (() => {
            try {
              return new Date(a.publishedAt).toLocaleDateString("pl-PL");
            } catch {
              return "";
            }
          })();

          return (
            <article
              key={a.slug}
              className="bg-white rounded-2xl shadow-md overflow-hidden border-2 border-gold hover:border-mainRed transition"
            >
              <Link to={`/blog/${a.slug}`} className="block">
                <img
                  src={imgAbs}
                  alt={a.title}
                  className="w-full h-48 object-cover"
                  loading="lazy"
                  decoding="async"
                />
              </Link>

              <div className="p-5">
                {dateTxt && (
                  <time className="block text-xs text-gray-500 mb-1" dateTime={a.publishedAt}>
                    {dateTxt}
                  </time>
                )}

                <Link to={`/blog/${a.slug}`}>
                  <h2 className="text-xl font-extrabold text-mainRed leading-snug hover:underline">
                    {a.title}
                  </h2>
                </Link>

                {(a.excerpt || a.description) && (
                  <p className="text-gray-700 mt-2 line-clamp-3">{a.excerpt || a.description}</p>
                )}

                {/* Tagi */}
                {Array.isArray(a.tags) && a.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {a.tags.slice(0, 6).map((t) => (
                      <button
                        key={`${a.slug}-tag-${t}`}
                        onClick={() => setActiveTag(t)}
                        className={`text-xs px-2.5 py-1 rounded-full border ${
                          activeTag === t
                            ? "bg-mainRed text-white border-mainRed"
                            : "bg-mainRed/10 text-mainRed border-mainRed/20"
                        }`}
                        title={`Pokaż wpisy z tagiem #${t}`}
                      >
                        #{t}
                      </button>
                    ))}
                  </div>
                )}

                <div className="mt-4">
                  <Link
                    to={`/blog/${a.slug}`}
                    className="inline-block bg-gold text-mainRed font-bold px-4 py-2 rounded-xl border-2 border-gold hover:bg-mainRed hover:text-gold transition"
                  >
                    Czytaj dalej →
                  </Link>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {/* Paginacja UI */}
      {totalPages > 1 && (
        <nav className="mt-8 flex items-center justify-center gap-2" aria-label="Paginacja">
          <Link
            to={hasPrev ? prevHref : "#"}
            onClick={(e) => !hasPrev && e.preventDefault()}
            className={`px-3 py-2 rounded-xl border-2 ${
              hasPrev
                ? "border-gold text-mainRed hover:bg-gold hover:text-mainRed transition"
                : "border-gray-200 text-gray-400 cursor-not-allowed"
            }`}
          >
            ← Poprzednia
          </Link>

          <span className="text-sm text-gray-600 px-3">
            Strona <strong>{clampedPage}</strong> z <strong>{totalPages}</strong>
          </span>

          <Link
            to={hasNext ? nextHref : "#"}
            onClick={(e) => !hasNext && e.preventDefault()}
            className={`px-3 py-2 rounded-xl border-2 ${
              hasNext
                ? "border-gold text-mainRed hover:bg-gold hover:text-mainRed transition"
                : "border-gray-200 text-gray-400 cursor-not-allowed"
            }`}
          >
            Następna →
          </Link>
        </nav>
      )}
    </section>
  );
}
