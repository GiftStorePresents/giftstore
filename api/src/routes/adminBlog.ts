// src/routes/adminBlog.ts
import { Router, type Request, type Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAdmin } from "../middleware/requireAdmin";
import { BLOG_FAKE, type BlogItem } from "../data/blog";

const router: Router = Router();

/* -------------------- helpers -------------------- */

function slugify(input: string) {
  return String(input || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function coerceTags(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((t) => String(t).trim()).filter(Boolean);
  if (typeof raw === "string") {
    return raw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }
  return [];
}

function toDate(iso?: string | null) {
  if (!iso) return undefined;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** Nie zwracaj `undefined` dla pól opcjonalnych – po prostu je pomijaj. */
function normalizeIncoming(input: any) {
  return {
    title: String(input?.title || ""),
    excerpt: input?.excerpt ?? input?.description ?? "",
    content: String(input?.content || ""),
    image: input?.image ? String(input.image) : null,
    tags: coerceTags(input?.tags),
    published: !!input?.published,
  };
}

/* -------------------- CRUD -------------------- */

/** LIST /api/admin/blog */
router.get("/blog", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const rows = await prisma.article.findMany({
      orderBy: { updatedAt: "desc" },
    });
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: "internal", message: e?.message });
  }
});

/** CREATE /api/admin/blog */
router.post("/blog", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { title, slug, excerpt, content, image, tags, published } = req.body || {};
    if (!title || !content) return res.status(400).json({ error: "title and content required" });

    // unikalny slug
    let s = slug ? slugify(slug) : slugify(title);
    let i = 1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const exists = await prisma.article.findFirst({ where: { slug: s } });
      if (!exists) break;
      i += 1;
      s = `${slugify(title)}-${i}`;
    }

    const now = new Date();
    const row = await prisma.article.create({
      data: {
        title,
        slug: s,
        excerpt: excerpt || null,
        content,
        image: image || null,
        tags: coerceTags(tags),
        published: !!published,
        publishedAt: published ? now : null,
        authorId: (req as any).user?.id || null,
      },
    });
    res.status(201).json(row);
  } catch (e: any) {
    res.status(500).json({ error: "internal", message: e?.message });
  }
});

/** READ /api/admin/blog/:id */
router.get("/blog/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id || "");
    if (!id) return res.status(400).json({ error: "missing id" });

    const row = await prisma.article.findFirst({ where: { id } });
    if (!row) return res.status(404).json({ error: "not found" });
    res.json(row);
  } catch (e: any) {
    res.status(500).json({ error: "internal", message: e?.message });
  }
});

/** UPDATE /api/admin/blog/:id */
router.patch("/blog/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id || "");
    if (!id) return res.status(400).json({ error: "missing id" });

    const { title, slug, excerpt, content, image, tags, published } = req.body || {};
    const data: any = {};

    if (title !== undefined) data.title = title;
    if (excerpt !== undefined) data.excerpt = excerpt;
    if (content !== undefined) data.content = content;
    if (image !== undefined) data.image = image;
    if (tags !== undefined) data.tags = coerceTags(tags);

    if (slug !== undefined) {
      const nextSlug = slugify(slug || (title ? String(title) : ""));
      if (nextSlug) {
        const exists = await prisma.article.findFirst({ where: { slug: nextSlug, NOT: { id } } });
        if (exists) return res.status(409).json({ error: "slug already in use" });
        data.slug = nextSlug;
      }
    }

    if (published !== undefined) {
      data.published = !!published;
      if (published) data.publishedAt = new Date();
    }

    const upd = await prisma.article.updateMany({ where: { id }, data });
    if (upd.count === 0) return res.status(404).json({ error: "not found" });

    const row = await prisma.article.findFirst({ where: { id } });
    res.json(row);
  } catch (e: any) {
    res.status(500).json({ error: "internal", message: e?.message });
  }
});

/** DELETE /api/admin/blog/:id */
router.delete("/blog/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id || "");
    if (!id) return res.status(400).json({ error: "missing id" });

    const del = await prisma.article.deleteMany({ where: { id } });
    if (del.count === 0) return res.status(404).json({ error: "not found" });

    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: "internal", message: e?.message });
  }
});

/* -------------------- IMPORT -------------------- */

type ImportBody = {
  items?: Array<
    Partial<BlogItem> & {
      slug: string;
    }
  >;
  publish?: boolean;
  overwrite?: boolean;
};

/**
 * POST /api/admin/blog/import
 *  - ?source=fake → import z BLOG_FAKE
 *  - lub body.items[] → import z payloadu
 *  - publish (bool, domyślnie true)
 *  - overwrite (bool, gdy true nadpisuje istniejące wpisy)
 */
router.post(
  "/blog/import",
  requireAdmin,
  async (req: Request<{}, any, ImportBody>, res: Response) => {
    try {
      const source = String(req.query.source || "");
      const publish = req.body?.publish !== undefined ? !!req.body.publish : true;
      const overwrite = !!req.body?.overwrite;

      let items: BlogItem[] = [];

      if (source === "fake") {
        items = Array.isArray(BLOG_FAKE) ? BLOG_FAKE : [];
      } else if (Array.isArray(req.body?.items)) {
        // Zbuduj *BlogItem* bez wstawiania undefined w pola opcjonalne
        items = req.body.items
          .map((it) => {
            const slug = String(it?.slug || "").trim();
            if (!slug) return null;

            const base: any = {
              slug,
              title: String(it?.title || "Artykuł"),
              excerpt: it?.excerpt ?? it?.description ?? "",
              content: String(it?.content || ""),
              image: it?.image ? String(it.image) : null,
              tags: coerceTags(it?.tags),
              publishedAt: (it?.publishedAt as string) || new Date().toISOString(),
            };

            // dodawaj TYLKO, jeśli istnieją:
            if (it?.description != null) base.description = String(it.description);
            if (it?.author != null) base.author = String(it.author);
            if (it?.updatedAt != null) base.updatedAt = String(it.updatedAt);

            return base as BlogItem;
          })
          .filter((x): x is BlogItem => !!x);
      } else {
        return res
          .status(400)
          .json({ error: "bad_request", message: "Provide ?source=fake or body.items[]" });
      }

      let created = 0;
      let updated = 0;

      for (const a of items) {
        const slug = slugify(a.slug);
        if (!slug) continue;

        const exists = await prisma.article.findFirst({ where: { slug }, select: { id: true } });
        const publishedAt = toDate(a.publishedAt) ?? new Date();

        const data = {
          ...normalizeIncoming(a),
          slug,
          published: publish,
          publishedAt: publish ? publishedAt : null,
        };

        if (exists) {
          if (!overwrite) continue;
          await prisma.article.update({
            where: { id: exists.id },
            data,
          });
          updated++;
        } else {
          await prisma.article.create({
            data: {
              ...data,
              createdAt: publishedAt,
            },
          });
          created++;
        }
      }

      return res.json({
        ok: true,
        total: items.length,
        created,
        updated,
        publish,
        overwrite,
      });
    } catch (e: any) {
      res.status(500).json({ error: "internal", message: e?.message });
    }
  }
);

export default router;
