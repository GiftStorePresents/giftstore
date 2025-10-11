// src/components/SeoHead.js
import React from "react";

/**
 * Prosty, bez dodatkowych zależności <SeoHead />
 * - <title>, <meta name="description">
 * - Open Graph / Twitter
 * - <link rel="canonical">
 * - JSON-LD (props.jsonLd: obiekt lub tablica obiektów)
 *
 * Użycie:
 * <SeoHead
 *   title="Tytuł"
 *   description="Opis"
 *   image="/og-image.jpg" // względny lub absolutny
 *   canonical={`https://twoja-domena.pl${location.pathname}`}
 *   type="product" // "website" (domyślnie), "article", "product"
 *   jsonLd={{ ... }}
 * />
 */

export default function SeoHead({
  title = "Gift Store — najlepsze prezenty na każdą okazję",
  description = "Znajdź idealny prezent: dla niej, dla niego i na każdą okazję. Szybka wysyłka, świetne ceny!",
  image,        // względny lub absolutny; jeśli brak → /og-image.jpg
  canonical,    // pełny URL; jeśli brak → window.location.href
  type = "website",
  jsonLd,
}) {
  // Vite env + fallbacki bezpieczne dla przeglądarki
  const SITE_URL =
    (typeof import.meta !== "undefined" &&
      import.meta.env &&
      import.meta.env.VITE_SITE_URL) ||
    (typeof window !== "undefined"
      ? window.location.origin.replace(/\/+$/, "")
      : "");

  // pomocnik: zrób absolutny URL (dla obrazka/kanonicznego)
  const toAbs = React.useCallback(
    (url, fallback = "") => {
      if (!url) return fallback;
      if (/^https?:\/\//i.test(url)) return url;
      const prefix = SITE_URL || "";
      const needsSlash =
        url && !url.startsWith("/") && prefix && !prefix.endsWith("/");
      return `${prefix}${needsSlash ? "/" : ""}${url}`;
    },
    [SITE_URL]
  );

  const ogImage = image ? toAbs(image, `${SITE_URL}/og-image.jpg`) : `${SITE_URL}/og-image.jpg`;
  const canonicalUrl =
    canonical ||
    (typeof window !== "undefined" ? window.location.href : undefined);

  React.useEffect(() => {
    if (title) document.title = title;

    const setMetaByName = (name, content) => {
      if (!content) return;
      let el = document.querySelector(`meta[name="${name}"]`);
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute("name", name);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };

    const setMetaByProp = (property, content) => {
      if (!content) return;
      let el = document.querySelector(`meta[property="${property}"]`);
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute("property", property);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };

    const setLink = (rel, href) => {
      if (!href) return;
      let el = document.querySelector(`link[rel="${rel}"]`);
      if (!el) {
        el = document.createElement("link");
        el.setAttribute("rel", rel);
        document.head.appendChild(el);
      }
      el.setAttribute("href", href);
    };

    // Meta opis
    setMetaByName("description", description);

    // Canonical (absolutny)
    if (canonicalUrl) setLink("canonical", toAbs(canonicalUrl, SITE_URL));

    // Open Graph
    const ogType =
      type === "product" ? "product" : type === "article" ? "article" : "website";
    setMetaByProp("og:type", ogType);
    setMetaByProp("og:title", title);
    setMetaByProp("og:description", description);
    setMetaByProp("og:image", ogImage);
    if (canonicalUrl) setMetaByProp("og:url", toAbs(canonicalUrl, SITE_URL));
    setMetaByProp("og:site_name", "Gift Store");

    // Twitter
    setMetaByName("twitter:card", "summary_large_image");
    setMetaByName("twitter:title", title);
    setMetaByName("twitter:description", description);
    setMetaByName("twitter:image", ogImage);

    // JSON-LD — usuń stare skrypty, żeby uniknąć duplikacji
    const oldScripts = Array.from(
      document.querySelectorAll('script[data-seohead="jsonld"]')
    );
    oldScripts.forEach((s) => s.remove());

    if (jsonLd) {
      const payloads = Array.isArray(jsonLd) ? jsonLd : [jsonLd];
      payloads.forEach((obj) => {
        if (obj && typeof obj === "object") {
          const s = document.createElement("script");
          s.type = "application/ld+json";
          s.setAttribute("data-seohead", "jsonld");
          s.text = JSON.stringify(obj);
          document.head.appendChild(s);
        }
      });
    }
  }, [SITE_URL, toAbs, title, description, ogImage, canonicalUrl, type, jsonLd]);

  return null;
}
