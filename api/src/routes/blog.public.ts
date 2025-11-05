// api/src/routes/blog.public.ts
import express, {
  Router as ExpressRouter,
  type Request,
  type Response,
} from "express";
import { prisma } from "../lib/prisma";
import { Prisma } from "@prisma/client";

// TS2742 fix: jawna adnotacja typu
const router: ExpressRouter = express.Router();

/** Ścieżka do obrazka:
 * - pełny URL → zostaje,
 * - nazwa pliku → /uploads/NAZWA,
 * - null/"" → null
 */
function pickImagePath(a: any): string | null {
  const raw = a?.image || a?.cover || a?.imageUrl || null;
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  return raw.startsWith("/") ? raw : `/uploads/${raw}`;
}

/** Czy content wygląda na HTML (żeby zasilić contentHtml po stronie frontu) */
function looksLikeHtml(s?: unknown): s is string {
  return typeof s === "string" && /<\/?[a-z][\s\S]*>/i.test(s);
}

/** Normalizacja rekordu z DB do formatu publicznego */
function toPublicArticle(a: any) {
  const rawContent = a?.content ?? null;
  const contentHtml = looksLikeHtml(rawContent) ? rawContent : null;
  const content = looksLikeHtml(rawContent) ? null : rawContent;

  return {
    slug: a?.slug || String(a?.id || ""),
    title: a?.title || a?.name || "Artykuł",
    excerpt: a?.excerpt || a?.lead || "",
    description: a?.description || a?.excerpt || "",
    image: pickImagePath(a),
    imageUrl: pickImagePath(a),
    publishedAt: a?.publishedAt || a?.createdAt || a?.updatedAt || null,
    updatedAt: a?.updatedAt || a?.modifiedAt || a?.publishedAt || null,
    // zakładamy, że Article.tags jest String[] (patrz adminBlog.ts i coerceTags)
    tags: Array.isArray(a?.tags) ? a.tags : [],
    contentHtml, // jeśli w DB jest HTML — front użyje bez konwersji
    content,     // jeśli tekst/markdown — front sobie zrenderuje
    author: a?.author?.name || a?.author || a?.user?.name || "Gift Store",
  };
}

/**
 * GET /api/blog
 * Query:
 *  - limit=1..100 (domyślnie 20)
 *  - page>=1 (domyślnie 1)
 *  - q=string (opcjonalny fulltext po title/slug, insensitive)
 * Zwraca: TABLICĘ artykułów (tylko opublikowane).
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const limit = Math.min(
      Math.max(parseInt(String(req.query.limit ?? "20"), 10) || 20, 1),
      100
    );
    const page = Math.max(parseInt(String(req.query.page ?? "1"), 10) || 1, 1);
    const q = String(req.query.q ?? "").trim();

    const where: Prisma.ArticleWhereInput = {
      published: true,
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: Prisma.QueryMode.insensitive } },
              { slug: { contains: q, mode: Prisma.QueryMode.insensitive } },
            ],
          }
        : {}),
    };

    const rows = await prisma.article.findMany({
      where,
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
      // UWAGA: tylko istniejące w modelu Article pola!
      select: {
        id: true,
        slug: true,
        title: true,
        excerpt: true,
        image: true,
        content: true,        // tekst/markdown/HTML
        tags: true,           // String[] — musi istnieć w modelu
        published: true,
        publishedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const items = rows
      .filter((r) => r.published)
      .map(toPublicArticle)
      .filter((a) => a.slug);

    // Front obsługuje tablicę i {items}; zwracamy tablicę (prościej).
    return res.json(items);
  } catch (e) {
    return res.status(500).json({ error: "internal_error" });
  }
});

/**
 * GET /api/blog/:slug
 * Zwraca: POJEDYNCZY obiekt artykułu (nie w {article}, front obsłuży oba warianty).
 */
router.get("/:slug", async (req: Request, res: Response) => {
  try {
    const slug = String(req.params.slug || "").trim();
    if (!slug) return res.status(400).json({ error: "missing-slug" });

    const baseSelect = {
      id: true,
      slug: true,
      title: true,
      excerpt: true,
      image: true,
      content: true,
      tags: true,
      published: true,
      publishedAt: true,
      createdAt: true,
      updatedAt: true,
    } as const;

    const bySlug = await prisma.article.findUnique({
      where: { slug },
      select: baseSelect,
    });

    const row =
      bySlug ||
      (await prisma.article.findUnique({
        where: { id: slug as any },
        select: baseSelect,
      }));

    if (!row || !row.published) {
      return res.status(404).json({ error: "not_found" });
    }

    const obj = toPublicArticle(row);
    return res.json(obj);
  } catch (e) {
    return res.status(500).json({ error: "internal_error" });
  }
});

export default router;
