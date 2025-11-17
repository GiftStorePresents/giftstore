// api/src/routes/admin.seed.ts
import { Router, type Request, type Response, type NextFunction } from "express";
import path from "node:path";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma";

// ✅ Poprawiony import – BEZ aliasu @shared
import popularGiftsData from "../seed/popularGiftsData";

// ⬇️ Seed inspiracji – ten import jest OK względem dist struktury
import { seedInspirations } from "../../../shared/inspirations.seed";

/* =========================================================
   Helpers
   ========================================================= */

function normalizeCategory(input?: string | null, tags?: string[] | null): string {
  const map = new Map<string, string>([
    ["dla niej", "dla-niej"],
    ["dla-niej", "dla-niej"],
    ["dla niego", "dla-niego"],
    ["dla-niego", "dla-niego"],
    ["dla dzieci", "dla-dzieci"],
    ["dla-dzieci", "dla-dzieci"],
    ["dla mamy", "dla-mamy"],
    ["dla-mamy", "dla-mamy"],
    ["dla taty", "dla-taty"],
    ["dla-taty", "dla-taty"],
    ["na urodziny", "na-urodziny"],
    ["na-urodziny", "na-urodziny"],
    ["urodziny", "na-urodziny"],
  ]);

  const pick = (v?: string | null) => map.get(String(v || "").toLowerCase().trim());
  const byField = pick(input);
  if (byField) return byField;

  for (const t of tags || []) {
    const m = pick(t);
    if (m) return m;
  }

  const s = String(input || "").trim().toLowerCase();
  if (s) {
    return (
      s
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "") || "inne"
    );
  }
  return "inne";
}

async function ensureCategory(slug: string) {
  const pretty = slug.replace(/-/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
  return prisma.category.upsert({
    where: { slug },
    update: { name: pretty },
    create: { slug, name: pretty },
    select: { id: true, slug: true },
  });
}

function coerceMode(input?: unknown): "insert" | "upsert" {
  const v = String(input ?? "").toLowerCase().trim();
  if (v === "upsert" || v === "overwrite") return "upsert";
  return "insert";
}

function coercePriceCents(raw: any): number {
  if (typeof raw?.priceCents === "number" && Number.isFinite(raw.priceCents)) {
    return Math.max(0, Math.round(raw.priceCents));
  }
  const zl =
    typeof raw?.price === "number"
      ? raw.price
      : Number(String(raw?.price || "").replace(",", "."));
  if (Number.isFinite(zl)) return Math.max(0, Math.round(zl * 100));
  return 0;
}

function firstImageUrl(raw: any): string | undefined {
  const direct = raw?.imageUrl || raw?.image || raw?.img;
  if (typeof direct === "string" && direct.trim()) return direct.trim();

  const media = raw?.media;
  if (Array.isArray(media) && media.length && typeof media[0]?.url === "string") {
    return media[0].url;
  }

  const images = raw?.images;
  if (Array.isArray(images) && images.length) {
    const v = images[0];
    if (typeof v === "string") return v;
    if (v && typeof v.url === "string") return v.url;
  }
  return undefined;
}

async function downloadImageToUploads(srcUrl: string, uploadsDir: string): Promise<string> {
  const src = String(srcUrl || "");
  if (!src) throw new Error("Brak adresu obrazka (srcUrl).");

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 12_000);

  try {
    const r = await fetch(src, {
      signal: ac.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; GiftStoreSeeder/1.0; +https://blinkshop.pl)",
      },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`);

    const ab = await r.arrayBuffer();
    const buf = Buffer.from(ab);

    const cleanNoQuery = String(src).split("?")[0] ?? "";
    const clean = (cleanNoQuery.split("#")[0] ?? "") as string;
    const extMatch = clean.match(/\.(jpe?g|png|webp|gif|avif)$/i);
    const ext = extMatch ? extMatch[0].toLowerCase() : ".jpg";

    const filename = `seed_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2)}${ext}`;
    const abs = path.join(uploadsDir, filename);

    await fs.mkdir(uploadsDir, { recursive: true });
    await fs.writeFile(abs, buf);

    return `/uploads/${filename}`;
  } finally {
    clearTimeout(t);
  }
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user;
  if (!user || user.role !== "ADMIN") {
    return res.status(403).json({ error: "forbidden" });
  }
  next();
}

/* =========================================================
   Restore-aware upsert — core (popular gifts)
   ========================================================= */

type SeedItem = {
  slug: string;
  name?: string;
  description?: string | null;
  brand?: string | null;
  category?: string | null;
  tags?: string[] | null;
  featured?: boolean;
  bestseller?: boolean;
  promo?: boolean;
  price?: number; // zł
  priceCents?: number; // grosze
  stock?: number;
  sku?: string;
  color?: string | null;
  size?: string | null;
  personalize?: boolean;
  imageUrl?: string;
  images?: Array<string | { url: string }>;
  media?: Array<{ url: string }>;
};

async function seedPopularRestoreAware(
  items: SeedItem[],
  opts: { downloadImages: boolean; uploadsRoot: string; mode: "insert" | "upsert" }
) {
  const { downloadImages, uploadsRoot, mode } = opts;

  let added = 0;
  let updated = 0;
  let restored = 0;
  let skipped = 0;

  const created: Array<{ id: string; slug: string }> = [];
  const skippedRows: Array<{ slug?: string; reason: string }> = [];

  for (const raw of items) {
    try {
      const slug = String(raw?.slug || "").trim();
      if (!slug) {
        skipped++;
        skippedRows.push({ reason: "no-slug" });
        continue;
      }

      const priceCents = coercePriceCents(raw);
      const imageUrl = firstImageUrl(raw);
      const featured =
        typeof raw?.featured === "boolean"
          ? !!raw.featured
          : !!(raw?.bestseller || raw?.promo);

      const categorySlug = normalizeCategory(raw?.category ?? null, raw?.tags ?? null);
      const category = await ensureCategory(categorySlug);

      const existing = await prisma.product.findUnique({
        where: { slug },
        include: { variants: { take: 1 }, media: true },
      });

      if (mode === "insert") {
        if (existing) {
          skipped++;
          skippedRows.push({ slug, reason: "exists-insert-skip" });
          continue;
        }

        const product = await prisma.product.create({
          data: {
            name: String(raw?.name ?? "").trim() || slug,
            slug,
            description:
              raw?.description != null ? String(raw.description) : null,
            brand:
              raw?.brand != null ? String(raw.brand) : "PopularGifts",
            categoryId: category?.id ?? null,
            featured,
            deletedAt: null,
            variants: {
              create: {
                sku:
                  raw?.sku ||
                  (slug
                    ? slug
                        .toUpperCase()
                        .replace(/[^A-Z0-9]+/g, "-")
                        .slice(0, 30)
                    : randomUUID()),
                priceCents: Number(priceCents || 0),
                stock: Number(raw?.stock ?? 100),
                color: raw?.color || null,
                size: raw?.size || null,
                personalize: !!raw?.personalize,
              },
            },
          },
          select: { id: true, slug: true },
        });

        if (downloadImages && imageUrl) {
          try {
            const relUrl = await downloadImageToUploads(imageUrl, uploadsRoot);
            await prisma.media.create({
              data: {
                productId: product.id,
                url: relUrl,
                kind: "image",
                position: 0,
              },
            });
          } catch {
            // cicho
          }
        }

        created.push({ id: product.id, slug: product.slug });
        added++;
        continue;
      }

      // UPSERT (restore-aware)
      if (!existing) {
        const product = await prisma.product.create({
          data: {
            name: String(raw?.name ?? "").trim() || slug,
            slug,
            description:
              raw?.description != null ? String(raw.description) : null,
            brand:
              raw?.brand != null ? String(raw.brand) : "PopularGifts",
            categoryId: category?.id ?? null,
            featured,
            deletedAt: null,
            variants: {
              create: {
                sku:
                  raw?.sku ||
                  (slug
                    ? slug
                        .toUpperCase()
                        .replace(/[^A-Z0-9]+/g, "-")
                        .slice(0, 30)
                    : randomUUID()),
                priceCents: Number(priceCents || 0),
                stock: Number(raw?.stock ?? 100),
                color: raw?.color || null,
                size: raw?.size || null,
                personalize: !!raw?.personalize,
              },
            },
          },
          select: { id: true, slug: true },
        });

        if (downloadImages && imageUrl) {
          try {
            const relUrl = await downloadImageToUploads(imageUrl, uploadsRoot);
            await prisma.media.create({
              data: {
                productId: product.id,
                url: relUrl,
                kind: "image",
                position: 0,
              },
            });
          } catch {
            // cicho
          }
        }

        created.push({ id: product.id, slug: product.slug });
        added++;
        continue;
      }

      const isSoftDeleted = !!(existing as any)?.deletedAt;

      const productUpdateData = {
        name: String(raw?.name ?? existing.name),
        description:
          raw?.description != null
            ? String(raw.description)
            : existing.description,
        brand:
          raw?.brand != null
            ? String(raw.brand)
            : existing.brand ?? "PopularGifts",
        categoryId: category?.id ?? existing.categoryId ?? null,
        featured,
        ...(isSoftDeleted ? { deletedAt: null as Date | null } : {}),
      };

      if (isSoftDeleted) {
        await prisma.product.update({
          where: { id: existing.id },
          data: productUpdateData,
        });
        restored++;
      } else {
        await prisma.product.update({
          where: { id: existing.id },
          data: productUpdateData,
        });
        updated++;
      }

      const v = existing.variants?.[0] || null;
      const nextSku =
        raw?.sku ||
        v?.sku ||
        (slug
          ? slug
              .toUpperCase()
              .replace(/[^A-Z0-9]+/g, "-")
              .slice(0, 30)
          : randomUUID());

      if (v) {
        await prisma.variant.update({
          where: { id: v.id },
          data: {
            sku: nextSku,
            priceCents: Number(priceCents || v.priceCents || 0),
            stock: Number(raw?.stock ?? v.stock ?? 100),
            color: raw?.color !== undefined ? raw.color : v.color,
            size: raw?.size !== undefined ? raw.size : v.size,
            personalize:
              raw?.personalize !== undefined
                ? !!raw.personalize
                : !!v.personalize,
          },
        });
      } else {
        await prisma.variant.create({
          data: {
            productId: existing.id,
            sku: nextSku,
            priceCents: Number(priceCents || 0),
            stock: Number(raw?.stock ?? 100),
            color: raw?.color || null,
            size: raw?.size || null,
            personalize: !!raw?.personalize,
          },
        });
      }

      if (downloadImages && imageUrl && (existing.media?.length ?? 0) === 0) {
        try {
          const relUrl = await downloadImageToUploads(imageUrl, uploadsRoot);
          await prisma.media.create({
            data: {
              productId: existing.id,
              url: relUrl,
              kind: "image",
              position: 0,
            },
          });
        } catch {
          // cicho
        }
      }
    } catch (rowErr: any) {
      skipped++;
      skippedRows.push({
        slug: String((raw as any)?.slug || ""),
        reason: "row-error: " + (rowErr?.message || String(rowErr)),
      });
    }
  }

  return { added, updated, restored, skipped, created, skippedRows };
}

/* =========================================================
   Handlers + Router
   ========================================================= */

async function handlerSeedPopular(req: Request, res: Response) {
  const mode = coerceMode(req.body?.mode || req.query?.mode);

  const downloadsEnv = String(process.env.SEED_DOWNLOAD_IMAGES || "").trim() === "1";
  const downloadImages =
    req.body?.downloadImages !== undefined
      ? !!req.body.downloadImages
      : downloadsEnv;

  const uploadsRoot = path.resolve(process.cwd(), "uploads");

  // ✅ używamy nazwy zgodnej z importem
  const items = Array.isArray(popularGiftsData)
    ? (popularGiftsData as SeedItem[])
    : [];
  if (!items.length) {
    const payload = {
      ok: true,
      mode,
      added: 0,
      updated: 0,
      restored: 0,
      skipped: 0,
      created: [] as Array<{ id: string; slug: string }>,
      skippedRows: [] as Array<{ slug?: string; reason: string }>,
      createdCount: 0,
      updatedCount: 0,
      restoredCount: 0,
      skippedCount: 0,
    };
    (req as any).log?.info(payload, "[seed:popular] no items — nothing to do");
    return res.status(200).json(payload);
  }

  const result = await seedPopularRestoreAware(items, {
    downloadImages,
    uploadsRoot,
    mode,
  });

  const logPayload = {
    mode,
    added: result.added,
    updated: result.updated,
    restored: result.restored,
    skipped: result.skipped,
    createdSize: result.created.length,
    skippedRowsSize: result.skippedRows.length,
    createdCount: result.added,
    updatedCount: result.updated,
    restoredCount: result.restored,
    skippedCount: result.skipped,
  };
  (req as any).log?.info(logPayload, "[seed:popular] done");

  return res.status(200).json({
    ok: true,
    mode,
    ...result,
    createdCount: result.added,
    updatedCount: result.updated,
    restoredCount: result.restored,
    skippedCount: result.skipped,
  });
}

// ⬇️ Seedowanie inspiracji
async function handlerSeedInspirations(_req: Request, res: Response) {
  await seedInspirations();
  return res.status(200).json({ ok: true, message: "Inspirations seeded" });
}

const router: Router = Router();

// Seed popularnych produktów
router.post("/seed/popular", requireAdmin, handlerSeedPopular);

// Seed inspiracji
router.post("/seed/inspirations", requireAdmin, handlerSeedInspirations);

export default router;
