// gifstore-api/src/routes/products.ts
import { Router, type Request, type Response } from "express";
import { prisma } from "../lib/prisma";

export const products: Router = Router();

/**
 * GET /api/products
 * Query:
 *  - q: string (fulltext w name/description/slug)
 *  - category: string (slug kategorii: np. 'dla-niej', 'na-urodziny' itd.)
 *  - page: number (1..n)
 *  - take / limit: number (ile na stronę; preferowane "limit")
 *  - featured: "true" | "false"
 *  - withDeleted: "true" => pokaż soft-deleted
 */
products.get("/", async (req: Request, res: Response) => {
  const q = (req.query.q as string | undefined)?.trim() || "";
  const category = (req.query.category as string | undefined)?.trim() || "";

  const limitParam =
    (req.query.limit as string | undefined) ??
    (req.query.take as string | undefined);
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
  if (category) where.category = category;

  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: "desc" },
      include: {
        media: { orderBy: { position: "asc" } },       // 1sze zdjęcie = miniatura
        variants: { orderBy: { priceCents: "asc" } },  // najtańszy wariant jako pierwszy
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
});

/**
 * GET /api/products/popular
 * (alias listy z featured=true)
 */
products.get("/popular", async (req: Request, res: Response) => {
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
      media: { select: { url: true }, orderBy: { position: "asc" }, take: 1 },
      variants: { select: { priceCents: true }, orderBy: { priceCents: "asc" }, take: 1 },
    },
  });

  res.json({ items });
});

/**
 * GET /api/products/by-slug/:slug
 * 👉 ALIAS dla kompatybilności z frontendami, które używały „by-slug”.
 * Zwraca to samo co /:slug (tj. surowy obiekt produktu).
 * Uwaga: ta trasa MUSI być przed '/:slug'.
 */
products.get("/by-slug/:slug", async (req: Request, res: Response) => {
  const slug = req.params.slug?.trim();
  if (!slug) return res.status(400).json({ error: "Slug is required" });

  const product = await prisma.product.findUnique({
    where: { slug },
    include: {
      media: { orderBy: { position: "asc" } },
      variants: { orderBy: { priceCents: "asc" } },
    },
  });

  if (!product || product.deletedAt) return res.status(404).send("Not Found");
  // Zachowujemy dotychczasowy kształt odpowiedzi: zwracamy surowy obiekt
  res.json(product);
});

/**
 * GET /api/products/:slug
 * (główna trasa pobierania produktu)
 */
products.get("/:slug", async (req: Request, res: Response) => {
  const slug = req.params.slug?.trim();
  if (!slug) return res.status(400).json({ error: "Slug is required" });

  const product = await prisma.product.findUnique({
    where: { slug },
    include: {
      media: { orderBy: { position: "asc" } },
      variants: { orderBy: { priceCents: "asc" } },
    },
  });

  if (!product || product.deletedAt) return res.status(404).send("Not Found");
  // Tu również zwracamy surowy obiekt (spójnie z aliasem i Twoim aktualnym frontendem)
  res.json(product);
});

export default products;
