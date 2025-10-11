// src/components/Breadcrumbs.jsx
import React from "react";
import { Link } from "react-router-dom";

/**
 * @typedef {Object} BreadcrumbItem
 * @property {string} name - nazwa do wyświetlenia
 * @property {string} url - ścieżka względna lub absolutna
 */

/**
 * @param {{ items: BreadcrumbItem[], className?: string, separator?: React.ReactNode }} props
 */
export default function Breadcrumbs({ items = [], className = "", separator = " / " }) {
  if (!Array.isArray(items) || items.length === 0) return null;

  const isAbsoluteUrl = (url = "") => /^https?:\/\//i.test(url);

  const toAbsolute = (url = "") => {
    if (!url) return "";
    if (isAbsoluteUrl(url)) return url;
    const origin = (typeof window !== "undefined" && window.location?.origin) || "";
    return origin.replace(/\/+$/, "") + (url.startsWith("/") ? url : `/${url}`);
  };

  // JSON-LD (SEO)
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: toAbsolute(it.url),
    })),
  };

  return (
    <>
      <nav className={`text-sm mb-4 ${className}`} aria-label="Breadcrumb">
        {items.map((it, i) => {
          const isLast = i === items.length - 1;
          const key = `${i}-${it.url || it.name || "crumb"}`;

          const content = isLast ? (
            <span className="text-gray-600" aria-current="page">
              {it.name}
            </span>
          ) : isAbsoluteUrl(it.url) ? (
            <a className="text-mainRed hover:underline" href={it.url}>
              {it.name}
            </a>
          ) : (
            <Link className="text-mainRed hover:underline" to={it.url || "/"}>
              {it.name}
            </Link>
          );

          return (
            <span key={key}>
              {i > 0 && <span className="mx-1">{separator}</span>}
              {content}
            </span>
          );
        })}
      </nav>

      {/* JSON-LD dla Google */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </>
  );
}
