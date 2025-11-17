// api/src/routes/publicProducts.ts
import { Router, type Request, type Response } from "express";
import { prisma } from "../lib/prisma";

export const publicProducts: Router = Router();

/**
 * GET /api/public/products/compact?slugs=a,b,c
 * Zwraca minimalny set danych do kart (PLUS warianty i media).
 *
 * Uwaga:
 * - Nie używamy pól, których nie ma w modelu Product (np. image/promo/rating na produkcie).
 * - Ceny i promo wyliczamy na podstawie wariantów (po stronie Node – poza Prisma select),
 *   tak aby frontend miał ewentualnie top-level priceCents/oldPriceCents.
 */
publicProducts.get("/compact", async (req: Request, res: Response) => {
  const raw = String(req.query.slugs || "").trim();
  if (!raw) return res.json({ items: [] });

  const slugs = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!slugs.length) return res.json({ items: [] });

  // Pobierz tylko pola, które na pewno istnieją w Twoim modelu
  const rows = await prisma.product.findMany({
    where: { slug: { in: slugs } },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      brand: true,
      category: true,
      featured: true,
      // brak: image / promo / rating / priceCents na produkcie — to były źródłem błędów TS
      media: {
        select: { url: true, position: true, kind: true },
        orderBy: { position: "asc" },
      },
      variants: {
        select: {
          id: true,
          priceCents: true,
          salePriceCents: true,
          discountActive: true,
          stock: true,
        },
      },
    },
  });

  // Wyliczenia wygodnych pól top-level (po stronie Node, poza Prisma)
  const items = rows.map((p) => {
    // min efektywna i „stara” cena z wariantów
    let minEff: number | null = null;
    let minOld: number | null = null;
    let anyDiscount = false;

    for (const v of p.variants) {
      const base = Number.isFinite(v.priceCents) ? v.priceCents! : null;
      const sale =
        v.discountActive && Number.isFinite(v.salePriceCents)
          ? v.salePriceCents!
          : null;

      const eff = sale ?? base;
      if (eff == null) continue;

      if (minEff == null || eff < minEff) {
        minEff = eff;
        minOld = sale != null && base != null ? base : null;
      }
      if (v.discountActive && sale != null && base != null && sale < base) {
        anyDiscount = true;
      }
    }

    // „promo” można traktować jako alias: czy którykolwiek wariant ma aktywny rabat
    const promo = anyDiscount;

    // ratingu nie mamy w tabeli Product — frontend i tak ma fallback 5,
    // więc nie dokładamy go na siłę (możesz dodać np. rating: 5, jeśli chcesz)
    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      description: p.description ?? "",
      brand: p.brand ?? "",
      category: p.category ?? "",
      featured: !!p.featured,

      // do obrazków frontend i tak bierze media[0].url → absUrl(...)
      media: p.media,

      // warianty są potrzebne do odświeżania stocków i rabatów
      variants: p.variants,

      // wygodne top-level (opcjonalne, ale pomocne dla mapperów na FE)
      priceCents: minEff ?? undefined,
      oldPriceCents: minOld ?? undefined,
      promo, // computed
    };
  });

  res.json({ items });
});

export default publicProducts;
