// api/src/routes/adminBlog.ts
import { Router, type Request, type Response } from "express";
import { prisma } from "../lib/prisma";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "../middleware/requireAdmin";

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

/** Budowa obiektu "data" do create/update — tylko istniejące wartości */
function buildArticleData(input: any) {
  const out: Record<string, unknown> = {};

  if (input.title !== undefined) out.title = String(input.title);
  if (input.slug !== undefined) out.slug = String(input.slug || "");
  if (input.excerpt !== undefined) out.excerpt = input.excerpt ?? null;
  if (input.content !== undefined) out.content = String(input.content || "");
  if (input.image !== undefined) out.image = input.image ? String(input.image) : null;

  // jeśli w modelu masz Json lub String[]
  if (input.tags !== undefined) out.tags = coerceTags(input.tags);

  if (input.published !== undefined) out.published = !!input.published;
  if (input.publishedAt !== undefined)
    out.publishedAt = input.published ? (toDate(input.publishedAt) ?? new Date()) : null;

  // np. authorId jeśli używasz
  if (input.authorId !== undefined) out.authorId = input.authorId || null;

  return out;
}

/* -------------------- LIST --------------------
 * Tryb 1 (domyślny): brak page/limit => ZWRACA TABLICĘ (zgodnie z AdminBlogPage.jsx)
 * Tryb 2: podane page/limit => obiekt z paginacją { items, page, limit, total, pages }
 * --------------------------------------------- */
router.get("/blog", requireAdmin, async (req: Request, res: Response) => {
  try {
    const hasPage = typeof req.query.page !== "undefined" || typeof req.query.limit !== "undefined";
    const q = String(req.query.q ?? "").trim();

    const where: Prisma.ArticleWhereInput = q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" } as any },
            { slug: { contains: q, mode: "insensitive" } as any },
          ],
        }
      : {};

    if (!hasPage) {
      // ✅ Zwracamy TABLICĘ
      const items = await prisma.article.findMany({
        where,
        orderBy: [{ updatedAt: "desc" }],
      });
      return res.json(items);
    }

    // 🔄 Tryb paginowany – jeśli ktoś będzie chciał
    const page = Math.max(parseInt(String(req.query.page || "1"), 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || "20"), 10) || 20, 1), 100);
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      prisma.article.findMany({
        where,
        orderBy: [{ updatedAt: "desc" }],
        skip,
        take: limit,
      }),
      prisma.article.count({ where }),
    ]);

    res.json({
      items,
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (e: any) {
    res.status(500).json({ error: "internal", message: e?.message });
  }
});

/* -------------------- CREATE -------------------- */
router.post("/blog", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { title, slug, published } = req.body || {};
    if (!title) return res.status(400).json({ error: "title required" });

    // unikalny slug
    let s = slugify(slug || title);
    let i = 1;
    while (true) {
      const exists = await prisma.article.findFirst({ where: { slug: s }, select: { id: true } });
      if (!exists) break;
      i++;
      s = `${slugify(title)}-${i}`;
    }

    const data = buildArticleData({ ...req.body, slug: s });
    if (published) data.publishedAt = new Date();

    const created = await prisma.article.create({ data: data as any });
    res.status(201).json(created);
  } catch (e: any) {
    res.status(500).json({ error: "internal", message: e?.message });
  }
});

/* -------------------- READ -------------------- */
router.get("/blog/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id || "");
    if (!id) return res.status(400).json({ error: "missing id" });

    const row =
      (await prisma.article.findFirst({ where: { id } })) ||
      (await prisma.article.findFirst({ where: { slug: id } }));

    if (!row) return res.status(404).json({ error: "not found" });
    res.json(row);
  } catch (e: any) {
    res.status(500).json({ error: "internal", message: e?.message });
  }
});

/* -------------------- UPDATE -------------------- */
router.patch("/blog/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id || "");
    if (!id) return res.status(400).json({ error: "missing id" });

    const row = await prisma.article.findFirst({ where: { id } });
    if (!row) return res.status(404).json({ error: "not found" });

    const { title, slug, published } = req.body || {};
    const data = buildArticleData(req.body);

    // ewentualna zmiana slug
    if (slug !== undefined || (title !== undefined && !data.slug)) {
      const next = slugify(slug || (title ? String(title) : row.title));
      if (next) {
        const exists = await prisma.article.findFirst({
          where: { slug: next, NOT: { id } },
          select: { id: true },
        });
        if (exists) return res.status(409).json({ error: "slug already in use" });
        data.slug = next;
      }
    }

    // publikacja / cofnięcie publikacji
    if (published !== undefined) {
      data.published = !!published;
      if (published && !row.publishedAt) {
        data.publishedAt = new Date();
      }
      if (!published) {
        data.publishedAt = null;
      }
    }

    await prisma.article.update({ where: { id }, data: data as any });
    const after = await prisma.article.findFirst({ where: { id } });
    res.json(after);
  } catch (e: any) {
    res.status(500).json({ error: "internal", message: e?.message });
  }
});

/* -------------------- DELETE -------------------- */
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

type ImportItem = {
  slug: string;
  title?: string;
  excerpt?: string;
  description?: string;
  content?: string;
  image?: string | null;
  tags?: string[] | string;
  author?: string;
  publishedAt?: string;
  updatedAt?: string;
  published?: boolean;
};

type ImportBody = {
  items?: ImportItem[];
  publish?: boolean;   // domyślnie true
  overwrite?: boolean; // nadpisuj istniejące po slug
};

// Spróbuj dynamicznie wczytać fake dane, ale nie wymagaj pliku
async function loadFake(): Promise<ImportItem[]> {
  try {
    const mod: any = await import("../data/blog").catch(() => null);
    if (!mod) return [];
    return (mod.BLOG_FAKE || mod.default || []) as ImportItem[];
  } catch {
    return [];
  }
}

/** POST /api/admin/blog/import?source=fake
 *  - albo body.items[]: ImportItem[]
 *  - publish (bool) — domyślnie true
 *  - overwrite (bool) — gdy true, nadpisuje istniejące wpisy
 */
router.post(
  "/blog/import",
  requireAdmin,
  async (req: Request<{}, any, ImportBody>, res: Response) => {
    try {
      const source = String(req.query.source || "");
      const publish = req.body?.publish !== undefined ? !!req.body.publish : true;
      const overwrite = !!req.body?.overwrite;

      let items: ImportItem[] = [];

      if (source === "fake") {
        items = await loadFake();
        if (!items.length) {
          return res.status(400).json({
            error: "bad_request",
            message:
              "Brak danych do importu: ../data/blog (BLOG_FAKE) nie istnieje lub jest puste. Przekaż body.items[] albo utwórz plik z danymi.",
          });
        }
      } else if (Array.isArray(req.body?.items)) {
        items = req.body.items;
      } else {
        return res
          .status(400)
          .json({ error: "bad_request", message: "Podaj ?source=fake lub body.items[]" });
      }

      let created = 0;
      let updated = 0;

      for (const it of items) {
        const slug = slugify(it.slug || "");
        if (!slug) continue;

        const exists = await prisma.article.findFirst({
          where: { slug },
          select: { id: true },
        });

        const normalized = {
          title: it.title || "Artykuł",
          slug,
          excerpt: it.excerpt ?? it.description ?? "",
          content: it.content || "",
          image: it.image ? String(it.image) : null,
          tags: coerceTags(it.tags),
          published: publish,
          publishedAt: publish ? (toDate(it.publishedAt) ?? new Date()) : null,
        };

        if (exists) {
          if (!overwrite) continue;
          await prisma.article.update({
            where: { id: exists.id },
            data: normalized as any,
          });
          updated++;
        } else {
          await prisma.article.create({
            data: {
              ...(normalized as any),
              createdAt: toDate(it.publishedAt) ?? new Date(),
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
