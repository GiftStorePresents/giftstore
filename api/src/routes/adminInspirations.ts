// api/src/routes/adminInspirations.ts
// Jeden router: PUBLIC (inspiracje) i ADMIN (CRUD + przypinanie + domyślne ikony)

import {
  Router,
  type Request,
  type Response,
  type Router as RouterType,
} from "express";
import path from "node:path";
import fs from "node:fs/promises";
import multer from "multer";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/roles";
import { logAdminAction } from "../lib/adminLog";

export const adminInspirationsRoutes: RouterType = Router();

/* ================================================================================================
   USTAWIENIA: DOMYŚLNE IKONY (SiteSetting: key = "inspiration_defaults")
================================================================================================ */
const DEFAULTS_KEY = "inspiration_defaults";
const ALLOWED_ICON_KEYS = new Set(["heart", "cake", "child", "coffee", "gift", "star"]);

// ADMIN: odczyt domyślnych ikon
adminInspirationsRoutes.get(
  "/admin/inspirations/defaults",
  requireAuth,
  requireRole("ADMIN"),
  async (_req: Request, res: Response) => {
    try {
      const row = await prisma.siteSetting.findUnique({ where: { key: DEFAULTS_KEY } });
      res.json(row?.value ?? {}); // { "na-urodziny": "cake", ... }
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Internal error" });
    }
  }
);

// ADMIN: zapis domyślnych ikon
adminInspirationsRoutes.put(
  "/admin/inspirations/defaults",
  requireAuth,
  requireRole("ADMIN"),
  async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const cleaned: Record<string, string> = {};
      for (const [slug, key] of Object.entries(body)) {
        const k = String(key ?? "").toLowerCase().trim();
        if (k && ALLOWED_ICON_KEYS.has(k)) {
          cleaned[String(slug).toLowerCase()] = k;
        }
      }
      const row = await prisma.siteSetting.upsert({
        where: { key: DEFAULTS_KEY },
        create: { key: DEFAULTS_KEY, value: cleaned },
        update: { value: cleaned },
      });
      res.json(row.value ?? {});
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Internal error" });
    }
  }
);

// PUBLIC: odczyt domyślnych ikon (dla frontu)
adminInspirationsRoutes.get(
  "/public/inspirations/defaults",
  async (_req: Request, res: Response) => {
    try {
      const row = await prisma.siteSetting.findUnique({ where: { key: DEFAULTS_KEY } });
      res.json(row?.value ?? {});
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Internal error" });
    }
  }
);

/* ================================================================================================
   UPLOAD
================================================================================================ */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});

const toInt = (v: unknown, def = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};

/* ================================================================================================
   HELPERS: cena/stock/obrazek + mapper do „karty”
================================================================================================ */
function num(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function pickMainImage(p: any): string | null {
  const media = Array.isArray(p?.media) ? p.media : [];
  const first = [...media]
    .sort((a, b) => (a?.position ?? 0) - (b?.position ?? 0))
    .find((m) => !!m?.url)?.url;
  return first || p?.imageUrl || (p as any)?.image || null;
}

type VariantLike = {
  priceCents?: number | null;
  stock?: number | null;
  discountActive?: boolean | null;
  salePriceCents?: number | null;
};

/** [minEffectivePriceCents, minOldPriceCents|null] z wariantów (uwzględnia rabat) */
function minVariantPrices(p: any): [number | null, number | null] {
  const vs: VariantLike[] = Array.isArray(p?.variants) ? p.variants : [];
  let minEff: number | null = null;
  let minOld: number | null = null;

  for (const v of vs) {
    const base = num(v?.priceCents);
    const sale = v?.discountActive ? num(v?.salePriceCents) : null;
    const eff = sale != null ? sale : base;
    if (eff == null) continue;

    if (minEff == null || eff < minEff) {
      minEff = eff;
      minOld = sale != null && base != null ? base : null;
    } else if (eff === minEff) {
      const candidateOld = sale != null && base != null ? base : null;
      if (candidateOld != null && (minOld == null || candidateOld < minOld)) {
        minOld = candidateOld;
      }
    }
  }
  return [minEff, minOld];
}

/** minimalna cena z produktu (różne nazwy) + wariantów (z rabatem) */
function minProductPriceCents(p: any): [number | null, number | null] {
  const [minVarEff, minVarOld] = minVariantPrices(p);

  const candidates: number[] = [];
  const pc = num(p?.priceCents);
  const pz = num((p as any)?.price);          // zł (decimal)
  const ac = num((p as any)?.amountCents);
  const az = num((p as any)?.amount);         // zł (decimal)

  if (pc != null) candidates.push(pc);
  if (ac != null) candidates.push(ac);
  if (pz != null) candidates.push(Math.round(pz * 100));
  if (az != null) candidates.push(Math.round(az * 100));
  if (minVarEff != null) candidates.push(minVarEff);

  if (!candidates.length) return [null, null];
  const minEff = candidates.reduce((a, b) => (a < b ? a : b));

  // stara cena z produktu (różne nazwy)
  const oc = num((p as any)?.oldPriceCents);
  const caz = num((p as any)?.compareAtPrice); // zł
  const op = num((p as any)?.oldPrice);        // zł
  const prodOld =
    oc != null ? oc : caz != null ? Math.round(caz * 100) : op != null ? Math.round(op * 100) : null;

  // jeśli min pochodzi z przecenionego wariantu – użyj old z wariantu; w przeciwnym razie prodOld
  const effectiveOld = minVarOld != null ? minVarOld : prodOld;

  return [minEff, effectiveOld];
}

function totalStock(p: any): number {
  let s = num((p as any)?.stock) ?? 0;
  if (Array.isArray(p?.variants)) {
    for (const v of p.variants) s += num((v as any)?.stock) ?? 0;
  }
  return s;
}

/** Mapper do karty produktu */
function toCard(p: any) {
  const [priceC, oldC] = minProductPriceCents(p);
  const price = priceC != null ? Math.round(priceC) / 100 : undefined;
  const oldPrice = oldC != null ? Math.round(oldC) / 100 : undefined;

  const rating =
    num((p as any)?.rating) ??
    num((p as any)?.ratingAvg) ?? 0;

  const reviews =
    num((p as any)?.reviewCount) ??
    num((p as any)?.reviewsCount) ?? 0;

  const stock = totalStock(p);
  const outOfStock = stock <= 0;

  const tags: string[] = Array.isArray((p as any)?.tags)
    ? (p as any).tags.map((t: any) => String(t).toLowerCase())
    : [];

  const isNew = !!(p?.isNew || tags.includes("nowość") || tags.includes("nowosc"));
  const featured = !!p?.featured;
  const bestseller =
    !!((p as any)?.bestseller || tags.includes("bestseller") || (p as any)?.salesCount > 100);

  const onSale = price != null && oldPrice != null && oldPrice > price;
  const promo = !!((p as any)?.promo) || onSale;

  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: (p as any)?.description || "",
    image: pickMainImage(p),

    price,
    oldPrice,

    rating,
    ratingMax: 5,
    reviewCount: reviews,
    reviewsCount: reviews,

    stock,
    outOfStock,
    inStock: !outOfStock,

    promo,
    bestseller,
    isNew,
    featured,
    onSale,

    media: Array.isArray(p.media) ? p.media : undefined,
  };
}

/* ================================================================================================
   PUBLIC: lista inspiracji
   GET /api/public/inspirations?limit=
================================================================================================ */
adminInspirationsRoutes.get("/public/inspirations", async (req, res) => {
  try {
    const take = Math.min(50, Math.max(1, Number(req.query.limit ?? 8)));
    const items = await prisma.inspiration.findMany({
      where: { active: true },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      take,
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        imageUrl: true,
        position: true,
        active: true,
      },
    });
    res.json({ items });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Internal error" });
  }
});

/* ================================================================================================
   PUBLIC: produkty przypięte do inspiracji
   GET /api/public/inspirations/:slug/products?skip=&take=&q=
================================================================================================ */
adminInspirationsRoutes.get(
  "/public/inspirations/:slug/products",
  async (req: Request, res: Response) => {
    try {
      const slug = String(req.params.slug || "").trim().toLowerCase();
      if (!slug) return res.status(400).json({ error: "slug required" });

      const skip = Math.max(0, Number(req.query.skip ?? 0) || 0);
      const take = Math.min(200, Math.max(1, Number(req.query.take ?? 24) || 24));
      const q = String(req.query.q ?? "").trim();

      const insp = await prisma.inspiration.findUnique({
        where: { slug },
        select: { id: true, active: true },
      });
      if (!insp || insp.active === false) {
        return res.json({ items: [], total: 0, skip, take });
      }

      const where: Prisma.ProductWhereInput = {
        deletedAt: { equals: null },
        inspirations: { some: { id: insp.id } }, // id = string
      };
      if (q) {
        where.OR = [
          { name: { contains: q, mode: Prisma.QueryMode.insensitive } },
          { slug: { contains: q, mode: Prisma.QueryMode.insensitive } },
        ];
      }

      const [items, total] = await Promise.all([
        prisma.product.findMany({
          where,
          orderBy: [{ featured: "desc" }, { createdAt: "desc" }],
          skip,
          take,
          include: {
            variants: {
              select: {
                id: true,
                priceCents: true,
                stock: true,
                discountActive: true,
                salePriceCents: true,
              },
              orderBy: { priceCents: "asc" },
            },
            media: {
              select: { id: true, url: true, position: true },
              orderBy: { position: "asc" },
            },
          },
        }),
        prisma.product.count({ where }),
      ]);

      const mapped = items.map(toCard);
      res.json({ items: mapped, total, skip, take });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Internal error" });
    }
  }
);

/* ================================================================================================
   ADMIN — LISTA + CRUD (używane przez AdminInspirationsPage.tsx)
================================================================================================ */

// GET /api/admin/inspirations
adminInspirationsRoutes.get(
  "/admin/inspirations",
  requireAuth,
  requireRole("ADMIN"),
  async (_req: Request, res: Response) => {
    const items = await prisma.inspiration.findMany({
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    });
    res.json(items); // FE oczekuje tablicy
  }
);

// POST /api/admin/inspirations
adminInspirationsRoutes.post(
  "/admin/inspirations",
  requireAuth,
  requireRole("ADMIN"),
  async (req: Request, res: Response) => {
    try {
      const { name, slug, description, imageUrl, position, active } = (req.body || {}) as {
        name?: string;
        slug?: string;
        description?: string | null;
        imageUrl?: string | null;
        position?: number;
        active?: boolean;
      };

      if (!name || !slug) {
        return res.status(400).json({ error: "name and slug are required" });
      }

      // domyślna pozycja: max + 1
      let pos = toInt(position, NaN);
      if (!Number.isFinite(pos)) {
        const last = await prisma.inspiration.findFirst({
          orderBy: { position: "desc" },
          select: { position: true },
        });
        pos = (last?.position ?? 0) + 1;
      }

      const created = await prisma.inspiration.create({
        data: {
          name: name.trim(),
          slug: slug.trim().toLowerCase(),
          description: description ?? null,
          imageUrl: imageUrl ?? null,
          position: pos,
          active: active ?? true,
        },
      });

      await logAdminAction({
        actorId: (req as any).user?.id || "admin",
        action: "INSPIRATION_CREATE",
        entityType: "Inspiration",
        entityId: created.id, // string
        after: created,
      });

      res.status(201).json(created);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Create failed" });
    }
  }
);

// PUT/PATCH /api/admin/inspirations/:id
adminInspirationsRoutes.put(
  "/admin/inspirations/:id",
  requireAuth,
  requireRole("ADMIN"),
  updateInspirationImpl
);
adminInspirationsRoutes.patch(
  "/admin/inspirations/:id",
  requireAuth,
  requireRole("ADMIN"),
  updateInspirationImpl
);

async function updateInspirationImpl(req: Request, res: Response) {
  try {
    const id = String(req.params.id || "");
    if (!id) return res.status(400).json({ error: "id required" });

    const before = await prisma.inspiration.findUnique({ where: { id } });
    if (!before) return res.status(404).json({ error: "Not found" });

    const b = (req.body || {}) as Partial<{
      name: string;
      slug: string;
      description: string | null;
      imageUrl: string | null;
      active: boolean;
      position: number;
    }>;

    const data: Prisma.InspirationUpdateInput = {};
    if (typeof b.name === "string") data.name = b.name.trim();
    if (typeof b.slug === "string") data.slug = b.slug.trim().toLowerCase();
    if (typeof b.description === "string" || b.description === null)
      data.description = b.description ?? null;
    if (typeof b.imageUrl === "string" || b.imageUrl === null)
      data.imageUrl = b.imageUrl ?? null;
    if (typeof b.active === "boolean") data.active = b.active;
    if (Number.isFinite(b.position)) data.position = Number(b.position);

    const after = await prisma.inspiration.update({ where: { id }, data });

    await logAdminAction({
      actorId: (req as any).user?.id || "admin",
      action: "INSPIRATION_UPDATE",
      entityType: "Inspiration",
      entityId: id, // string
      before,
      after,
    });

    res.json(after);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Update failed" });
  }
}

// DELETE /api/admin/inspirations/:id
adminInspirationsRoutes.delete(
  "/admin/inspirations/:id",
  requireAuth,
  requireRole("ADMIN"),
  async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id || "");
      if (!id) return res.status(400).json({ error: "id required" });

      const before = await prisma.inspiration.findUnique({
        where: { id },
        include: { products: { select: { id: true } } },
      });
      if (!before) return res.status(404).json({ error: "Not found" });

      // odpinamy produkty i kasujemy inspirację
      await prisma.inspiration.update({
        where: { id },
        data: { products: { set: [] } },
      });
      await prisma.inspiration.delete({ where: { id } });

      await logAdminAction({
        actorId: (req as any).user?.id || "admin",
        action: "INSPIRATION_DELETE",
        entityType: "Inspiration",
        entityId: id, // string
        before,
        after: null,
      });

      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Delete failed" });
    }
  }
);

/* ================================================================================================
   ADMIN — UPLOAD IMAGE
================================================================================================ */
adminInspirationsRoutes.post(
  "/admin/inspirations/:id/image",
  requireAuth,
  requireRole("ADMIN"),
  upload.single("file"),
  async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id || "");
      if (!id) return res.status(400).json({ error: "id required" });

      const f = req.file;
      if (!f) return res.status(400).json({ error: "No file" });

      const uploadsDir = path.join(process.cwd(), "uploads");
      await fs.mkdir(uploadsDir, { recursive: true });

      const ext =
        (f.originalname.match(/\.(jpe?g|png|webp|gif|avif)$/i)?.[0]?.toLowerCase() as string) ||
        ".jpg";
      const filename = `insp_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`;
      const abs = path.join(uploadsDir, filename);
      await fs.writeFile(abs, f.buffer);

      const url = `/uploads/${filename}`;
      const after = await prisma.inspiration.update({ where: { id }, data: { imageUrl: url } });

      await logAdminAction({
        actorId: (req as any).user?.id || "admin",
        action: "INSPIRATION_IMAGE_UPLOAD",
        entityType: "Inspiration",
        entityId: id, // string
        after,
      });

      res.json({ ok: true, imageUrl: url });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Image upload failed" });
    }
  }
);

/* ================================================================================================
   ADMIN — PRODUKTY przypięte / assign / unassign (dla panelu)
================================================================================================ */

// GET /api/admin/inspirations/:id/products?skip=&take=&q=
adminInspirationsRoutes.get(
  "/admin/inspirations/:id/products",
  requireAuth,
  requireRole("ADMIN"),
  async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id || "");
      if (!id) return res.status(400).json({ error: "id required" });

      const skip = Math.max(0, Number(req.query.skip ?? 0) || 0);
      const take = Math.min(100, Math.max(1, Number(req.query.take ?? 25) || 25));
      const q = String(req.query.q ?? "").trim();

      const where: Prisma.ProductWhereInput = {
        deletedAt: { equals: null },
        inspirations: { some: { id } }, // id = string
      };
      if (q) {
        where.OR = [
          { name: { contains: q, mode: Prisma.QueryMode.insensitive } },
          { slug: { contains: q, mode: Prisma.QueryMode.insensitive } },
        ];
      }

      const [items, total] = await Promise.all([
        prisma.product.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip,
          take,
          select: { id: true, slug: true, name: true },
        }),
        prisma.product.count({ where }),
      ]);

      res.json({ items, total, skip, take });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Internal error" });
    }
  }
);

// POST /api/admin/inspirations/:id/assign  { productIds: string[] }
adminInspirationsRoutes.post(
  "/admin/inspirations/:id/assign",
  requireAuth,
  requireRole("ADMIN"),
  async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id || "");
      if (!id) return res.status(400).json({ error: "id required" });

      const body = (req.body || {}) as { productIds?: string[] };
      const ids = Array.isArray(body.productIds) ? body.productIds.filter(Boolean) : [];

      if (!ids.length) {
        return res.status(400).json({ error: "productIds[] are required" });
      }

      await prisma.inspiration.update({
        where: { id },
        data: { products: { connect: ids.map((pid) => ({ id: pid })) } },
      });

      await logAdminAction({
        actorId: (req as any).user?.id || "admin",
        action: "INSPIRATION_ASSIGN_PRODUCTS",
        entityType: "Inspiration",
        entityId: id, // string
        after: { productIds: ids },
      });

      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Assign failed" });
    }
  }
);

// POST /api/admin/inspirations/:id/unassign  { productIds: string[] }
adminInspirationsRoutes.post(
  "/admin/inspirations/:id/unassign",
  requireAuth,
  requireRole("ADMIN"),
  async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id || "");
      if (!id) return res.status(400).json({ error: "id required" });

      const body = (req.body || {}) as { productIds?: string[] };
      const ids = Array.isArray(body.productIds) ? body.productIds.filter(Boolean) : [];

      if (!ids.length) {
        return res.status(400).json({ error: "productIds[] are required" });
      }

      await prisma.inspiration.update({
        where: { id },
        data: { products: { disconnect: ids.map((pid) => ({ id: pid })) } },
      });

      await logAdminAction({
        actorId: (req as any).user?.id || "admin",
        action: "INSPIRATION_UNASSIGN_PRODUCTS",
        entityType: "Inspiration",
        entityId: id, // string
        after: { productIds: ids },
      });

      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Unassign failed" });
    }
  }
);

export default adminInspirationsRoutes;
