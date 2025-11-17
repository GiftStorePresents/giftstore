// api/src/routes/publicInspirations.ts
import { Router, type Request, type Response } from "express";
import { prisma } from "../lib/prisma";

export const publicInspirationsRoutes: ReturnType<typeof Router> = Router();

/* ──────────────────────────────────────────────────────────────
 * Helpers
 * ────────────────────────────────────────────────────────────── */
function toNum(v: unknown, def = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

/** minimalna cena z wariantów lub z pól cenowych na produkcie (kilka nazw) */
function minPriceCents(p: any): number | null {
  const nums: number[] = [];

  // Warianty (pola opcjonalne – jeśli nie istnieją w schemacie, będą undefined,
  // ale nie próbujemy ich pobierać w Prisma "select", więc TS nie protestuje)
  if (Array.isArray(p?.variants)) {
    for (const v of p.variants) {
      if (Number.isFinite(Number(v?.priceCents))) nums.push(Number(v.priceCents));
      else if (Number.isFinite(Number((v as any)?.price))) nums.push(Math.round(Number((v as any).price) * 100));
      else if (Number.isFinite(Number((v as any)?.amount))) nums.push(Math.round(Number((v as any).amount) * 100));
    }
  }

  // Pola bezpośrednio na produkcie (obsługa różnych nazw – jeśli nie istnieją, to po prostu je pomijamy)
  if (Number.isFinite(Number(p?.priceCents))) nums.push(Number(p.priceCents));
  if (Number.isFinite(Number((p as any)?.amountCents))) nums.push(Number((p as any).amountCents));
  if (Number.isFinite(Number((p as any)?.price))) nums.push(Math.round(Number((p as any).price) * 100));
  if (Number.isFinite(Number((p as any)?.amount))) nums.push(Math.round(Number((p as any).amount) * 100));

  if (!nums.length) return null;
  let min = nums[0];
  for (let i = 1; i < nums.length; i++) {
    if (nums[i] < min) min = nums[i];
  }
  return min;
}

/** wybierz główne zdjęcie: pierwsze wg position -> imageUrl -> image -> null */
function mainImage(p: any): string | null {
  const media = Array.isArray(p?.media) ? p.media : [];
  const sorted = [...media].sort(
    (a, b) => (Number(a?.position) || 0) - (Number(b?.position) || 0)
  );
  const first = sorted.find((m) => !!m?.url)?.url;
  return first || p?.imageUrl || (p as any)?.image || null;
}

/** mapowanie rekordu produktu do „karty” po stronie frontu */
function toCard(p: any) {
  const priceC = minPriceCents(p);
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    image: mainImage(p),
    price: priceC !== null ? Math.round(priceC) / 100 : undefined, // zł
    oldPrice: undefined,
    rating: Number((p as any)?.rating ?? 0),
    reviewCount: Number((p as any)?.reviewCount ?? 0),
    isNew: !!(p as any)?.isNew,
    featured: !!(p as any)?.featured,
  };
}

/* ──────────────────────────────────────────────────────────────
 * GET /api/public/inspirations
 *   ?limit=4
 * ────────────────────────────────────────────────────────────── */
publicInspirationsRoutes.get(
  "/public/inspirations",
  async (req: Request, res: Response) => {
    try {
      const limitRaw = (req.query as any)?.limit;
      let take = Number(limitRaw);
      if (!Number.isFinite(take) || take <= 0) take = 4;
      if (take > 50) take = 50;

      const items = await prisma.inspiration.findMany({
        where: { active: true },
        orderBy: { position: "asc" },
        take,
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          imageUrl: true,
          position: true,
        },
      });

      res.setHeader("Cache-Control", "public, max-age=60");
      res.json({ items });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Fetch failed" });
    }
  }
);

/* ──────────────────────────────────────────────────────────────
 * GET /api/public/inspirations/:slug/products
 *   ?skip=0&take=24&q=
 *   Pobiera produkty przez relację M2M z modelu Product.
 *   UPEWNIJ SIĘ: nazwa pola relacyjnego na Product to „inspirations”.
 *   Jeśli u Ciebie nazywa się inaczej (np. "inspirationList"),
 *   zmień to w where → inspirations: { some: { id: insp.id } }.
 * ────────────────────────────────────────────────────────────── */
publicInspirationsRoutes.get(
  "/public/inspirations/:slug/products",
  async (req: Request, res: Response) => {
    try {
      const { slug } = req.params as { slug: string };
      const skip = Math.max(0, toNum(req.query.skip, 0));
      const take = Math.min(200, Math.max(1, toNum(req.query.take, 24)));
      const q = (req.query.q ? String(req.query.q) : "").trim();

      // 1) Znajdź inspirację
      const insp = await prisma.inspiration.findUnique({
        where: { slug: String(slug).toLowerCase() },
        select: { id: true, name: true, active: true },
      });
      if (!insp || insp.active === false) {
        return res.status(404).json({ error: "Inspiration not found" });
      }

      // 2) Produkty przypięte do tej inspiracji — po relacji na Product
      //    ZMIEŃ „inspirations” jeżeli w Twoim schemacie jest inna nazwa pola.
      const where: any = {
        inspirations: { some: { id: insp.id } },
      };
      if (q) {
        where.OR = [
          { name: { contains: q, mode: "insensitive" as const } },
          { slug: { contains: q.toLowerCase(), mode: "insensitive" as const } },
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
              // 🔧 WAŻNE: tylko pola, które NA PEWNO istnieją w modelu Variant
              // (to eliminuje błąd TS2353: 'price' nie istnieje w VariantSelect)
              select: { id: true, priceCents: true, stock: true },
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
      res.setHeader("Cache-Control", "public, max-age=30");
      res.json({ items: mapped, total, skip, take });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Fetch failed" });
    }
  }
);
