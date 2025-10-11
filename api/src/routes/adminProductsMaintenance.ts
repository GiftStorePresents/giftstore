// src/routes/adminProductsMaintenance.ts
import { Router, type Request, type Response } from "express";
import path from "path";
import fs from "fs";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/roles";
import { logAdminAction } from "../lib/adminLog";

// seed źródłowy (to samo, co w admin.seed.ts)
import { popularGiftsData } from "../seed/popularGiftsData";

// katalog uploadów spójny z server.ts
const uploadDir = path.join(process.cwd(), "uploads");

const router: Router = Router();

/* ===========================
   Pomocnicze: normalizacja kategorii
   =========================== */
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

/* ===========================
   Pomocnicze: pobranie obrazka do /uploads
   =========================== */
async function downloadImageToUploads(srcUrl: string): Promise<string> {
  const src = String(srcUrl || "");
  if (!src) throw new Error("Brak adresu obrazka (srcUrl).");

  const r = await fetch(src);
  if (!r.ok) {
    throw new Error(`Nie udało się pobrać obrazka: ${src} -> ${r.status} ${r.statusText}`);
  }

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

/* ===========================
   1) Re-import / aktualizacja (upsert) popularnych produktów
   POST /api/admin/products/import-popular
   Body (opcjonalnie):
   {
     "mode": "insert" | "upsert" | "overwrite",   // domyślnie "upsert"
     "downloadImages": true,                      // domyślnie true
     "overwriteImages": false                     // jeśli true i jest stare media -> usuń i wstaw nowe
   }
   - insert: pomija produkty, które już istnieją
   - upsert: aktualizuje podstawowe pola istniejących produktów (bez kasowania)
   - overwrite: jak upsert + jeśli overwriteImages = true, usuwa stare media i wgrywa z seed
   =========================== */
router.post(
  "/products/import-popular",
  requireAuth,
  requireRole("ADMIN"),
  async (req: Request, res: Response) => {
    const mode = (req.body?.mode as "insert" | "upsert" | "overwrite") || "upsert";
    const downloadImages = req.body?.downloadImages !== false; // domyślnie true
    const overwriteImages = !!req.body?.overwriteImages;

    const results: Array<{ slug: string; action: "created" | "updated" | "skipped" }> = [];

    for (const raw of popularGiftsData) {
      const slug = String(raw.slug || "").trim();
      if (!slug) continue;

      const exists = await prisma.product.findUnique({
        where: { slug },
        include: { variants: true, media: true },
      });

      if (exists && mode === "insert") {
        results.push({ slug, action: "skipped" });
        continue;
      }

      const categorySlug = normalizeCategory(raw.category, null);

      if (!exists) {
        // CREATE
        const product = await prisma.product.create({
          data: {
            name: String(raw.name ?? "").trim() || "Produkt",
            slug,
            description: String(raw.description ?? ""),
            brand: raw.brand ?? null,
            category: categorySlug,
            featured: !!raw.featured,
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
            (req as any).log?.warn({ slug, err: e?.message }, "[import] image download failed");
          }
        }

        await logAdminAction({
          actorId: (req as any).userId,
          action: "PRODUCT_IMPORT_CREATE",
          entityType: "Product",
          entityId: product.id,
          after: { slug },
        });

        results.push({ slug, action: "created" });
      } else {
        // UPDATE / OVERWRITE
        const product = await prisma.product.update({
          where: { id: exists.id },
          data: {
            name: String(raw.name ?? "").trim() || exists.name,
            description: String(raw.description ?? exists.description ?? ""),
            brand: raw.brand ?? exists.brand ?? null,
            category: categorySlug || exists.category,
            featured: !!raw.featured,
          },
        });

        // wariant – zostaw pierwszy, ale zaktualizuj cenę/stock jeśli są
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
                typeof raw.personalize === "boolean" ? raw.personalize : firstVariant.personalize,
            },
          });
        } else {
          await prisma.variant.create({
            data: {
              productId: product.id,
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

        // media
        if (downloadImages && raw.imageUrl) {
          try {
            if (mode === "overwrite" && overwriteImages && exists.media?.length) {
              // usuń stare media + pliki
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

            // gdy nie ma mediów, albo tryb overwrite – dołóż nowe główne zdjęcie
            const stillHasMedia = await prisma.media.count({ where: { productId: product.id } });
            if (mode === "overwrite" || stillHasMedia === 0) {
              const rel = await downloadImageToUploads(raw.imageUrl);
              await prisma.media.create({
                data: { productId: product.id, url: rel, kind: "image", position: 0 },
              });
            }
          } catch (e: any) {
            (req as any).log?.warn({ slug, err: e?.message }, "[import] image processing failed");
          }
        }

        await logAdminAction({
          actorId: (req as any).userId,
          action: "PRODUCT_IMPORT_UPDATE",
          entityType: "Product",
          entityId: product.id,
          after: { slug, mode },
        });

        results.push({ slug, action: "updated" });
      }
    }

    res.json({ ok: true, results });
  }
);

/* ===========================
   2) Soft/hard delete pojedynczego produktu
   DELETE /api/admin/products/:id
   Query: ?force=true  => hard-delete (na zawsze)
   =========================== */
router.delete(
  "/products/:id",
  requireAuth,
  requireRole("ADMIN"),
  async (req: Request, res: Response) => {
    const id = String(req.params.id || "");
    const force = String(req.query.force || "") === "true";

    const product = await prisma.product.findUnique({
      where: { id } as any,
      include: { media: true, variants: true },
    });
    if (!product) return res.status(404).json({ error: "Product not found" });

    if (!force) {
      // soft delete
      const updated = await prisma.product.update({
        where: { id } as any,
        data: { deletedAt: new Date() },
      });

      await logAdminAction({
        actorId: (req as any).userId,
        action: "PRODUCT_SOFT_DELETE",
        entityType: "Product",
        entityId: id,
        before: product,
        after: updated,
      });

      return res.json({ ok: true, softDeleted: true });
    }

    // hard delete: usuń media + pliki + warianty + produkt
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
      before: product,
      meta: { force: true },
    });

    res.json({ ok: true, hardDeleted: true });
  }
);

/* ===========================
   3) Przywrócenie soft-deleted
   POST /api/admin/products/:id/undelete
   =========================== */
router.post(
  "/products/:id/undelete",
  requireAuth,
  requireRole("ADMIN"),
  async (req: Request, res: Response) => {
    const id = String(req.params.id || "");
    const product = await prisma.product.findUnique({ where: { id } as any });
    if (!product) return res.status(404).json({ error: "Product not found" });

    const updated = await prisma.product.update({
      where: { id } as any,
      data: { deletedAt: null },
    });

    await logAdminAction({
      actorId: (req as any).userId,
      action: "PRODUCT_UNDELETE",
      entityType: "Product",
      entityId: id,
      before: product,
      after: updated,
    });

    res.json({ ok: true });
  }
);

/* ===========================
   4) Kasowanie wielu / wszystkich
   DELETE /api/admin/products
   Body:
   - { ids: string[], force?: boolean }  => usuń wybrane
   - { all: true, force?: boolean }      => usuń wszystkie
   Uwaga: przy force=true usuwa pliki z /uploads
   =========================== */
router.delete(
  "/products",
  requireAuth,
  requireRole("ADMIN"),
  async (req: Request, res: Response) => {
    const ids = Array.isArray(req.body?.ids) ? (req.body.ids as string[]) : [];
    const all = req.body?.all === true;
    const force = !!req.body?.force;

    if (!all && ids.length === 0) {
      return res.status(400).json({ error: "Provide ids[] or all:true" });
    }

    const where = all ? {} : { id: { in: ids } };

    if (!force) {
      // soft delete (bulk)
      const updated = await prisma.product.updateMany({
        where,
        data: { deletedAt: new Date() },
      });

      await logAdminAction({
        actorId: (req as any).userId,
        action: "PRODUCT_BULK_SOFT_DELETE",
        entityType: "Product",
        entityId: "BULK",
        meta: { count: updated.count, all },
      });

      return res.json({ ok: true, softDeleted: updated.count });
    }

    // hard delete (bulk)
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

    await logAdminAction({
      actorId: (req as any).userId,
      action: "PRODUCT_BULK_HARD_DELETE",
      entityType: "Product",
      entityId: "BULK",
      meta: { count: products.length, all, force: true },
    });

    res.json({ ok: true, hardDeleted: products.length });
  }
);

/* ===========================
   5) Alias zgodny z frontem (fallback):
   DELETE /api/admin/products/all?hard=1
   - hard=1  -> HARD delete wszystkich
   - brak    -> soft-delete wszystkich
   =========================== */
router.delete(
  "/products/all",
  requireAuth,
  requireRole("ADMIN"),
  async (req: Request, res: Response) => {
    const hard = String(req.query.hard || "") === "1";

    if (hard) {
      const products = await prisma.product.findMany({ include: { media: true, variants: true } });
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
      await logAdminAction({
        actorId: (req as any).userId,
        action: "PRODUCT_BULK_HARD_DELETE",
        entityType: "Product",
        entityId: "BULK",
        meta: { count: products.length, all: true, force: true, alias: "/products/all?hard=1" },
      });
      return res.json({ ok: true, hardDeleted: products.length });
    }

    const updated = await prisma.product.updateMany({
      where: { deletedAt: null },
      data: { deletedAt: new Date() },
    });

    await logAdminAction({
      actorId: (req as any).userId,
      action: "PRODUCT_BULK_SOFT_DELETE",
      entityType: "Product",
      entityId: "BULK",
      meta: { count: updated.count, all: true, alias: "/products/all" },
    });

    return res.json({ ok: true, softDeleted: updated.count });
  }
);

export default router;
