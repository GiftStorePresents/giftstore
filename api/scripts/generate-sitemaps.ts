// scripts/generate-sitemaps.ts
import fs from "node:fs";
import path from "node:path";
import {
  buildSitemapIndex,
  buildUrlset,
  chunk,
  type SimpleEntry,
} from "../src/utils/sitemap";
import { getProductRows, getCategoryRows, getArticleRows } from "../src/services/sitemapData";
// @ts-ignore – dopasuj do swojej ścieżki eksportu prisma
import { prisma } from "../src/lib/prisma";

const SITE_URL = (process.env.SITE_URL || "https://example.com").replace(/\/+$/, "");
const API_URL = (process.env.API_URL || "").replace(/\/+$/, "");

// prosta funkcja do pingu wyszukiwarek (Node 18+ ma global fetch)
async function pingSearchEngines(indexUrl: string) {
  const targets = [
    `https://www.google.com/ping?sitemap=${encodeURIComponent(indexUrl)}`,
    `https://www.bing.com/ping?sitemap=${encodeURIComponent(indexUrl)}`,
  ];
  for (const t of targets) {
    try {
      const r = await fetch(t);
      console.log(`[ping] ${t} -> ${r.status}`);
    } catch (e) {
      console.warn(`[ping] failed: ${t}`, (e as any)?.message || e);
    }
  }
}

async function main() {
  const outDir = path.join(process.cwd(), "public");
  fs.mkdirSync(outDir, { recursive: true });

  /** -------- PRODUCTS -------- */
  const prodRows = await getProductRows(prisma, API_URL);
  const prodUrls: SimpleEntry[] = prodRows.map((r) => ({
    loc: `${SITE_URL}/product/${r.slug}`,
    ...(r.updatedAt ? { lastmod: new Date(r.updatedAt as any).toISOString() } : {}),
    changefreq: "daily",
    priority: 0.9,
  }));

  let sitemaps: { loc: string; lastmod?: string }[] = [
    { loc: `${SITE_URL}/sitemap-products.xml` },
    { loc: `${SITE_URL}/sitemap-categories.xml` },
    { loc: `${SITE_URL}/sitemap-blog.xml` },
  ];

  if (prodUrls.length > 49000) {
    const parts = chunk(prodUrls);
    // zapisujemy części: sitemap-products-0.xml, sitemap-products-1.xml, ...
    parts.forEach((part, i) => {
      fs.writeFileSync(path.join(outDir, `sitemap-products-${i}.xml`), buildUrlset(part));
    });
    // zamień link w indeksie z głównego na listę części
    sitemaps = [
      ...parts.map((_, i) => ({ loc: `${SITE_URL}/sitemap-products-${i}.xml` })),
      { loc: `${SITE_URL}/sitemap-categories.xml` },
      { loc: `${SITE_URL}/sitemap-blog.xml` },
    ];
  } else {
    fs.writeFileSync(path.join(outDir, "sitemap-products.xml"), buildUrlset(prodUrls));
  }

  /** -------- CATEGORIES -------- */
  const catRows = await getCategoryRows(prisma, API_URL);
  const catUrls: SimpleEntry[] = catRows.map((r) => ({
    loc: `${SITE_URL}/categories/${r.slug}`,
    ...(r.updatedAt ? { lastmod: new Date(r.updatedAt as any).toISOString() } : {}),
    changefreq: "weekly",
    priority: 0.6,
  }));
  fs.writeFileSync(path.join(outDir, "sitemap-categories.xml"), buildUrlset(catUrls));

  /** -------- BLOG -------- */
  const artRows = await getArticleRows(prisma, API_URL);
  const artUrls: SimpleEntry[] = artRows.map((r) => ({
    loc: `${SITE_URL}/blog/${r.slug}`,
    ...(r.updatedAt ? { lastmod: new Date(r.updatedAt as any).toISOString() } : {}),
    changefreq: "weekly",
    priority: 0.7,
  }));
  fs.writeFileSync(path.join(outDir, "sitemap-blog.xml"), buildUrlset(artUrls));

  /** -------- INDEX -------- */
  fs.writeFileSync(path.join(outDir, "sitemap.xml"), buildSitemapIndex(sitemaps));

  /** -------- ROBOTS -------- */
  fs.writeFileSync(
    path.join(outDir, "robots.txt"),
    `User-agent: *
Allow: /

Sitemap: ${SITE_URL}/sitemap.xml
`
  );

  // Ping po generacji (wyłącz przez PING_SEARCH_ENGINES=0)
  const indexUrl = `${SITE_URL}/sitemap.xml`;
  if (process.env.PING_SEARCH_ENGINES !== "0") {
    await pingSearchEngines(indexUrl);
  }

  console.log("[sitemap] generated");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
