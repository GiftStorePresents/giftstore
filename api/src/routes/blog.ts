import { Router, type Request, type Response } from "express";
import { prisma } from "../lib/prisma";
import { BLOG_FAKE } from "../data/blog";

const router: Router = Router();

// Mocki tylko w DEV lub gdy jawnie wymusisz BLOG_USE_FAKE=1
const USE_FAKE =
  process.env.BLOG_USE_FAKE === "1" || process.env.NODE_ENV !== "production";

function normalizeListRow(a: any) {
  return {
    slug: String(a.slug),
    title: a.title ?? "Artykuł",
    excerpt: a.excerpt ?? "",
    description: a.excerpt ?? "",
    image: a.image ?? null,
    tags: Array.isArray(a.tags as any) ? (a.tags as string[]) : [],
    publishedAt: a.publishedAt ?? a.createdAt ?? a.updatedAt ?? null,
    updatedAt: a.updatedAt ?? a.publishedAt ?? a.createdAt ?? null,
  };
}

function normalizeOne(a: any) {
  return {
    slug: String(a.slug),
    title: a.title ?? "Artykuł",
    excerpt: a.excerpt ?? "",
    description: a.excerpt ?? "",
    content: a.content ?? "",
    image: a.image ?? null,
    tags: Array.isArray(a.tags as any) ? (a.tags as string[]) : [],
    publishedAt: a.publishedAt ?? a.createdAt ?? a.updatedAt ?? null,
    updatedAt: a.updatedAt ?? a.publishedAt ?? a.createdAt ?? null,
  };
}

/**
 * GET /api/blog?limit=20&offset=0
 * Zwraca: { items, total, limit, offset }
 */
router.get("/", async (req: Request, res: Response) => {
  const limit = Math.max(1, Math.min(100, parseInt(String(req.query.limit ?? "20"), 10) || 20));
  const offset = Math.max(0, parseInt(String(req.query.offset ?? "0"), 10) || 0);

  try {
    if (typeof (prisma as any)?.article?.findMany === "function") {
      const [rows, total] = await Promise.all([
        prisma.article.findMany({
          where: { published: true },
          orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
          skip: offset,
          take: limit,
          select: {
            slug: true,
            title: true,
            excerpt: true,
            image: true,
            tags: true,
            publishedAt: true,
            updatedAt: true,
            createdAt: true,
          },
        }),
        prisma.article.count({ where: { published: true } }),
      ]);

      if (total === 0) {
        if (USE_FAKE) {
          const fb = Array.isArray(BLOG_FAKE) ? BLOG_FAKE : [];
          const slice = fb.slice(offset, offset + limit);
          res.setHeader("X-Blog-Source", "fake");
          return res.json({ items: slice, total: fb.length, limit, offset });
        }
        // PROD + pusta DB → zwróć pustą listę (bez mocków)
        res.setHeader("X-Blog-Source", "empty");
        return res.json({ items: [], total: 0, limit, offset });
      }

      res.setHeader("X-Blog-Source", "db");
      return res.json({ items: rows.map(normalizeListRow), total, limit, offset });
    }
  } catch {
    // poleciało zapytanie do DB – lecimy niżej
  }

  if (USE_FAKE) {
    const fb = Array.isArray(BLOG_FAKE) ? BLOG_FAKE : [];
    const slice = fb.slice(offset, offset + limit);
    res.setHeader("X-Blog-Source", "fake");
    return res.json({ items: slice, total: fb.length, limit, offset });
  }

  // PROD i brak DB → nie podawaj mocków, ale nie psuj frontu
  res.setHeader("X-Blog-Source", "error-db");
  return res.json({ items: [], total: 0, limit, offset });
});

/**
 * GET /api/blog/:slug
 * Zwraca pełny artykuł (lub 404)
 */
router.get("/:slug", async (req: Request, res: Response) => {
  const slug = String(req.params.slug || "").trim();
  if (!slug) return res.status(400).json({ error: "Missing slug" });

  try {
    if (typeof (prisma as any)?.article?.findFirst === "function") {
      const a = await prisma.article.findFirst({
        where: { slug, published: true },
        select: {
          slug: true,
          title: true,
          excerpt: true,
          content: true,
          image: true,
          tags: true,
          publishedAt: true,
          updatedAt: true,
          createdAt: true,
        },
      });

      if (a) {
        res.setHeader("X-Blog-Source", "db");
        return res.json(normalizeOne(a));
      }
    }
  } catch {
    // poleci fallback poniżej
  }

  if (USE_FAKE) {
    const f = (Array.isArray(BLOG_FAKE) ? BLOG_FAKE : []).find((x: any) => String(x.slug) === slug);
    if (f) {
      res.setHeader("X-Blog-Source", "fake");
      return res.json(f);
    }
  }

  return res.status(404).json({ error: "Not found" });
});

export default router;
