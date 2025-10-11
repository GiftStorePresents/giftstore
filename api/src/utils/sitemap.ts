// src/utils/sitemap.ts
import type { Request, Response } from "express";
import crypto from "node:crypto";

export type SimpleEntry = {
  loc: string; // pełny URL
  lastmod?: string; // ISO
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: number; // 0.0 .. 1.0
};

export function escapeXml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function urlTag(u: SimpleEntry) {
  const parts = [
    `<loc>${escapeXml(u.loc)}</loc>`,
    u.lastmod ? `<lastmod>${escapeXml(u.lastmod)}</lastmod>` : "",
    u.changefreq ? `<changefreq>${u.changefreq}</changefreq>` : "",
    typeof u.priority === "number" ? `<priority>${u.priority.toFixed(1)}</priority>` : "",
  ].filter(Boolean);
  return `<url>${parts.join("")}</url>`;
}

export function buildUrlset(urls: SimpleEntry[]) {
  const body = urls.map(urlTag).join("");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` +
    body +
    `</urlset>`
  );
}

export function buildSitemapIndex(sitemaps: { loc: string; lastmod?: string }[]) {
  const body = sitemaps
    .map(
      (s) =>
        `<sitemap><loc>${escapeXml(s.loc)}</loc>${
          s.lastmod ? `<lastmod>${escapeXml(s.lastmod)}</lastmod>` : ""
        }</sitemap>`
    )
    .join("");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` +
    body +
    `</sitemapindex>`
  );
}

export function sendXml(res: Response, xml: string) {
  res.set("Content-Type", "application/xml; charset=utf-8");
  res.send(xml);
}

/**
 * Wysyła XML z nagłówkami ETag + Cache-Control i obsługą 304 Not Modified.
 * Używaj w sitemapach i robots.txt, żeby zmniejszyć obciążenie i transfer.
 */
export function sendXmlCached(req: Request, res: Response, xml: string, maxAgeSec = 3600) {
  const etag = '"' + crypto.createHash("sha1").update(xml).digest("base64") + '"';

  res.setHeader("ETag", etag);
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", `public, max-age=${maxAgeSec}, s-maxage=${maxAgeSec}`);

  const inm = req.headers["if-none-match"];
  if (typeof inm === "string" && inm === etag) {
    res.status(304).end();
    return;
  }

  res.send(xml);
}

/**
 * Dzieli tablicę na części (dla sitemap > 49k URL).
 */
export function chunk<T>(arr: T[], size = 49000): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
