// src/routes/wishlist.ts
import { Router, type Request, type Response } from "express";
import { prisma } from "../lib/prisma";
import { z } from "zod";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth";

export const wishlist: Router = Router();

// Walidacje Zod
const addSchema = z.object({
  productId: z.string().min(1, "productId is required"),
});

const moveSchema = z.object({
  productId: z.string().min(1, "productId is required"),
  variantId: z.string().optional(),
  qty: z.number().int().min(1).max(99).optional().default(1),
});

// GET /api/wishlist
wishlist.get("/", requireAuth, async (req: Request, res: Response) => {
  // UWAGA: userId jest gwarantowane przez requireAuth -> oznaczamy jako string
  const userId: string = (req as AuthedRequest).userId!;

  // upewnij się, że user ma wishlistę (tworzymy leniwie)
  let wl = await prisma.wishlist.findFirst({ where: { userId } });
  if (!wl) {
    wl = await prisma.wishlist.create({ data: { userId } });
  }

  const items = await prisma.wishlistItem.findMany({
    where: { wishlistId: wl.id },
    include: {
      product: {
        include: {
          media: true,
          variants: true,
        },
      },
    },
    orderBy: { id: "desc" },
  });

  res.json({ items });
});

// POST /api/wishlist  { productId }
wishlist.post("/", requireAuth, async (req: Request, res: Response) => {
  const userId: string = (req as AuthedRequest).userId!;

  const parsed = addSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: parsed.error.errors[0]?.message || "Bad request" });
  }
  const productId: string = parsed.data.productId;

  // walidacja produktu
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) return res.status(404).json({ error: "Product not found" });

  // znajdź/utwórz wishlistę usera
  let wl = await prisma.wishlist.findFirst({ where: { userId } });
  if (!wl) wl = await prisma.wishlist.create({ data: { userId } });

  // czy już istnieje?
  const exists = await prisma.wishlistItem.findFirst({
    where: { wishlistId: wl.id, productId },
  });
  if (exists) {
    return res.json({ ok: true, message: "Already on wishlist" });
  }

  await prisma.wishlistItem.create({
    data: { wishlistId: wl.id, productId },
  });

  res.status(201).json({ ok: true });
});

// DELETE /api/wishlist/:productId
wishlist.delete("/:productId", requireAuth, async (req: Request, res: Response) => {
  const userId: string = (req as AuthedRequest).userId!;
  const { productId } = req.params as { productId: string };

  const wl = await prisma.wishlist.findFirst({ where: { userId } });
  if (!wl) return res.json({ ok: true });

  await prisma.wishlistItem.deleteMany({
    where: { wishlistId: wl.id, productId },
  });

  res.json({ ok: true });
});

// POST /api/wishlist/move-to-cart  { productId, variantId?, qty? }
wishlist.post("/move-to-cart", requireAuth, async (req: Request, res: Response) => {
  const userId: string = (req as AuthedRequest).userId!;

  const parsed = moveSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: parsed.error.errors[0]?.message || "Bad request" });
  }
  const { productId, variantId, qty } = parsed.data;

  // 1) upewnij się, że produkt istnieje
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { variants: true },
  });
  if (!product) return res.status(404).json({ error: "Product not found" });

  // 2) wybierz wariant
  const chosenVariantId =
    variantId || product.variants.find((v) => v.stock > 0)?.id;
  if (!chosenVariantId) {
    return res.status(400).json({ error: "No variant in stock" });
  }

  // 3) znajdź/utwórz koszyk usera
  let cart = await prisma.cart.findFirst({ where: { userId } });
  if (!cart) cart = await prisma.cart.create({ data: { userId } });

  // 4) dodaj/inkrementuj pozycję w koszyku
  const existingItem = await prisma.cartItem.findFirst({
    where: { cartId: cart.id, variantId: chosenVariantId },
  });

  if (existingItem) {
    await prisma.cartItem.update({
      where: { id: existingItem.id },
      data: { qty: existingItem.qty + (qty ?? 1) },
    });
  } else {
    await prisma.cartItem.create({
      data: { cartId: cart.id, variantId: chosenVariantId, qty: qty ?? 1 },
    });
  }

  // 5) usuń z wishlisty
  const wl = await prisma.wishlist.findFirst({ where: { userId } });
  if (wl) {
    await prisma.wishlistItem.deleteMany({
      where: { wishlistId: wl.id, productId },
    });
  }

  res.json({ ok: true });
});

export default wishlist;
