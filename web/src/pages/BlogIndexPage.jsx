// src/pages/BlogIndexPage.jsx
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import SeoHead from "../components/SeoHead";
import Breadcrumbs from "../components/Breadcrumbs";
import { env } from "../env";
import { API_BASE } from "../api"; // <— KLUCZOWE: jednolity base do fetchy

/* ------------------- Local styles (scoped) ------------------- */
const BlogLocalStyles = () => (
  <style>{`
    .blog-wrap{
      --ink:#0f172a;           /* tekst jasny motyw */
      --muted:#667085;
      --panel:#ffffff;
      --panel-2:#fafafa;
      --br:#e5e7eb;
      --gold: var(--gold, #ffd166);
      --red:  var(--mainRed, #d7263d);
      color:var(--ink);
    }
    :root[data-theme="dark"] .blog-wrap, html.dark .blog-wrap{
      --ink:#e7ecff;           /* tekst w dark */
      --muted:#a9b6d4;
      --panel:#0b1220;         /* panel tła kart */
      --panel-2:#0f1524;       /* jaśniejszy panel */
      --br:rgba(146,172,255,.22);
    }

    .blog-hero{
      background:
        radial-gradient(1200px 600px at 10% -20%, rgba(255,214,102,.15), transparent 60%),
        radial-gradient(900px 500px at 110% -10%, rgba(215,38,61,.15), transparent 60%);
      border-radius: 22px;
      /* ★ Light mode: czerwony border 1px */
      border: 1px solid var(--mainRed, #d7263d);
    }
    :root[data-theme="dark"] .blog-hero, html.dark .blog-hero{
      background:
        radial-gradient(1200px 600px at 10% -20%, rgba(255,214,102,.15), transparent 60%),
        radial-gradient(900px 500px at 110% -10%, rgba(215,38,61,.14), transparent 60%),
        linear-gradient(180deg, #0b1220 0%, #0a1020 100%);
      box-shadow: inset 0 1px 0 rgba(255,255,255,.03);
      /* ★ Wyłącz border w dark mode (tylko light ma być czerwony) */
      border: 1px solid transparent;
    }

    /* inputs/selecty */
    .blog-input, .blog-select{
      background: var(--panel);
      border: 2px solid var(--gold);
      color: var(--ink);
      border-radius: 14px;
      height: 44px;
      padding: 0 14px;
      transition: box-shadow .15s ease, border-color .15s ease;
    }
    .blog-input::placeholder{ color: color-mix(in oklab, var(--muted) 90%, black 10%); }
    :root[data-theme="dark"] .blog-input, :root[data-theme="dark"] .blog-select,
    html.dark .blog-input, html.dark .blog-select{
      background: var(--panel-2);
      border-color: var(--gold);
      color: var(--ink);
    }
    :root[data-theme="dark"] .blog-input::placeholder, html.dark .blog-input::placeholder{
      color: rgba(231,233,255,.62);
    }
    .blog-input:focus, .blog-select:focus{
      outline: none;
      box-shadow: 0 0 0 3px rgba(255,214,102,.22);
    }

    /* karta artykułu */
    .blog-card{
      background: var(--panel);
      border: 2px solid var(--gold);
      border-radius: 18px;
      overflow: hidden;
      transition: transform .18s ease, box-shadow .2s ease, border-color .15s ease;
      box-shadow: 0 20px 50px rgba(0,0,0,.06);
    }
    :root[data-theme="dark"] .blog-card, html.dark .blog-card{
      background: var(--panel);
      box-shadow: 0 20px 60px rgba(2,6,23,.55);
      border-color: var(--gold);
    }
    .blog-card:hover{
      transform: translateY(-2px);
      box-shadow: 0 22px 60px rgba(0,0,0,.10);
      border-color: var(--red);
    }

    .blog-title{
      color: var(--red);
      font-weight: 900;
      letter-spacing: .2px;
    }

    .blog-btn{
      display:inline-block;
      font-weight: 800;
      padding: .6rem 1rem;
      border-radius: 14px;
      border:2px solid var(--gold);
      background: var(--gold);
      color: #1b1f2a;
      transition: transform .12s ease, filter .15s ease;
    }
    .blog-btn:hover{ transform: translateY(-1px); filter: brightness(1.03); }
    .blog-btn:active{ transform: translateY(0); }

    .blog-tag{
      font-size: .75rem;
      padding: .35rem .6rem;
      border-radius: 999px;
      border:1px solid;
      transition: filter .15s ease, transform .12s ease;
    }
    .blog-tag--on{
      background: color-mix(in oklab, var(--red) 92%, white 8%);
      border-color: var(--red);
      color:#fff;
    }
    .blog-tag--off{
      background: color-mix(in oklab, var(--red) 12%, var(--panel) 88%);
      border-color: color-mix(in oklab, var(--red) 35%, var(--panel) 65%);
      color: var(--red);
    }
    .blog-tag:hover{ filter: brightness(1.04); transform: translateY(-1px); }

    /* ★ Light mode: złoty border dla tagów i searchbox */
    :root:not([data-theme="dark"]) .blog-wrap .blog-tag{
      border-color: var(--gold) !important;
    }
    :root:not([data-theme="dark"]) .blog-wrap .blog-tag--off{
      background: color-mix(in oklab, var(--gold) 8%, var(--panel) 92%);
      color: var(--red);
    }
    :root:not([data-theme="dark"]) .blog-wrap .searchbox{
      border-color: var(--gold) !important; /* dobitne ustawienie w light */
    }

    /* paginacja */
    .blog-page-btn{
      padding:.55rem .9rem; border-radius: 12px; border:2px solid;
      transition: transform .12s ease, filter .15s ease, color .15s ease, background .15s ease;
    }
    .blog-page-btn--on{
      border-color: var(--gold); color: var(--red); background: transparent;
    }
    .blog-page-btn--on:hover{ background: var(--gold); color: var(--red); transform: translateY(-1px); }
    .blog-page-btn--off{
      border-color: rgba(148,163,184,.35); color: rgba(100,116,139,.8); cursor:not-allowed;
    }

    /* --- SEARCHBOX (kontener ma złoty border zawsze) --- */
    .searchbox{
      position: relative;
      width: 100%;
      max-width: 28rem;
      height: 46px;
      border-radius: 14px;
      border: 2px solid var(--gold) !important;   /* stałe obramowanie */
      background: var(--panel);
      box-shadow:
        inset 0 0 0 1px rgba(0,0,0,.02),
        0 6px 20px rgba(0,0,0,.05);
      transition: box-shadow .15s ease, background .15s ease, border-color .15s ease, transform .12s ease;
    }
    :root[data-theme="dark"] .searchbox, html.dark .searchbox{
      background: color-mix(in oklab, var(--panel-2) 88%, black 12%);
      border-color: color-mix(in oklab, var(--gold) 85%, #000 15%) !important;
      box-shadow:
        inset 0 0 0 1px rgba(255,255,255,.02),
        0 14px 36px rgba(2,6,23,.45);
    }
    .searchbox:hover{ border-color: color-mix(in oklab, var(--gold) 100%, #000 0%) !important; transform: translateY(-1px); }
    .searchbox:focus-within{
      border-color: var(--mainRed, #d7263d) !important;
      box-shadow: 0 0 0 3px rgba(215,38,61,.18), 0 12px 28px rgba(0,0,0,.12);
    }

    /* --- WNĘTRZE inputa --- */
    .searchbox__icon{
      position: absolute; left: 12px; top: 50%; transform: translateY(-50%);
      width: 20px; height: 20px; color: #6b7280;
    }
    :root[data-theme="dark"] .searchbox__icon, html.dark .searchbox__icon{ color: #cfd9ff; }

    .searchbox__input{
      position: absolute; inset: 0; width: 100%; height: 100%;
      background: transparent; border: 0; outline: none; border-radius: inherit;
      color: var(--ink); padding: 0 44px 0 42px; font-size: 15px;
      box-sizing: border-box; /* żeby ramka nie rozpychała */
    }
    .searchbox__input::placeholder{
      color: color-mix(in oklab, var(--muted) 80%, white 20%); opacity: .95;
    }

    /* >>> Twoja prośba: ramka na INPUT w dark mode <<< */
    :root[data-theme="dark"] .searchbox__input,
    html.dark .searchbox__input{
      border: 1.5px solid #ff0; /*var(--gold) !important;*/
      border-radius: inherit;
    }
    /* ——— FOCUS tylko dla searchbox ——— */
    :root[data-theme="dark"] body .blog-wrap .searchbox .searchbox__input:focus,
    html.dark body .blog-wrap .searchbox .searchbox__input:focus {
      border-width: 1px !important;
      border-style: solid !important;
      border-color: rgba(235, 73, 9, 1);
      box-shadow: none !important;
      outline: none !important;
    }

    :root[data-theme="dark"] .searchbox__input::placeholder,
    html.dark .searchbox__input::placeholder{
      color: rgba(231,233,255,.78);
    }

    .searchbox__clear{
      position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
      width: 28px; height: 28px; border-radius: 999px;
      border: 1px solid color-mix(in oklab, var(--gold) 55%, #fff 45%);
      background: color-mix(in oklab, var(--gold) 22%, transparent 78%);
      color: #1b1f2a; font-size: 18px; line-height: 1; display: grid; place-items: center;
      transition: filter .15s ease, transform .12s ease, border-color .15s ease, background .15s ease;
    }
    :root[data-theme="dark"] .searchbox__clear, html.dark .searchbox__clear{
      color: var(--ink);
      border-color: color-mix(in oklab, var(--gold) 70%, #000 30%);
      background: color-mix(in oklab, var(--gold) 16%, transparent 84%);
    }
    .searchbox__clear:hover{ filter: brightness(1.07); transform: translateY(-1px); }

    /* === DODANE: wymuś CZERWONĄ ikonę w obu trybach === */
    .blog-wrap .searchbox__icon{ color: var(--mainRed, #d7263d) !important; }
    :root[data-theme="dark"] .blog-wrap .searchbox__icon,
    html.dark .blog-wrap .searchbox__icon{ color: var(--mainRed, #d7263d) !important; }
  `}</style>
);

/* ---------- SearchBox (ikonka + input + clear) ---------- */
function SearchBox({ value, onChange, placeholder = "Szukaj w artykułach…" }) {
  return (
    <div className="searchbox">
      <svg className="searchbox__icon" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M21 21l-4.2-4.2M10.8 18.2a7.4 7.4 0 1 1 0-14.8 7.4 7.4 0 0 1 0 14.8Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <input
        className="searchbox__input"
        type="search"
        inputMode="search"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {!!value && (
        <button
          type="button"
          className="searchbox__clear"
          aria-label="Wyczyść"
          onClick={() => onChange("")}
        >
          ×
        </button>
      )}
    </div>
  );
}

/* ---------- Helper do budowy absolutnych URL-i obrazków względem API ---------- */
function withApiBase(url) {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  const base = (API_BASE || "").replace(/\/+$/, "");
  return `${base}${url.startsWith("/") ? "" : "/"}${url}`;
}

/** Prosty fetcher listy artykułów — API_BASE, preferuj /api/public/blog i pomijaj 404 */
async function fetchArticles() {
  const base = (API_BASE || "").replace(/\/+$/, "");
  const endpoints = [
    `${base}/api/public/blog`, // ← najpierw public (unikamy 404 szumu)
    `${base}/api/blog`,        // potem /api/blog
  ];

  let lastErr = null;
  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (res.status === 404) continue; // cicho spróbuj kolejny endpoint
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
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
            image: a?.image || a?.cover || a?.imageUrl || "",
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
          .filter((x) => !!x.slug);

        if (alive) setList(normalized);
      } catch (e) {
        if (alive) setErr(e);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
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
  const clampedPage = Math.min(page, totalPages);
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

  // JSON-LD: Blog + CollectionPage (hasPart/blogPost)
  const collectionPageJsonLd = useMemo(() => {
    const mapPost = (a) => ({
      "@type": "BlogPosting",
      headline: a.title,
      url: `${SITE_URL}/blog/${a.slug}`,
      ...(a.excerpt ? { description: a.excerpt } : a.description ? { description: a.description } : {}),
      ...(a.image
        ? { image: [ /^https?:\/\//.test(a.image) ? a.image : `${SITE_URL}${a.image.startsWith("/") ? "" : "/"}${a.image}` ] }
        : {}),
      ...(a.publishedAt ? { datePublished: a.publishedAt } : {}),
      ...(a.updatedAt ? { dateModified: a.updatedAt } : {}),
      author: { "@type": "Person", name: a.author || "Gift Store" },
      publisher: { "@type": "Organization", name: "Gift Store", logo: { "@type": "ImageObject", url: `${SITE_URL}/og-image.jpg` } },
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
    <section className="blog-wrap my-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
      <BlogLocalStyles />

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

      {/* HERO */}
      <header className="blog-hero p-6 sm:p-7 mb-6">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-mainRed tracking-tight">Blog</h1>
        <p className="mt-2 text-[15px] text-gray-700 dark:text-[#d7e0ff]">
          Przeglądaj poradniki i inspiracje — znajdź idealny prezent.
        </p>

        {/* Filtry */}
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600 dark:text-[#b8c3e6]">Tag:</label>
            <select
              className="blog-select"
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

          {/* Pole wyszukiwania */}
          <SearchBox value={query} onChange={setQuery} />
        </div>
      </header>

      {/* Stany */}
      {loading && <div className="mt-8">Ładowanie…</div>}
      {err && (
        <div className="mt-8 text-red-600 dark:text-red-400">
          Błąd: {String(err.message || err)} — spróbuj odświeżyć stronę.
        </div>
      )}

      {/* Lista artykułów */}
      {!loading && !err && pageItems.length === 0 && (
        <div className="mt-8 text-gray-500 dark:text-[#b8c3e6]">Brak artykułów dla wybranych filtrów.</div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {pageItems.map((a) => {
          const imgAbs = withApiBase(a.image || a.imageUrl || "/og-image.jpg");

          const dateTxt = (() => {
            try { return new Date(a.publishedAt).toLocaleDateString("pl-PL"); }
            catch { return ""; }
          })();

          return (
            <article key={a.slug} className="blog-card">
              <Link to={`/blog/${a.slug}`} className="block">
                <img
                  src={imgAbs}
                  alt={a.title}
                  className="w-full h-48 object-cover"
                  loading="lazy"
                  decoding="async"
                />
              </Link>

              <div className="p-5 sm:p-6">
                {dateTxt && (
                  <time className="block text-xs text-gray-500 dark:text-[#9fb0da] mb-1" dateTime={a.publishedAt}>
                    {dateTxt}
                  </time>
                )}

                <Link to={`/blog/${a.slug}`}>
                  <h2 className="text-xl blog-title leading-snug hover:underline">
                    {a.title}
                  </h2>
                </Link>

                {(a.excerpt || a.description) && (
                  <p className="mt-2 text-gray-700 dark:text-[#d7e0ff] line-clamp-3">
                    {a.excerpt || a.description}
                  </p>
                )}

                {Array.isArray(a.tags) && a.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {a.tags.slice(0, 6).map((t) => {
                      const on = activeTag === t;
                      return (
                        <button
                          key={`${a.slug}-tag-${t}`}
                          onClick={() => setActiveTag(t)}
                          className={`blog-tag ${on ? "blog-tag--on" : "blog-tag--off"}`}
                          title={`Pokaż wpisy z tagiem #${t}`}
                        >
                          #{t}
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="mt-4">
                  <Link to={`/blog/${a.slug}`} className="blog-btn">
                    Czytaj dalej →
                  </Link>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {/* Paginacja */}
      {totalPages > 1 && (
        <nav className="mt-8 flex items-center justify-center gap-2" aria-label="Paginacja">
          <Link
            to={hasPrev ? prevHref : "#"}
            onClick={(e) => !hasPrev && e.preventDefault()}
            className={`blog-page-btn ${hasPrev ? "blog-page-btn--on" : "blog-page-btn--off"}`}
          >
            ← Poprzednia
          </Link>

          <span className="text-sm text-gray-600 dark:text-[#b8c3e6] px-3">
            Strona <strong>{clampedPage}</strong> z <strong>{totalPages}</strong>
          </span>

          <Link
            to={hasNext ? nextHref : "#"}
            onClick={(e) => !hasNext && e.preventDefault()}
            className={`blog-page-btn ${hasNext ? "blog-page-btn--on" : "blog-page-btn--off"}`}
          >
            Następna →
          </Link>
        </nav>
      )}
    </section>
  );
}
