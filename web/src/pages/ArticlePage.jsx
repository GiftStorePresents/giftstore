// src/pages/ArticlePage.jsx
import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import SeoHead from "../components/SeoHead";
import Breadcrumbs from "../components/Breadcrumbs";
import { env } from "../env";
import Showdown from "showdown";

/* ---------- Markdown setup ---------- */
const md = new Showdown.Converter({
  tables: true,
  openLinksInNewWindow: true,
  simplifiedAutoLink: true,
  strikethrough: true,
  tasklists: true,
});

/* ---------- Helpers ---------- */
function looksLikeHtml(s = "") {
  return /<\/?[a-z][\s\S]*>/i.test(s);
}

function addRelToLinks(html) {
  return html.replace(/<a\s+([^>]*href=)/gi, '<a rel="noopener noreferrer nofollow" $1');
}

function absUrl(base, maybeRel) {
  if (!maybeRel) return undefined;
  if (/^https?:\/\//i.test(maybeRel)) return maybeRel;
  const prefix = base.endsWith("/") ? base.slice(0, -1) : base;
  const path = maybeRel.startsWith("/") ? maybeRel : `/${maybeRel}`;
  return `${prefix}${path}`;
}

/* ---------- Minimalny fetcher artykułu ---------- */
async function fetchArticle(slug) {
  const endpoints = [
    `/api/blog/${slug}`, // proxy przez frontend
    `${env.API_URL ? env.API_URL.replace(/\/+$/, "") : ""}/api/blog/${slug}`, // fallback bezpośredni
  ].filter(Boolean);

  let lastErr = null;
  for (const url of endpoints) {
    try {
      const res = await fetch(url, { credentials: "include", headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("Nie udało się pobrać artykułu");
}

/* ---------- Komponent ---------- */
export default function ArticlePage() {
  const { slug = "" } = useParams();

  const [article, setArticle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const SITE_URL = (
    env.SITE_URL || (typeof window !== "undefined" ? window.location.origin : "")
  ).replace(/\/+$/, "");
  const canonical = `${SITE_URL}/blog/${slug}`;

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const data = await fetchArticle(slug);

        // Ujednolicenie pól z backendu
        const rawContent = data.content ?? data.body ?? data.contentHtml ?? "";
        const contentHtml = data.contentHtml?.trim()
          ? String(data.contentHtml)
          : looksLikeHtml(rawContent)
          ? String(rawContent)
          : addRelToLinks(md.makeHtml(String(rawContent || "")));

        const normalized = {
          slug: data.slug || slug,
          title: data.title || data.name || "Artykuł",
          excerpt: data.excerpt || data.lead || "",
          description: data.description || data.excerpt || "",
          image: data.coverImage || data.image || data.cover || "",
          author:
            (data.author && (data.author.name || data.author)) ||
            (data.user && data.user.name) ||
            "Redakcja Gift Store",
          publishedAt: data.publishedAt || data.createdAt || new Date().toISOString(),
          updatedAt: data.updatedAt || data.modifiedAt || data.publishedAt || new Date().toISOString(),
          contentHtml,
          tags: Array.isArray(data.tags) ? data.tags : [],
        };

        if (alive) setArticle(normalized);
      } catch (e) {
        if (alive) setErr(e);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [slug]);

  /* ---------- JSON-LD ---------- */
  const breadcrumbsJsonLd = useMemo(() => {
    if (!article) return null;
    return {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Strona główna", item: `${SITE_URL}/` },
        { "@type": "ListItem", position: 2, name: "Blog", item: `${SITE_URL}/blog` },
        { "@type": "ListItem", position: 3, name: article.title, item: canonical },
      ],
    };
  }, [article, SITE_URL, canonical]);

  const blogPostingJsonLd = useMemo(() => {
    if (!article) return null;

    const imgAbs = absUrl(SITE_URL, article.image) || `${SITE_URL}/og-image.jpg`;

    return {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: article.title,
      ...(article.excerpt || article.description
        ? { description: article.excerpt || article.description }
        : {}),
      image: [imgAbs],
      url: canonical,
      ...(article.publishedAt ? { datePublished: article.publishedAt } : {}),
      ...(article.updatedAt ? { dateModified: article.updatedAt } : {}),
      author: { "@type": "Person", name: article.author || "Redakcja Gift Store" },
      publisher: {
        "@type": "Organization",
        name: "Gift Store",
        logo: { "@type": "ImageObject", url: `${SITE_URL}/og-image.jpg` },
      },
      mainEntityOfPage: canonical,
    };
  }, [article, SITE_URL, canonical]);

  /* ---------- UI stany ---------- */
  if (loading) {
    return (
      <section className="my-10 max-w-4xl mx-auto px-4">
        <h1 className="text-3xl font-bold text-mainRed">Blog</h1>
        <p className="mt-4">Ładowanie…</p>
      </section>
    );
  }

  if (err) {
    return (
      <section className="my-10 max-w-4xl mx-auto px-4">
        <h1 className="text-3xl font-bold text-mainRed">Blog</h1>
        <p className="mt-4 text-red-600">Błąd: {String(err.message || err)}</p>
        <Link to="/blog" className="underline text-mainRed hover:text-gold mt-4 inline-block">
          ← Wróć do listy wpisów
        </Link>
      </section>
    );
  }

  if (!article) {
    return (
      <section className="my-10 max-w-4xl mx-auto px-4">
        <h1 className="text-3xl font-bold text-mainRed">Blog</h1>
        <p className="mt-4 text-gray-600">Nie znaleziono artykułu.</p>
        <Link to="/blog" className="underline text-mainRed hover:text-gold mt-4 inline-block">
          ← Wróć do listy wpisów
        </Link>
      </section>
    );
  }

  /* ---------- Render ---------- */
  const heroImgAbs = absUrl(SITE_URL, article.image);

  return (
    <section className="my-10 max-w-4xl mx-auto px-4">
      <SeoHead
        title={`${article.title} – Blog Gift Store`}
        description={article.excerpt || article.description || "Porady i inspiracje prezentowe."}
        image={heroImgAbs || `${SITE_URL}/og-image.jpg`}
        canonical={canonical}
        type="article"
        jsonLd={[blogPostingJsonLd, breadcrumbsJsonLd].filter(Boolean)}
      />

      <Breadcrumbs
        items={[
          { name: "Strona główna", url: "/" },
          { name: "Blog", url: "/blog" },
          { name: article.title, url: `/blog/${article.slug}` },
        ]}
      />

      <header className="mb-6">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-mainRed tracking-tight">
          {article.title}
        </h1>
        <div className="mt-3 text-sm text-gray-500">
          <span>
            {article.author ? `Autor: ${article.author}` : "Redakcja Gift Store"} •{" "}
            {new Date(article.publishedAt).toLocaleDateString("pl-PL")}
          </span>
          {article.updatedAt && article.updatedAt !== article.publishedAt && (
            <span className="ml-2">
              (aktualizacja: {new Date(article.updatedAt).toLocaleDateString("pl-PL")})
            </span>
          )}
        </div>
      </header>

      {heroImgAbs && (
        <div className="mb-6">
          <img
            src={heroImgAbs}
            alt={article.title}
            className="w-full rounded-2xl border-2 border-gold shadow-sm object-cover max-h-[420px]"
            loading="lazy"
          />
        </div>
      )}

      {/* Treść HTML (sanityzacja po stronie backendu rekomendowana) */}
      {article.contentHtml ? (
        <article
          className="prose max-w-none prose-p:leading-7 prose-img:rounded-xl prose-headings:text-mainRed"
          dangerouslySetInnerHTML={{ __html: article.contentHtml }}
        />
      ) : (
        <p className="text-gray-700 leading-relaxed whitespace-pre-line">
          {article.description || "Brak treści artykułu."}
        </p>
      )}

      {/* Tagowanie / nawigacja */}
      <footer className="mt-10 flex flex-wrap items-center gap-3">
        {Array.isArray(article.tags) &&
          article.tags.map((t) => (
            <span
              key={t}
              className="text-xs bg-mainRed/10 text-mainRed px-2.5 py-1 rounded-full border border-mainRed/20"
            >
              #{t}
            </span>
          ))}
        <Link to="/blog" className="ml-auto underline text-mainRed hover:text-gold">
          ← Wszystkie artykuły
        </Link>
      </footer>
    </section>
  );
}
