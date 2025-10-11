// src/seo/jsonld.js
export const SITE_NAME = "Gift Store";
export const ORG = {
  legalName: "Gift Store Sp. z o.o.",
  logo: "/logo-512.png",
  sameAs: ["https://www.facebook.com/giftstore", "https://www.instagram.com/giftstore"],
};

export function abs(url, siteUrl) {
  if (!url) return siteUrl;
  return /^https?:\/\//.test(url) ? url : `${siteUrl.replace(/\/+$/,"")}/${url.replace(/^\/+/,"")}`;
}

/* --- 1) Organization --- */
export function buildOrganization(siteUrl) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": SITE_NAME,
    "legalName": ORG.legalName,
    "url": siteUrl,
    "logo": abs(ORG.logo, siteUrl),
    "sameAs": ORG.sameAs
  };
}

/* --- 2) WebSite (+ potencjalnie SearchAction) --- */
export function buildWebSite(siteUrl) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": SITE_NAME,
    "url": siteUrl,
    "potentialAction": {
      "@type": "SearchAction",
      "target": `${siteUrl}/search?q={search_term_string}`,
      "query-input": "required name=search_term_string"
    }
  };
}

/* --- 3) BreadcrumbList --- */
/* breadcrumbs: [{ name: "Strona główna", item: siteUrl }, ...] */
export function buildBreadcrumbs(breadcrumbs) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": breadcrumbs.map((b, i) => ({
      "@type": "ListItem",
      "position": i + 1,
      "name": b.name,
      "item": b.item
    }))
  };
}

/* --- 4) Product --- */
export function buildProduct({ product, siteUrl }) {
  const url = abs(`/product/${product.slug}`, siteUrl);
  const image = Array.isArray(product.media) && product.media[0]?.url ? abs(product.media[0].url, siteUrl) : abs("/og-image.jpg", siteUrl);

  // Mapowanie dostępności (podmień wg swojej logiki)
  const availability = (product.stock === 0 || product.stock === "out")
    ? "https://schema.org/OutOfStock"
    : "https://schema.org/InStock";

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": product.name,
    "description": product.description,
    "image": image,
    "sku": product.sku || product.id,
    "brand": product.brand ? { "@type": "Brand", "name": product.brand } : undefined,
    "category": product.category,
    "url": url,
    "offers": {
      "@type": "Offer",
      "priceCurrency": "PLN",
      "price": product.price,
      "availability": availability,
      "url": url,
      // (opcjonalnie) daty promocji, jeśli masz:
      // "priceValidUntil": "2026-12-31",
      // "itemCondition": "https://schema.org/NewCondition"
    },
    // (opcjonalnie) oceny, jeśli masz rating/opinie:
    ...(typeof product.rating === "number" ? {
      "aggregateRating": {
        "@type": "AggregateRating",
        "ratingValue": product.rating,
        "reviewCount": product.reviewsCount || 0
      }
    } : {})
  };
}

/* --- 5) CollectionPage (kategoria) --- */
export function buildCollectionPage({ category, siteUrl, products = [] }) {
  const url = abs(`/categories/${category.slug}`, siteUrl);
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": `Kategoria: ${category.name} – ${SITE_NAME}`,
    "description": category.description || `Produkty w kategorii ${category.name}`,
    "url": url,
    // (opcjonalnie) lista elementów
    "hasPart": products.slice(0, 20).map(p => ({
      "@type": "Product",
      "name": p.name,
      "url": abs(`/product/${p.slug}`, siteUrl)
    }))
  };
}

/* --- 6) Article (np. wpis blogowy / poradnik prezentowy) --- */
export function buildArticle({ article, siteUrl }) {
  const url = abs(`/blog/${article.slug}`, siteUrl);
  const image = article.image ? abs(article.image, siteUrl) : abs("/og-image.jpg", siteUrl);
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": article.title,
    "description": article.excerpt || article.description,
    "image": image,
    "author": article.author ? { "@type": "Person", "name": article.author } : { "@type": "Organization", "name": SITE_NAME },
    "datePublished": article.publishedAt,
    "dateModified": article.updatedAt || article.publishedAt,
    "mainEntityOfPage": url
  };
}
