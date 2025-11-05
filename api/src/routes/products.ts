// api/src/routes/products.ts
import { Router, type Request, type Response } from "express";
import path from "node:path";
import fs from "node:fs";
import multer from "multer";
import { prisma } from "../lib/prisma";

// ======================================================================
// Konfiguracja uploadu (multer)
// ======================================================================
const uploadDir = path.join(process.cwd(), "uploads", "products");
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const base = path
      .basename(file.originalname || "image", ext)
      .replace(/[^\w\d\-_.]+/g, "_");
    const stamp = Date.now();
    cb(null, `${base}_${stamp}${ext || ".jpg"}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\//i.test(file.mimetype)) {
      return cb(new Error("Unsupported file type. Only image/* is allowed."));
    }
    cb(null, true);
  },
});

// ======================================================================
// Pomocnicze
// ======================================================================
function parseBool(val: any, def = false) {
  if (val === undefined || val === null) return def;
  const s = String(val).toLowerCase().trim();
  return ["1", "true", "yes", "y", "on"].includes(s);
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

async function nextMediaPosition(productId: string) {
  const last = await prisma.media.findFirst({
    where: { productId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  return (last?.position ?? 0) + 1;
}

function mediaPublicUrl(localFilename: string) {
  return `/uploads/products/${localFilename}`;
}

// ======================================================================
// Router
// ======================================================================
export const products: Router = Router();

/**
 * PUBLIC — lista kategorii
 */
products.get("/categories", async (req: Request, res: Response) => {
  try {
    const withCount = parseBool(req.query.withCount, true);
    const onlyWithProducts = parseBool(req.query.onlyWithProducts, false);
    const q = (req.query.q as string | undefined)?.trim() || "";

    const where: any = {};
    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { slug: { contains: q, mode: "insensitive" } },
      ];
    }
    if (onlyWithProducts) {
      where.products = { some: { deletedAt: null } };
    }

    const rows = await prisma.category.findMany({
      where,
      select: {
        id: true,
        name: true,
        slug: true,
        ...(withCount ? { _count: { select: { products: true } } } : {}),
      },
      orderBy: { name: "asc" },
    });

    res.json({ items: rows });
  } catch (err) {
    console.error("GET /categories error", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * PUBLIC — popular (featured)
 */
products.get("/popular", async (req: Request, res: Response) => {
  try {
    const raw = parseInt((req.query.limit as string) || "8", 10);
    const limit = Math.max(1, Math.min(50, Number.isFinite(raw) ? raw : 8));

    const items = await prisma.product.findMany({
      where: { deletedAt: null, featured: true },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        category: { select: { id: true, name: true, slug: true } },
        media: { select: { url: true }, orderBy: { position: "asc" }, take: 1 },
        variants: { select: { priceCents: true }, orderBy: { priceCents: "asc" }, take: 1 },
      },
    });

    res.json({ items });
  } catch (err) {
    console.error("GET /popular error", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * PUBLIC — lista produktów (filtry)
 */
products.get("/", async (req: Request, res: Response) => {
  try {
    const q = (req.query.q as string | undefined)?.trim() || "";
    const category = (req.query.category as string | undefined)?.trim() || "";

    const limitParam =
      (req.query.limit as string | undefined) ?? (req.query.take as string | undefined);
    const rawLimit = parseInt(limitParam || "12", 10);
    const take = Math.max(1, Math.min(100, Number.isFinite(rawLimit) ? rawLimit : 12));

    const page = Math.max(1, parseInt((req.query.page as string) || "1", 10));
    const skip = (page - 1) * take;

    const featured = (req.query.featured as string | undefined) === "true";
    const withDeleted = (req.query.withDeleted as string | undefined) === "true";

    const where: any = {};
    if (!withDeleted) where.deletedAt = null;
    if (featured) where.featured = true;

    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
        { slug: { contains: q, mode: "insensitive" } },
      ];
    }

    if (category) {
      // nullowalna relacja → filtr po slug
      where.category = { is: { slug: category } };
    }

    const [items, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
        include: {
          category: { select: { id: true, name: true, slug: true } },
          media: { orderBy: { position: "asc" } },
          variants: { orderBy: { priceCents: "asc" } },
        },
      }),
      prisma.product.count({ where }),
    ]);

    res.json({
      items,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / take)),
    });
  } catch (err) {
    console.error("GET /products error", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * PUBLIC — detale po slug
 */
products.get("/by-slug/:slug", async (req: Request, res: Response) => {
  try {
    const slug = req.params.slug?.trim();
    if (!slug) return res.status(400).json({ error: "Slug is required" });

    const product = await prisma.product.findUnique({
      where: { slug },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        media: { orderBy: { position: "asc" } },
        variants: { orderBy: { priceCents: "asc" } },
      },
    });

    if (!product || product.deletedAt) return res.status(404).send("Not Found");
    res.json(product);
  } catch (err) {
    console.error("GET /by-slug/:slug error", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * PUBLIC — detale (alias)
 */
products.get("/:slug", async (req: Request, res: Response) => {
  try {
    const slug = req.params.slug?.trim();
    if (!slug) return res.status(400).json({ error: "Slug is required" });

    const product = await prisma.product.findUnique({
      where: { slug },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        media: { orderBy: { position: "asc" } },
        variants: { orderBy: { priceCents: "asc" } },
      },
    });

    if (!product || product.deletedAt) return res.status(404).send("Not Found");
    res.json(product);
  } catch (err) {
    console.error("GET /:slug error", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ======================================================================
// ==============================  ADMIN  ===============================
// Prefiks w server.ts: app.use("/api", products)
// → ścieżki /admin/... będą dostępne jako /api/admin/...
// ======================================================================

/** ADMIN — GET /api/admin/products (lista z filtrami) */
products.get("/admin/products", async (req: Request, res: Response) => {
  try {
    const q = (req.query.q as string | undefined)?.trim() || "";
    const category = (req.query.category as string | undefined)?.trim() || "";

    const limitParam =
      (req.query.limit as string | undefined) ?? (req.query.take as string | undefined);
    const rawLimit = parseInt(limitParam || "20", 10);
    const take = Math.max(1, Math.min(100, Number.isFinite(rawLimit) ? rawLimit : 20));

    const page = Math.max(1, parseInt((req.query.page as string) || "1", 10));
    const skip = (page - 1) * take;

    const withDeleted =
      (req.query.withDeleted as string | undefined)?.toLowerCase() === "true" ||
      (req.query.withDeleted as string | undefined) === "1";

    const featured = (req.query.featured as string | undefined) === "true";

    const where: any = {};
    if (!withDeleted) where.deletedAt = null;
    if (featured) where.featured = true;

    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
        { slug: { contains: q, mode: "insensitive" } },
      ];
    }

    if (category) {
      where.category = { is: { slug: category } };
    }

    const [items, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
        include: {
          category: { select: { id: true, name: true, slug: true } },
          media: { orderBy: { position: "asc" } },
          variants: { orderBy: { priceCents: "asc" } },
        },
      }),
      prisma.product.count({ where }),
    ]);

    res.json({
      items,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / take)),
    });
  } catch (err) {
    console.error("GET /admin/products error", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

/** ADMIN — GET /api/admin/products/:id */
products.get("/admin/products/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        media: { orderBy: { position: "asc" } },
        variants: { orderBy: { priceCents: "asc" } },
      },
    });
    if (!product) return res.status(404).json({ error: "Not Found" });
    res.json({ product });
  } catch (err) {
    console.error("GET /admin/products/:id error", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

/** ADMIN — POST /api/admin/products (tworzenie z 1 wariantem) */
products.post("/admin/products", async (req: Request, res: Response) => {
  try {
    const {
      name,
      slug,
      description,
      brand,
      category, // slug
      featured,
      variant, // { sku, priceCents, stock, color?, size?, personalize? }
    } = req.body || {};

    if (!name || !slug || !variant || typeof variant?.priceCents !== "number") {
      return res
        .status(400)
        .json({ error: "Missing required fields (name, slug, variant.priceCents)" });
    }

    let categoryId: string | null = null;
    const catSlug = coerceCategorySlug(category);
    if (catSlug) {
      const cat = await ensureCategoryBySlug(catSlug);
      categoryId = cat?.id ?? null;
    }

    const created = await prisma.product.create({
      data: {
        name,
        slug,
        description: description ?? null,
        brand: brand ?? null,
        featured: !!featured,
        categoryId,
        variants: {
          create: {
            sku: variant?.sku ?? slug.toUpperCase(),
            priceCents: Math.max(0, Number(variant?.priceCents || 0)),
            stock: Math.max(0, Number(variant?.stock || 0)),
            color: variant?.color ?? null,
            size: variant?.size ?? null,
            personalize: !!variant?.personalize,
          },
        },
      },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        media: true,
        variants: true,
      },
    });

    res.status(201).json({ product: created });
  } catch (err) {
    console.error("POST /admin/products error", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

/** ADMIN — PATCH /api/admin/products/:id (edycja) */
products.patch("/admin/products/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const {
      name,
      slug,
      description,
      brand,
      category, // slug lub obiekt z .slug
      featured,
      undelete,
    } = req.body || {};

    const data: any = {};
    if (name !== undefined) data.name = name;
    if (slug !== undefined) data.slug = slug;
    if (description !== undefined) data.description = description ?? null;
    if (brand !== undefined) data.brand = brand ?? null;
    if (featured !== undefined) data.featured = !!featured;
    if (undelete) data.deletedAt = null;

    const catSlug = coerceCategorySlug(category);
    if (catSlug) {
      const cat = await ensureCategoryBySlug(catSlug);
      data.categoryId = cat?.id ?? null;
    } else if (category === "") {
      data.categoryId = null;
    }

    const updated = await prisma.product.update({
      where: { id },
      data,
      include: {
        category: { select: { id: true, name: true, slug: true } },
        media: true,
        variants: true,
      },
    });

    res.json({ product: updated });
  } catch (err) {
    console.error("PATCH /admin/products/:id error", err);
    if ((err as any)?.code === "P2002") {
      return res.status(409).json({ error: "Unique constraint failed (slug?)" });
    }
    res.status(500).json({ error: "Internal Server Error" });
  }
});

/** ADMIN — DELETE /api/admin/products/:id?hard=1 (soft/hard) */
products.delete("/admin/products/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const hard = parseBool(req.query.hard);

    if (hard) {
      await prisma.media.deleteMany({ where: { productId: id } });
      await prisma.variant.deleteMany({ where: { productId: id } });
      await prisma.product.delete({ where: { id } });
      return res.json({ ok: true, hard: true });
    }

    const updated = await prisma.product.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    res.json({ ok: true, product: updated });
  } catch (err) {
    console.error("DELETE /admin/products/:id error", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

/** ADMIN — DELETE /api/admin/products (bulk soft/hard) */
products.delete("/admin/products", async (req: Request, res: Response) => {
  try {
    const { ids, all, force } = req.body || {};
    const hard = !!force;

    if (all) {
      if (hard) {
        await prisma.media.deleteMany({});
        await prisma.variant.deleteMany({});
        await prisma.product.deleteMany({});
        return res.json({ ok: true, hard: true, all: true });
      }
      await prisma.product.updateMany({
        data: { deletedAt: new Date() },
        where: { deletedAt: null },
      });
      return res.json({ ok: true, hard: false, all: true });
    }

    if (!Array.isArray(ids) || !ids.length) {
      return res.status(400).json({ error: "Provide ids[] or all:true" });
    }

    if (hard) {
      await prisma.media.deleteMany({ where: { productId: { in: ids } } });
      await prisma.variant.deleteMany({ where: { productId: { in: ids } } });
      await prisma.product.deleteMany({ where: { id: { in: ids } } });
      return res.json({ ok: true, hard: true, count: ids.length });
    }

    await prisma.product.updateMany({
      where: { id: { in: ids } },
      data: { deletedAt: new Date() },
    });
    res.json({ ok: true, hard: false, count: ids.length });
  } catch (err) {
    console.error("DELETE /admin/products (bulk) error", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

/** ADMIN — POST /api/admin/products/:id/upload-image (file|image) */
products.post(
  "/admin/products/:id/upload-image",
  upload.single("file"),
  async (req: Request, res: Response) => {
    try {
      const id = req.params.id;
      let file = (req as any).file;

      if (!file) {
        const single = upload.single("image") as any;
        await new Promise<void>((resolve, reject) =>
          single(req, res, (err: any) => (err ? reject(err) : resolve()))
        );
        file = (req as any).file;
      }
      if (!file) return res.status(400).json({ error: "No file provided (field: file or image)" });

      const product = await prisma.product.findUnique({ where: { id } });
      if (!product) return res.status(404).json({ error: "Product not found" });

      const position = await nextMediaPosition(id);
      const url = mediaPublicUrl(file.filename);

      const created = await prisma.media.create({
        data: { productId: id, kind: "image", position, url },
      });

      res.status(201).json({ media: created });
    } catch (err) {
      console.error("POST /admin/products/:id/upload-image error", err);
      res.status(500).json({ error: "Internal Server Error" });
    }
  }
);

/** ADMIN — ALIAS: POST /api/admin/products/:id/images */
products.post(
  "/admin/products/:id/images",
  upload.single("file"),
  async (req: Request, res: Response) => {
    (products as any).handle(
      { ...req, url: `/admin/products/${req.params.id}/upload-image`, method: "POST" },
      res
    );
  }
);

/** ADMIN — DELETE /api/admin/media/:mediaId */
products.delete("/admin/media/:mediaId", async (req: Request, res: Response) => {
  try {
    const mediaId = req.params.mediaId;
    const media = await prisma.media.findUnique({ where: { id: mediaId } });
    if (!media) return res.status(404).json({ error: "Not Found" });

    if (media.url?.startsWith("/uploads/products/")) {
      const f = path.join(process.cwd(), media.url.replace(/^\//, ""));
      fs.promises.unlink(f).catch(() => void 0);
    }

    await prisma.media.delete({ where: { id: mediaId } });
    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /admin/media/:mediaId error", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

/** ADMIN — PATCH /api/admin/variants/:variantId */
products.patch("/admin/variants/:variantId", async (req: Request, res: Response) => {
  try {
    const variantId = req.params.variantId;
    const {
      sku,
      priceCents,
      stock,
      color,
      size,
      personalize,
    }: {
      sku?: string | null;
      priceCents?: number;
      stock?: number;
      color?: string;
      size?: string;
      personalize?: boolean;
    } = req.body || {};

    const data: any = {};
    if (sku !== undefined) data.sku = sku ?? null;
    if (priceCents !== undefined) data.priceCents = Math.max(0, Number(priceCents) || 0);
    if (stock !== undefined) data.stock = Math.max(0, Number(stock) || 0);
    if (color !== undefined) data.color = color || null;
    if (size !== undefined) data.size = size || null;
    if (personalize !== undefined) data.personalize = !!personalize;

    const updated = await prisma.variant.update({ where: { id: variantId }, data });
    res.json({ variant: updated });
  } catch (err) {
    console.error("PATCH /admin/variants/:variantId error", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

/** ADMIN — POST /api/admin/seed/popular  (body: { mode: "insert" | "upsert" }) */
products.post("/admin/seed/popular", async (req: Request, res: Response) => {
  try {
    const mode: "insert" | "upsert" = (req.body?.mode === "upsert" ? "upsert" : "insert");

    // wczytaj dane (dostosuj ścieżkę do swojego projektu)
    let dataset: any[] = [];
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require("../../popularGiftsData");
      dataset = mod?.popularGifts || mod?.default || [];
    } catch {
      dataset = [];
    }
    if (!Array.isArray(dataset) || !dataset.length) {
      return res.json({ createdCount: 0, created: [] });
    }

    const created: any[] = [];

    for (const row of dataset) {
      const {
        name,
        slug,
        description,
        brand,
        category,   // slug
        priceCents,
        stock,
        featured,
        imageUrl,
      } = row;

      let categoryId: string | null = null;
      const catSlug = coerceCategorySlug(category);
      if (catSlug) {
        const cat = await ensureCategoryBySlug(catSlug);
        categoryId = cat?.id ?? null;
      }

      // 1) produkt – upsert po slug
      const prod = await prisma.product.upsert({
        where: { slug },
        create: {
          name,
          slug,
          description: description ?? null,
          brand: brand ?? null,
          featured: !!featured,
          categoryId,
          variants: {
            create: {
              sku: (slug || name || "SKU").toUpperCase(),
              priceCents: Math.max(0, Number(priceCents) || 0),
              stock: Math.max(0, Number(stock) || 0),
            },
          },
          media: imageUrl
            ? { create: { url: imageUrl, kind: "image", position: 1 } }
            : undefined,
        },
        update: {
          name,
          description: description ?? null,
          brand: brand ?? null,
          featured: !!featured,
          categoryId,
        },
        include: { variants: true, media: true },
      });

      // 2) wariant – upsert po kompozycie (productId, sku)
      const sku = (slug || name || "SKU").toUpperCase();

      // Uwaga: po zmianie schematu i `prisma generate` pole `productId_sku` będzie dostępne w typach.
      // Poniższe `as any` pozwala przejść kompilacji nawet zanim wygenerujesz nowy klient.
      await (prisma.variant as any).upsert({
        where: { productId_sku: { productId: prod.id, sku } },
        create: {
          productId: prod.id,
          sku,
          priceCents: Math.max(0, Number(priceCents) || 0),
          stock: Math.max(0, Number(stock) || 0),
        },
        update: {
          priceCents: Math.max(0, Number(priceCents) || 0),
          stock: Math.max(0, Number(stock) || 0),
        },
      });

      created.push({ id: prod.id, slug: prod.slug });
    }

    res.json({ createdCount: created.length, created });
  } catch (err) {
    console.error("POST /admin/seed/popular error", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default products;
