// api/src/routes/adminProducts.ts
import {
  Router,
  type Request,
  type Response,
  type Router as RouterType,
} from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/roles";
import { logAdminAction } from "../lib/adminLog";

export const adminProducts: RouterType = Router();

/* ================================================================================================
   Helpers
================================================================================================ */
function toBool(v: unknown): boolean {
  return v === true || v === "true" || v === "1";
}
function now() {
  return new Date();
}
function actorIdFromReq(req: Request): string {
  return ((req as any).user?.id || (req as any).userId || "admin") as string;
}
function coerceCategorySlug(category: any): string {
  if (!category) return "";
  if (typeof category === "string") return category.trim();
  if (typeof category === "object" && category?.slug) return String(category.slug);
  return "";
}
async function ensureCategoryBySlug(slug: string) {
  const s = slug.trim();
  if (!s) return null;
  const found = await prisma.category.findUnique({ where: { slug: s } });
  if (found) return found;
  return prisma.category.create({
    data: { slug: s, name: s.replace(/[-_]/g, " ").replace(/\s+/g, " ").trim() || s },
  });
}

/* ================================================================================================
   LIST: GET /api/admin/products?query=&q=&page=&limit=&withDeleted=false
================================================================================================ */
adminProducts.get(
  "/products",
  requireAuth,
  requireRole("ADMIN"),
  async (req: Request, res: Response) => {
    const qParam =
      ((req.query.query as string | undefined) ?? (req.query.q as string | undefined)) || "";
    const query = qParam.trim();
    const withDeleted = toBool(req.query.withDeleted);
    const page = Math.max(1, parseInt((req.query.page as string) || "1", 10));
    const limit = Math.max(1, Math.min(100, parseInt((req.query.limit as string) || "20", 10)));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query) {
      where.OR = [
        { name: { contains: query, mode: "insensitive" } },
        { slug: { contains: query, mode: "insensitive" } },
      ];
    }
    if (!withDeleted) where.deletedAt = null;

    const [items, total] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy: { createdAt: "asc" },
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          slug: true,
          deletedAt: true,
          createdAt: true,
          updatedAt: true,
          featured: true,
          category: { select: { id: true, name: true, slug: true} },
          variants: {
            select: {
              id: true,
              priceCents: true,
              stock: true,
              sku: true,
              color: true,
              size: true,
              personalize: true,
            },
            orderBy: { priceCents: "asc" }, // szybki minPrice na froncie
          },
          media: {
            select: { id: true, url: true, kind: true, position: true },
            orderBy: { position: "asc" },
          },
        },
      }),
      prisma.product.count({ where }),
    ]);

    res.json({ items, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
  }
);

/* ================================================================================================
   BULK DELETE — zgodny z frontem
   DELETE /api/admin/products               { all: true }      (?hard=1)
   DELETE /api/admin/products               { ids: string[] }  (?hard=1)
   (kompat) DELETE /api/admin/products/all  (?hard=1)
================================================================================================ */
// Kompat: /products/all
adminProducts.delete(
  "/products/all",
  requireAuth,
  requireRole("ADMIN"),
  async (req: Request, res: Response) => {
    // Przekierowujemy w to samo wykonanie co endpoint niżej
    (req as any).body = { all: true };
    return bulkDeleteImpl(req, res);
  }
);

// Właściwy endpoint używany przez frontend
adminProducts.delete(
  "/products",
  requireAuth,
  requireRole("ADMIN"),
  async (req: Request, res: Response) => {
    return bulkDeleteImpl(req, res);
  }
);

async function bulkDeleteImpl(req: Request, res: Response) {
  const hard = toBool(req.query.hard);
  const body = (req.body || {}) as { all?: boolean; ids?: string[] };

  if (!body.all && (!Array.isArray(body.ids) || body.ids.length === 0)) {
    return res.status(400).json({ error: "Provide { all: true } or { ids: string[] }" });
  }

  if (hard) {
    const where = body.all ? {} : { id: { in: body.ids! } };
    const result = await prisma.$transaction(async (tx) => {
      // usuń media i warianty skojarzone
      const productIds =
        body.all
          ? (await tx.product.findMany({ select: { id: true } })).map((p) => p.id)
          : body.ids!;
      if (productIds.length) {
        await tx.media.deleteMany({ where: { productId: { in: productIds } } });
        await tx.variant.deleteMany({ where: { productId: { in: productIds } } });
      }
      const p = await tx.product.deleteMany({ where });
      return { products: p.count };
    });

    await logAdminAction({
      actorId: actorIdFromReq(req),
      action: "PRODUCT_BULK_DELETE_HARD",
      entityType: "Product",
      entityId: body.all ? "*" : (body.ids || []).join(","),
      meta: { hard: true, scope: body.all ? "ALL" : "SELECTED", counts: result },
    });

    return res.json({ ok: true, deleted: result });
  } else {
    const where = body.all ? { deletedAt: null } : { id: { in: body.ids! }, deletedAt: null };
    const updated = await prisma.product.updateMany({ where, data: { deletedAt: now() } });

    await logAdminAction({
      actorId: actorIdFromReq(req),
      action: "PRODUCT_BULK_DELETE_SOFT",
      entityType: "Product",
      entityId: body.all ? "*" : (body.ids || []).join(","),
      after: { scope: body.all ? "ALL" : "SELECTED", softDeleted: updated.count },
    });

    return res.json({ ok: true, softDeleted: updated.count });
  }
}

/* ================================================================================================
   GET ONE: /api/admin/products/:id
================================================================================================ */
adminProducts.get(
  "/products/:id",
  requireAuth,
  requireRole("ADMIN"),
  async (req: Request, res: Response) => {
    const id = String(req.params.id || "");
    if (!id) return res.status(400).json({ error: "Product id required" });

    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        variants: true, // w schema masz createdAt/updatedAt, ale tu nie jest wymagane sortowanie
        media: { orderBy: { position: "asc" } },
      },
    });
    if (!product) return res.status(404).json({ error: "Product not found" });

    res.json({ product });
  }
);

/* ================================================================================================
   CREATE: POST /api/admin/products
================================================================================================ */
adminProducts.post(
  "/products",
  requireAuth,
  requireRole("ADMIN"),
  async (req: Request, res: Response) => {
    const b = (req.body || {}) as any;

    if (!b?.name || !b?.slug || !b?.variant?.sku || typeof b?.variant?.priceCents !== "number") {
      return res.status(400).json({
        error: "name, slug, variant.sku, variant.priceCents are required",
      });
    }

    const slug = String(b.slug).trim().toLowerCase();
    const exists = await prisma.product.findUnique({ where: { slug } });
    if (exists) return res.status(409).json({ error: "Slug already in use" });

    let categoryId: string | null = null;
    if (b.category !== undefined) {
      const catSlug = coerceCategorySlug(b.category);
      if (catSlug) {
        const cat = await ensureCategoryBySlug(catSlug);
        categoryId = cat?.id ?? null;
      }
    }

    const created = await prisma.product.create({
      data: {
        name: String(b.name).trim(),
        slug,
        description: b.description ? String(b.description).trim() : null,
        brand: b.brand ? String(b.brand).trim() : null,
        featured: !!b.featured,
        categoryId,
        variants: {
          create: {
            sku: String(b.variant.sku).trim(),
            priceCents: b.variant.priceCents,
            stock: typeof b.variant.stock === "number" ? b.variant.stock : 0,
            color: b.variant.color ? String(b.variant.color) : null,
            size: b.variant.size ? String(b.variant.size) : null,
            personalize: !!b.variant.personalize,
          },
        },
      },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        variants: true,
        media: true,
      },
    });

    await logAdminAction({
      actorId: actorIdFromReq(req),
      action: "PRODUCT_CREATE",
      entityType: "Product",
      entityId: created.id,
      after: created,
    });

    res.status(201).json({ ok: true, product: created });
  }
);

/* ================================================================================================
   UPDATE: PUT /api/admin/products/:id  (mirror jako PATCH poniżej)
   - wspiera: name, slug (z walidacją unikalności), description, brand, featured, undelete
   - category: <slug> (connect), "" (disconnect)
================================================================================================ */
async function updateProductImpl(req: Request, res: Response) {
  const id = String(req.params.id || "");
  if (!id) return res.status(400).json({ error: "Product id required" });

  const before = await prisma.product.findUnique({ where: { id } });
  if (!before) return res.status(404).json({ error: "Product not found" });

  const b = (req.body || {}) as any;
  const data: any = {};

  if (typeof b.name === "string") data.name = b.name.trim();
  if (typeof b.description === "string") data.description = b.description.trim();
  if (typeof b.brand === "string" || b.brand === null) data.brand = (b.brand ?? null) || null;
  if (typeof b.featured === "boolean") data.featured = b.featured;
  if (b.undelete === true) data.deletedAt = null;

  // SLUG – kontrola duplikatów
  if (typeof b.slug === "string") {
    const nextSlug = b.slug.trim().toLowerCase();
    if (nextSlug !== before.slug) {
      const slugExists = await prisma.product.findUnique({ where: { slug: nextSlug } });
      if (slugExists && slugExists.id !== id) {
        return res.status(409).json({ error: "Slug already in use" });
      }
      data.slug = nextSlug;
    }
  }

  // KATEGORIA: slug -> categoryId
  if (b.category !== undefined) {
    const catSlug = coerceCategorySlug(b.category);
    if (!catSlug) {
      data.categoryId = null;
    } else {
      const cat = await ensureCategoryBySlug(catSlug);
      data.categoryId = cat?.id ?? null;
    }
  }

  await prisma.product.update({ where: { id }, data });
  const after = await prisma.product.findUnique({
    where: { id },
    include: {
      category: { select: { id: true, name: true, slug: true } },
      variants: true,
      media: true,
    },
  });

  await logAdminAction({
    actorId: actorIdFromReq(req),
    action: "PRODUCT_UPDATE",
    entityType: "Product",
    entityId: id,
    before,
    after,
  });

  res.json({ ok: true, product: after });
}

adminProducts.put(
  "/products/:id",
  requireAuth,
  requireRole("ADMIN"),
  updateProductImpl
);

// Mirror PATCH (frontend czasem woła PATCH)
adminProducts.patch(
  "/products/:id",
  requireAuth,
  requireRole("ADMIN"),
  updateProductImpl
);

/* ================================================================================================
   DELETE (soft/hard): /api/admin/products/:id[?hard=1]
================================================================================================ */
adminProducts.delete(
  "/products/:id",
  requireAuth,
  requireRole("ADMIN"),
  async (req: Request, res: Response) => {
    const id = String(req.params.id || "");
    if (!id) return res.status(400).json({ error: "Product id required" });

    const hard = toBool(req.query.hard);
    const before = await prisma.product.findUnique({
      where: { id },
      include: { variants: true, media: true },
    });
    if (!before) return res.status(404).json({ error: "Product not found" });

    if (hard) {
      await prisma.$transaction(async (tx) => {
        await tx.media.deleteMany({ where: { productId: id } });
        await tx.variant.deleteMany({ where: { productId: id } });
        await tx.product.delete({ where: { id } });
      });

      await logAdminAction({
        actorId: actorIdFromReq(req),
        action: "PRODUCT_DELETE_HARD",
        entityType: "Product",
        entityId: id,
        before,
        after: null,
      });

      return res.json({ ok: true });
    } else {
      const after = await prisma.product.update({
        where: { id },
        data: { deletedAt: now() },
      });

      await logAdminAction({
        actorId: actorIdFromReq(req),
        action: "PRODUCT_DELETE_SOFT",
        entityType: "Product",
        entityId: id,
        before,
        after,
      });

      return res.json({ ok: true });
    }
  }
);

/* ================================================================================================
   VARIANT PRICE (legacy): PUT /api/admin/variants/:id/price
================================================================================================ */
adminProducts.put(
  "/variants/:id/price",
  requireAuth,
  requireRole("ADMIN"),
  async (req: Request, res: Response) => {
    const id = String(req.params.id || "");
    if (!id) return res.status(400).json({ error: "Variant id required" });

    const { priceCents } = (req.body || {}) as { priceCents?: number };
    if (typeof priceCents !== "number") {
      return res.status(400).json({ error: "priceCents required" });
    }

    const before = await prisma.variant.findUnique({ where: { id } });
    if (!before) return res.status(404).json({ error: "Variant not found" });

    if (before.priceCents !== priceCents) {
      await prisma.$transaction([
        prisma.variant.update({ where: { id }, data: { priceCents } }),
        prisma.variantPriceHistory.create({
          data: {
            variantId: id,
            oldPrice: before.priceCents,
            newPrice: priceCents,
            changedBy: actorIdFromReq(req),
          },
        }),
      ]);
    }

    await logAdminAction({
      actorId: actorIdFromReq(req),
      action: "VARIANT_PRICE_CHANGE",
      entityType: "Variant",
      entityId: id,
      before: { priceCents: before.priceCents },
      after: { priceCents },
    });

    const after = await prisma.variant.findUnique({ where: { id } });
    res.json({ ok: true, variant: after });
  }
);

/* ================================================================================================
   VARIANT UPDATE (pełny): PATCH /api/admin/variants/:variantId
================================================================================================ */
adminProducts.patch(
  "/variants/:variantId",
  requireAuth,
  requireRole("ADMIN"),
  async (req: Request, res: Response) => {
    try {
      const id = (req.params.variantId || "").trim();
      if (!id) return res.status(400).json({ error: "variantId is required" });

      const body = (req.body ?? {}) as {
        priceCents?: number;
        stock?: number;
        sku?: string | null;
        color?: string | undefined;
        size?: string | undefined;
        personalize?: boolean;
      };

      const data: any = {};
      if (Number.isFinite(body.priceCents)) data.priceCents = Number(body.priceCents);
      if (Number.isFinite(body.stock)) data.stock = Math.max(0, Number(body.stock) || 0);
      if (typeof body.sku === "string" || body.sku === null) data.sku = body.sku ?? null;
      if (typeof body.color === "string" || body.color === undefined) data.color = body.color ?? null;
      if (typeof body.size === "string" || body.size === undefined) data.size = body.size ?? null;
      if (typeof body.personalize === "boolean") data.personalize = !!body.personalize;

      const current = await prisma.variant.findUnique({ where: { id } });
      if (!current) return res.status(404).json({ error: "Variant not found" });

      const updated = await prisma.variant.update({ where: { id }, data });

      if (typeof data.priceCents === "number" && data.priceCents !== current.priceCents) {
        await prisma.variantPriceHistory.create({
          data: {
            variantId: id,
            oldPrice: current.priceCents,
            newPrice: data.priceCents,
            changedBy: actorIdFromReq(req),
          },
        });

        await logAdminAction({
          actorId: actorIdFromReq(req),
          action: "VARIANT_PRICE_CHANGE",
          entityType: "Variant",
          entityId: id,
          before: { priceCents: current.priceCents },
          after: { priceCents: data.priceCents },
        });
      } else {
        await logAdminAction({
          actorId: actorIdFromReq(req),
          action: "VARIANT_UPDATE",
          entityType: "Variant",
          entityId: id,
          before: current,
          after: updated,
        });
      }

      return res.json({ ok: true, variant: updated });
    } catch (err) {
      console.error("PATCH /api/admin/variants/:variantId error:", err);
      return res.status(500).json({ error: "Failed to update variant" });
    }
  }
);

export default adminProducts;
