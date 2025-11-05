// api/src/routes/adminCategories.ts
import { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { prisma } from "../lib/prisma";

/* ===== Auth guard (dopasuj do własnego mechanizmu) ===== */
function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const role = (req as any)?.user?.role;
  if (role === "ADMIN") return next();
  return res.status(403).json({ error: "Admin only" });
}

/* ===== Upload (katalog /uploads serwowany przez express.static w server.ts) ===== */
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir });

/* ✅ Jawny typ routera */
const router: Router = Router();

/* Wszystkie poniższe trasy są admin-only */
router.use(requireAdmin);

/* ===== Utils ===== */
const slugify = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);

/* ================= DIAGNOSTYKA (opcjonalne) ================= */
router.get("/__ping", (_req, res) => res.json({ ok: true, who: "adminCategories" }));
router.get("/__dbcheck", async (_req, res) => {
  try {
    const dbinfo = await prisma.$queryRawUnsafe<any[]>(`SELECT current_database() AS db, current_schema() AS schema`);
    const hasOld = await prisma.$queryRawUnsafe<any[]>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name='products' AND column_name='category'`
    );
    res.json({
      ok: true,
      currentDb: dbinfo?.[0]?.db,
      schema: dbinfo?.[0]?.schema,
      legacyColumnExists: !!hasOld?.length,
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message });
  }
});

/* ================ LISTA KATEGORII (ADMIN) ================ */
router.get("/categories", async (_req: Request, res: Response) => {
  const items = await prisma.category.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      imageUrl: true,
      showInHeader: true,
      showInTiles: true,
      showInHero: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { products: true } },
    },
  });
  res.json({ items });
});

/* ============ PRODUKTY „BEZ KATEGORII” (NULL) ============ */
/* GET /api/admin/categories/uncategorized?skip=&take=&q= */
router.get("/categories/uncategorized", async (req: Request, res: Response) => {
  const skip = Math.max(0, Number(req.query.skip || 0));
  const take = Math.min(200, Math.max(1, Number(req.query.take || 25)));
  const q = (req.query.q ? String(req.query.q) : "").trim();

  const where: any = { categoryId: null };
  if (q) where.name = { contains: q, mode: "insensitive" };

  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: { id: true, slug: true, name: true },
      skip,
      take,
    }),
    prisma.product.count({ where }),
  ]);

  res.json({ items, total, skip, take });
});

/* ================ UTWÓRZ KATEGORIĘ ================ */
router.post("/categories", async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as {
    name?: string;
    slug?: string;
    showInHeader?: boolean;
    showInTiles?: boolean;
    showInHero?: boolean;
  };

  if (!body.name?.trim()) return res.status(400).json({ error: "Missing name" });

  const s = (body.slug || slugify(body.name)).trim().toLowerCase();

  const cat = await prisma.category.create({
    data: {
      name: body.name.trim(),
      slug: s,
      showInHeader: typeof body.showInHeader === "boolean" ? body.showInHeader : true,
      showInTiles: typeof body.showInTiles === "boolean" ? body.showInTiles : true,
      showInHero: typeof body.showInHero === "boolean" ? body.showInHero : false,
    },
    select: {
      id: true,
      name: true,
      slug: true,
      imageUrl: true,
      showInHeader: true,
      showInTiles: true,
      showInHero: true,
      _count: { select: { products: true } },
    },
  });

  res.status(201).json(cat);
});

/* ================ EDYTUJ KATEGORIĘ ================ */
router.patch("/categories/:id", async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };
  const body = (req.body ?? {}) as {
    name?: string;
    slug?: string;
    imageUrl?: string | null;
    showInHeader?: boolean;
    showInTiles?: boolean;
    showInHero?: boolean;
  };

  const data: any = {};
  if (typeof body.name === "string") data.name = body.name.trim();
  if (typeof body.slug === "string") data.slug = body.slug.trim().toLowerCase();
  if (typeof body.imageUrl === "string" || body.imageUrl === null) data.imageUrl = body.imageUrl;

  if (typeof body.showInHeader === "boolean") data.showInHeader = body.showInHeader;
  if (typeof body.showInTiles === "boolean") data.showInTiles = body.showInTiles;
  if (typeof body.showInHero === "boolean") data.showInHero = body.showInHero;

  if (!Object.keys(data).length) return res.status(400).json({ error: "Nothing to update" });

  const cat = await prisma.category.update({
    where: { id },
    data,
    select: {
      id: true,
      name: true,
      slug: true,
      imageUrl: true,
      showInHeader: true,
      showInTiles: true,
      showInHero: true,
      _count: { select: { products: true } },
    },
  });

  res.json(cat);
});

/* ================ USUŃ KATEGORIĘ ================ */
/*
DELETE /api/admin/categories/:id
  ?mode=orphan                → wszystkie produkty z tej kategorii dostają categoryId: null
  ?mode=move&targetId=<id>    → wszystkie produkty przenoszą się do innej kategorii
Alias: ?move=uncategorized    → tak jak orphan
*/
router.delete("/categories/:id", async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };

  const modeParam = req.query.mode ? String(req.query.mode) : undefined;
  const moveAlias = req.query.move ? String(req.query.move) : undefined;
  const targetId = req.query.targetId ? String(req.query.targetId) : null;

  let action: "orphan" | "move" = "orphan";
  let target: string | null = null;

  if (moveAlias === "uncategorized") {
    action = "orphan";
  } else if (modeParam === "move") {
    action = "move";
    target = targetId;
  }

  try {
    await prisma.$transaction(async (tx) => {
      if (action === "move") {
        if (!target || target === id) throw new Error("Invalid targetId");
        await tx.product.updateMany({ where: { categoryId: id }, data: { categoryId: target } });
      } else {
        await tx.product.updateMany({ where: { categoryId: id }, data: { categoryId: null } });
      }
      await tx.category.delete({ where: { id } });
    });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(400).json({ ok: false, error: e?.message || "Delete failed" });
  }
});

/* ========== PRZEPISZ PRODUKTY DO KATEGORII (bulk) ========== */
router.post("/categories/:id/reassign", async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };
  const { productIds } = (req.body || {}) as { productIds?: string[] };

  if (!Array.isArray(productIds) || productIds.length === 0) {
    return res.status(400).json({ error: "No productIds" });
  }
  const result = await prisma.product.updateMany({
    where: { id: { in: productIds } },
    data: { categoryId: id },
  });
  res.json({ ok: true, moved: result.count ?? productIds.length });
});

/* ========== PRODUKTY DLA KONKRETNEJ KATEGORII ========== */
/* GET /api/admin/categories/:id/products?skip=&take=&q= */
router.get("/categories/:id/products", async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };
  const skip = Math.max(0, Number(req.query.skip ?? 0));
  const take = Math.min(200, Math.max(1, Number(req.query.take ?? 50)));
  const q = (req.query.q ? String(req.query.q) : "").trim();

  const category = await prisma.category.findUnique({ where: { id }, select: { id: true } });
  if (!category) return res.status(404).json({ error: "Kategoria nie istnieje" });

  const where: any = { categoryId: id };
  if (q) where.name = { contains: q, mode: "insensitive" };

  const [items, total] = await Promise.all([
    prisma.product.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
    prisma.product.count({ where }),
  ]);

  res.json({ items, total, skip, take });
});

/* ========== UPLOAD OBRAZKA KATEGORII ========== */
/* POST /api/admin/categories/:id/image   (FormData: "file") */
router.post("/categories/:id/image", upload.single("file"), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) return res.status(400).json({ error: "Brak pliku" });

    const imageUrl = `/uploads/${file.filename}`;
    await prisma.category.update({ where: { id }, data: { imageUrl } });

    res.json({ ok: true, imageUrl });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Upload failed" });
  }
});

/* ========== IMPORT (CSV/JSON) ========== */
router.post("/categories/import", async (req: Request, res: Response) => {
  type Row = { productSlug: string; category: string };
  type Group = { category: string; productSlugs: string[] };

  const rows = (req.body?.rows as Row[] | undefined) || [];
  const groups = (req.body?.groups as Group[] | undefined) || [];

  if ((!rows || rows.length === 0) && (!groups || groups.length === 0)) {
    return res.status(400).json({ error: "Brak danych do importu." });
  }

  const map = new Map<string, { name: string; productSlugs: Set<string> }>();

  if (rows?.length) {
    for (const r of rows) {
      if (!r?.productSlug || !r?.category) continue;
      const catSlug = slugify(r.category);
      const display = r.category;
      if (!map.has(catSlug)) map.set(catSlug, { name: display, productSlugs: new Set() });
      map.get(catSlug)!.productSlugs.add(String(r.productSlug));
    }
  }
  if (groups?.length) {
    for (const g of groups) {
      if (!g?.category) continue;
      const catSlug = slugify(g.category);
      const display = g.category;
      if (!map.has(catSlug)) map.set(catSlug, { name: display, productSlugs: new Set() });
      const bucket = map.get(catSlug)!;
      (Array.isArray(g.productSlugs) ? g.productSlugs : []).forEach((ps) => {
        if (ps) bucket.productSlugs.add(String(ps));
      });
    }
  }

  let totalUpdated = 0;
  const report: Array<{ category: string; products: number }> = [];

  for (const [catSlug, { name, productSlugs }] of map.entries()) {
    const cat = await prisma.category.upsert({
      where: { slug: catSlug },
      update: { name },
      create: { slug: catSlug, name },
    });

    if (!productSlugs.size) {
      report.push({ category: `${name} (${catSlug})`, products: 0 });
      continue;
    }

    const upd = await prisma.product.updateMany({
      where: { slug: { in: Array.from(productSlugs) } },
      data: { categoryId: cat.id },
    });
    totalUpdated += upd.count ?? 0;
    report.push({ category: `${name} (${catSlug})`, products: upd.count ?? 0 });
  }

  res.json({ ok: true, totalUpdated, report });
});

/* ========== IMPORT ISTNIEJĄCYCH (legacy / sieroty) ========== */
router.post("/categories/import-existing", async (_req: Request, res: Response) => {
  try {
    const hasOld: Array<{ column_name: string }> = await prisma.$queryRawUnsafe(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'products' AND column_name = 'category'`
    );

    let totalUpdated = 0;
    const report: Array<{ category: string; products: number }> = [];

    if (hasOld?.length) {
      type Row = { category: string | null };
      const distinct: Row[] = await prisma.$queryRawUnsafe(
        `SELECT DISTINCT "category" FROM "products" WHERE "category" IS NOT NULL AND "category" <> ''`
      );
      const names = distinct.map((r) => r.category?.trim()).filter((v): v is string => Boolean(v));

      for (const oldName of names) {
        const s = slugify(oldName);
        const cat = await prisma.category.upsert({
          where: { slug: s },
          update: { name: oldName },
          create: { slug: s, name: oldName },
        });
        const updated = await prisma.$executeRawUnsafe(
          `UPDATE "products" SET "categoryId" = $1 WHERE "category" = $2`,
          cat.id,
          oldName
        );
        totalUpdated += Number(updated) || 0;
        report.push({ category: `${oldName} (${s})`, products: Number(updated) || 0 });
      }
      return res.json({ ok: true, source: "legacy", totalUpdated, report });
    }

    // brak legacy → „sieroty” (categoryId wskazuje na nieistniejący Category)
    const allCats = await prisma.category.findMany({ select: { id: true } });
    const catIds = new Set<string>(allCats.map((c) => c.id));
    type P = { id: string; categoryId: string | null };
    const withCat: P[] = await prisma.product.findMany({
      select: { id: true, categoryId: true },
      where: { NOT: { categoryId: null } },
    });

    const orphaned = withCat.filter((p) => p.categoryId && !catIds.has(p.categoryId));
    if (orphaned.length) {
      const placeholderName = "Imported (no source)";
      const placeholderSlug = slugify(placeholderName);
      const ph = await prisma.category.upsert({
        where: { slug: placeholderSlug },
        update: { name: placeholderName },
        create: { slug: placeholderSlug, name: placeholderName },
      });

      const updated = await prisma.product.updateMany({
        where: { id: { in: orphaned.map((o) => o.id) } },
        data: { categoryId: ph.id },
      });
      totalUpdated += updated.count ?? orphaned.length;
      report.push({ category: `${placeholderName} (${placeholderSlug})`, products: updated.count ?? orphaned.length });

      return res.json({ ok: true, source: "orphans", totalUpdated, report });
    }

    res.status(200).json({
      ok: false,
      reason: "no_source",
      message:
        "Brak legacy kolumny i osieroconych kategorii — użyj importu CSV/JSON (endpoint /categories/import).",
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || "Internal error" });
  }
});

/* ========== EXPORT POD CSV (opcjonalnie) ========== */
router.get("/products/basic", async (req: Request, res: Response) => {
  const onlyUncat = String(req.query.onlyUncategorized || "true") === "true";

  const categories = await prisma.category.findMany({ select: { id: true } });
  const catIds = new Set<string>(categories.map((c) => c.id));

  const all = await prisma.product.findMany({
    select: { id: true, slug: true, name: true, categoryId: true },
    orderBy: { createdAt: "asc" },
  });

  const items = onlyUncat ? all.filter((p) => !p.categoryId || !catIds.has(p.categoryId!)) : all;
  res.json({ items, total: items.length });
});

/* ========== ✅ ADMIN: SZCZEGÓŁY PRODUKTU (pełne relacje) ========== */
router.get("/products/:id", async (req: Request, res: Response, next: NextFunction) => {
  if (req.params.id === "basic") return next();
  const { id } = req.params as { id: string };

  const p = await prisma.product.findUnique({
    where: { id },
    include: {
      category: { select: { id: true, name: true, slug: true } },
      variants: {
        select: {
          id: true,
          sku: true,
          priceCents: true,
          stock: true,
          color: true,
          size: true,
          personalize: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      },
      media: {
        select: { id: true, url: true, kind: true, position: true },
        orderBy: { position: "asc" },
      },
    },
  });

  if (!p) return res.status(404).json({ error: "Product not found" });

  const price =
    typeof (p as any).price === "number"
      ? (p as any).price
      : typeof (p as any).priceCents === "number"
      ? (p as any).priceCents / 100
      : typeof (p as any).amountCents === "number"
      ? (p as any).amountCents / 100
      : null;

  res.json({
    id: p.id,
    slug: p.slug,
    name: p.name,
    brand: p.brand ?? null,
    description: p.description ?? null,
    featured: p.featured ?? false,
    imageUrl: (p as any).imageUrl ?? (p as any).image ?? null,
    category: p.category ? { id: p.category.id, name: p.category.name, slug: p.category.slug } : null,
    variants: p.variants.map(v => ({
      id: v.id,
      sku: v.sku,
      priceCents: v.priceCents,
      stock: v.stock,
      color: v.color,
      size: v.size,
      personalize: v.personalize,
    })),
    media: p.media,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    deletedAt: (p as any).deletedAt ?? null,
    price,
  });
});

/* ========== ✅ ADMIN: UPDATE PRODUKTU (bezpieczny — slug→id) ========== */
/* PATCH /api/admin/products/:productId
   Body akceptuje:
   - name, slug, description, brand, featured
   - category: <slug>  → connect
   - category: ""      → disconnect
   - (opcjonalnie) categoryId: <id> → connect po id (walidowane)
   - (opcjonalnie) undelete: true   → jeśli masz soft-delete (ustawiamy deletedAt = null)
*/
router.patch("/products/:productId", async (req: Request, res: Response) => {
  const { productId } = req.params as { productId: string };
  const body = req.body || {};

  const data: any = {};

  // standardowe pola
  if (typeof body.name === "string") data.name = body.name;
  if (typeof body.slug === "string") data.slug = body.slug;
  if (typeof body.description === "string") data.description = body.description;
  if (typeof body.brand === "string") data.brand = body.brand;
  if (typeof body.featured === "boolean") data.featured = body.featured;

  // opcjonalny undelete (jeśli masz soft-delete w schemacie)
  if (body.undelete === true) {
    data.deletedAt = null;
  }

  // 🔴 SLUG → ID (preferowane) albo connect po ID
  if (typeof body.category === "string") {
    const categorySlug = body.category.trim();
    if (!categorySlug) {
      data.category = { disconnect: true };
    } else {
      const cat = await prisma.category.findUnique({ where: { slug: categorySlug } });
      if (!cat) return res.status(400).json({ error: `Kategoria o slugu "${categorySlug}" nie istnieje.` });
      data.category = { connect: { id: cat.id } };
    }
  } else if (typeof body.categoryId === "string") {
    const cat = await prisma.category.findUnique({ where: { id: body.categoryId } });
    if (!cat) return res.status(400).json({ error: `Kategoria o id "${body.categoryId}" nie istnieje.` });
    data.category = { connect: { id: cat.id } };
  }

  if (!Object.keys(data).length) {
    return res.status(400).json({ error: "Nothing to update" });
  }

  try {
    const updated = await prisma.product.update({
      where: { id: productId },
      data,
    });
    return res.json({ product: updated });
  } catch (e: any) {
    if (e?.code === "P2003") {
      return res.status(400).json({ error: "Invalid category reference (FK violation)." });
    }
    return res.status(500).json({ error: e?.message || "Update failed" });
  }
});

/* ========== (legacy) bezpośredni update categoryId (dla kompatybilności) ========== */
router.put("/products/:id/category", async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };
  const { categoryId } = (req.body || {}) as { categoryId?: string | null };
  if (categoryId === undefined) return res.status(400).json({ error: "categoryId required" });

  if (categoryId) {
    const cat = await prisma.category.findUnique({ where: { id: categoryId } });
    if (!cat) return res.status(400).json({ error: `Kategoria o id "${categoryId}" nie istnieje.` });
  }

  const updated = await prisma.product.update({
    where: { id },
    data: { categoryId: categoryId || null },
  });
  res.json({ ok: true, product: updated });
});

export default router;
