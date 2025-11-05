// api/src/routes/publicCategories.ts
import { Router } from "express";
import type { Router as ExpressRouter, Request, Response } from "express";
import { prisma } from "../lib/prisma";

// ✅ Jawna adnotacja typu usuwa TS(2742)
const router: ExpressRouter = Router();

/**
 * Publiczne kategorie do FE (sklep)
 * GET /api/categories
 */
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
      showInHero: true, // ⬅️ ważne dla Hero/Chipsów
      _count: { select: { products: true } },
    },
  });
  res.json({ items });
});

export default router;
