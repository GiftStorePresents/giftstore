// api/src/routes/adminProductsMaintenance.ts
import { Router, type Request, type Response } from "express";
import path from "path";
import fs from "fs";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/roles";
import { logAdminAction } from "../lib/adminLog";

// ✅ POPRAWIONY IMPORT – bez @shared
import productsGiftsData, { type PopularGift } from "../seed/popularGiftsData";

const uploadDir = path.join(process.cwd(), "uploads");
const router: Router = Router();

/* ===========================================================
   Pomocnicze: normalizacja kategorii
   =========================================================== */
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
  return "inne";
}

/* ===========================================================
   Pobranie obrazka do /uploads
   =========================================================== */
async function downloadImageToUploads(srcUrl: string): Promise<string> {
  const src = String(srcUrl || "");
  if (!src) throw new Error("Brak adresu obrazka (srcUrl).");

  const r = await fetch(src);
  if (!r.ok) throw new Error(`Nie udało się pobrać obrazka: ${src} -> ${r.status} ${r.statusText}`);

  const ab = await r.arrayBuffer();
  const buf = Buffer.from(ab);

  const cleanNoQuery = (String(src).split("?")[0] ?? "");
  const clean = cleanNoQuery.split("#")[0] ?? "";
  const extMatch = clean.match(/\.(jpe?g|png|webp|gif|avif)$/i);
  const ext = extMatch ? extMatch[0] : ".jpg";

  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

  const filename = `seed_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`;
  const abs = path.join(uploadDir, filename);
  fs.writeFileSync(abs, buf);

  return `/uploads/${filename}`;
}

/* ===========================================================
   1) Import / aktualizacja (insert/upsert/overwrite)
   =========================================================== */
router.post(
  "/seed/popular",
  requireAuth,
  requireRole("ADMIN"),
  async (req: Request, res: Response) => {
    const mode = (req.body?.mode as "insert" | "upsert" | "overwrite") || "insert";
    const downloadImages = req.body?.downloadImages !== false;
    const overwriteImages = !!req.body?.overwriteImages;

    const created: string[] = [];
    const updated: string[] = [];
    const skipped: string[] = [];

    for (const raw of productsGiftsData as PopularGift[]) {
      const slug = String(raw.slug || "").trim();
      if (!slug) continue;

      const exists = await prisma.product.findUnique({
        where: { slug },
        include: { variants: true, media: true },
      });

      const categorySlug = normalizeCategory(raw.category, null);
      const categoryName = categorySlug.replace(/-/g, " ");
      const categoryConnect = {
        connectOrCreate: {
          where: { slug: categorySlug },
          create: { slug: categorySlug, name: categoryName },
        },
      };

      if (!exists) {
        // CREATE
        const product = await prisma.product.create({
          data: {
            name: String(raw.name ?? "").trim() || "Produkt",
            slug,
            description: String(raw.description ?? ""),
            brand: raw.brand ?? null,
            featured: !!raw.featured,
            category: categoryConnect,
            variants: {
              create: {
                sku:
                  raw.sku ||
                  slug.toUpperCase() ||
                  `SKU-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
                priceCents: Number(raw.priceCents || 0),
                stock: raw.stock ?? 100,
                color: raw.color ?? null,
                size: raw.size ?? null,
                personalize: !!raw.personalize,
              },
            },
          },
        });

        if (downloadImages && raw.imageUrl) {
          try {
            const rel = await downloadImageToUploads(raw.imageUrl);
            await prisma.media.create({
              data: { productId: product.id, url: rel, kind: "image", position: 0 },
            });
          } catch (e: any) {
            console.warn(`[seed image] ${slug}: ${e?.message}`);
          }
        }

        await logAdminAction({
          actorId: (req as any).userId,
          action: "PRODUCT_IMPORT_CREATE",
          entityType: "Product",
          entityId: product.id,
          after: { slug },
        });

        created.push(slug);
        continue;
      }

      // === Tryb INSERT ===
      if (exists && mode === "insert") {
        skipped.push(slug);
        continue;
      }

      // === Tryb UPSERT / OVERWRITE ===
      const updatedProduct = await prisma.product.update({
        where: { id: exists.id },
        data: {
          name: String(raw.name ?? exists.name),
          description: String(raw.description ?? exists.description ?? ""),
          brand: raw.brand ?? exists.brand ?? null,
          featured: !!raw.featured,
          category: categoryConnect,
        },
      });

      // Aktualizacja lub dodanie wariantu
      const firstVariant = exists.variants[0];
      if (firstVariant) {
        await prisma.variant.update({
          where: { id: firstVariant.id },
          data: {
            priceCents: Number(raw.priceCents ?? firstVariant.priceCents ?? 0),
            stock: raw.stock ?? firstVariant.stock ?? 100,
            color: raw.color ?? firstVariant.color ?? null,
            size: raw.size ?? firstVariant.size ?? null,
            personalize:
              typeof raw.personalize === "boolean"
                ? raw.personalize
                : firstVariant.personalize,
          },
        });
      } else {
        await prisma.variant.create({
          data: {
            productId: updatedProduct.id,
            sku:
              raw.sku ||
              slug.toUpperCase() ||
              `SKU-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
            priceCents: Number(raw.priceCents || 0),
            stock: raw.stock ?? 100,
            color: raw.color ?? null,
            size: raw.size ?? null,
            personalize: !!raw.personalize,
          },
        });
      }

      // Obsługa mediów
      if (downloadImages && raw.imageUrl) {
        try {
          if (mode === "overwrite" && overwriteImages && exists.media?.length) {
            for (const m of exists.media) {
              try {
                await prisma.media.delete({ where: { id: m.id } as any });
              } catch {}
              try {
                const filePath = path.join(uploadDir, path.basename(m.url));
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
              } catch {}
            }
          }

          const hasMedia = await prisma.media.count({
            where: { productId: updatedProduct.id },
          });
          if (mode === "overwrite" || hasMedia === 0) {
            const rel = await downloadImageToUploads(raw.imageUrl);
            await prisma.media.create({
              data: { productId: updatedProduct.id, url: rel, kind: "image", position: 0 },
            });
          }
        } catch (e: any) {
          console.warn(`[seed image update] ${slug}: ${e?.message}`);
        }
      }

      await logAdminAction({
        actorId: (req as any).userId,
        action: "PRODUCT_IMPORT_UPDATE",
        entityType: "Product",
        entityId: updatedProduct.id,
        after: { slug, mode },
      });

      updated.push(slug);
    }

    return res.json({
      ok: true,
      mode,
      createdCount: created.length,
      updatedCount: updated.length,
      skippedCount: skipped.length,
      created,
      updated,
      skipped,
    });
  }
);

/* ===========================================================
   2) DELETE pojedynczy produkt (soft/hard)
   =========================================================== */
router.delete(
  "/products/:id",
  requireAuth,
  requireRole("ADMIN"),
  async (req: Request, res: Response) => {
    const id = String(req.params.id || "");
    const force =
      String(req.query.force || req.query.hard || "") === "true" || req.query.hard === "1";

    const product = await prisma.product.findUnique({
      where: { id } as any,
      include: { media: true, variants: true },
    });
    if (!product) return res.status(404).json({ error: "Product not found" });

    if (!force) {
      await prisma.product.update({
        where: { id } as any,
        data: { deletedAt: new Date() },
      });
      await logAdminAction({
        actorId: (req as any).userId,
        action: "PRODUCT_SOFT_DELETE",
        entityType: "Product",
        entityId: id,
      });
      return res.json({ ok: true, softDeleted: true });
    }

    // Hard delete
    for (const m of product.media) {
      try {
        await prisma.media.delete({ where: { id: m.id } as any });
      } catch {}
      try {
        const filePath = path.join(uploadDir, path.basename(m.url));
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch {}
    }
    for (const v of product.variants) {
      try {
        await prisma.variant.delete({ where: { id: v.id } as any });
      } catch {}
    }
    await prisma.product.delete({ where: { id } as any });

    await logAdminAction({
      actorId: (req as any).userId,
      action: "PRODUCT_HARD_DELETE",
      entityType: "Product",
      entityId: id,
      meta: { force: true },
    });

    res.json({ ok: true, hardDeleted: true });
  }
);

/* ===========================================================
   3) UNDELETE produkt
   =========================================================== */
router.post(
  "/products/:id/undelete",
  requireAuth,
  requireRole("ADMIN"),
  async (req: Request, res: Response) => {
    const id = String(req.params.id || "");
    const product = await prisma.product.findUnique({ where: { id } as any });
    if (!product) return res.status(404).json({ error: "Product not found" });

    await prisma.product.update({ where: { id } as any, data: { deletedAt: null } });
    await logAdminAction({
      actorId: (req as any).userId,
      action: "PRODUCT_UNDELETE",
      entityType: "Product",
      entityId: id,
    });
    res.json({ ok: true });
  }
);

/* ===========================================================
   4) BULK delete / restore
   =========================================================== */
router.delete(
  "/products",
  requireAuth,
  requireRole("ADMIN"),
  async (req: Request, res: Response) => {
    const ids = Array.isArray(req.body?.ids) ? (req.body.ids as string[]) : [];
    const all = req.body?.all === true;
    const force = !!req.body?.force;

    const where = all ? {} : { id: { in: ids } };

    if (!force) {
      const updated = await prisma.product.updateMany({
        where,
        data: { deletedAt: new Date() },
      });
      return res.json({ ok: true, softDeleted: updated.count });
    }

    const products = await prisma.product.findMany({
      where,
      include: { media: true, variants: true },
    });
    for (const p of products) {
      for (const m of p.media) {
        try {
          await prisma.media.delete({ where: { id: m.id } as any });
        } catch {}
        try {
          const fp = path.join(uploadDir, path.basename(m.url));
          if (fs.existsSync(fp)) fs.unlinkSync(fp);
        } catch {}
      }
      for (const v of p.variants) {
        try {
          await prisma.variant.delete({ where: { id: v.id } as any });
        } catch {}
      }
      try {
        await prisma.product.delete({ where: { id: p.id } as any });
      } catch {}
    }

    res.json({ ok: true, hardDeleted: products.length });
  }
);

/* ===========================================================
   5) ALIAS: DELETE /api/admin/products/all?hard=1
   =========================================================== */
router.delete(
  "/products/all",
  requireAuth,
  requireRole("ADMIN"),
  async (req: Request, res: Response) => {
    const hard = String(req.query.hard || "") === "1";
    if (hard) {
      const products = await prisma.product.findMany({
        include: { media: true, variants: true },
      });
      for (const p of products) {
        for (const m of p.media) {
          try {
            await prisma.media.delete({ where: { id: m.id } as any });
          } catch {}
          try {
            const fp = path.join(uploadDir, path.basename(m.url));
            if (fs.existsSync(fp)) fs.unlinkSync(fp);
          } catch {}
        }
        for (const v of p.variants) {
          try {
            await prisma.variant.delete({ where: { id: v.id } as any });
          } catch {}
        }
        try {
          await prisma.product.delete({ where: { id: p.id } as any });
        } catch {}
      }
      return res.json({ ok: true, hardDeleted: products.length });
    }

    const updated = await prisma.product.updateMany({
      where: { deletedAt: null },
      data: { deletedAt: new Date() },
    });
    res.json({ ok: true, softDeleted: updated.count });
  }
);

export default router;
