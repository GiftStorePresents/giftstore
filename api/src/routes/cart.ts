// src/routes/cart.ts
import { Router, type Request, type Response } from "express";
import { prisma } from "../lib/prisma";
import { calcTotals, FREE_SHIPPING_THRESHOLD_CENTS } from "../lib/totals";

export const cart: Router = Router();

const CART_COOKIE = "cartId";
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 30, // 30 dni
};

// Prosty „sanitizer” dla URL obrazka – unika zwrotu samego /uploads/ bez pliku
function normalizeImage(url?: string | null) {
  if (!url) return "/placeholder.png";
  const trimmed = url.trim();
  if (trimmed === "/uploads" || trimmed === "/uploads/") return "/placeholder.png";
  return trimmed;
}

async function getOrCreateCart(req: Request, res: Response) {
  let cartId = (req.cookies?.[CART_COOKIE] as string | undefined) || undefined;

  // jeśli brak ciasteczka — twórz koszyk i zapisz cookie
  if (!cartId) {
    const created = await prisma.cart.create({ data: {} });
    res.cookie(CART_COOKIE, created.id, COOKIE_OPTS);
    cartId = created.id;
  }

  // wczytaj koszyk z relacjami
  let c = await prisma.cart.findUnique({
    where: { id: cartId },
    include: {
      items: {
        include: {
          Variant: {
            include: {
              Product: {
                include: { media: { orderBy: { position: "asc" } } },
              },
            },
          },
        },
        orderBy: { id: "asc" },
      },
    },
  });

  // jeśli wpis w DB nie istnieje (np. usunięty), utwórz nowy i ustaw cookie
  if (!c) {
    const created = await prisma.cart.create({ data: {} });
    res.cookie(CART_COOKIE, created.id, COOKIE_OPTS);
    c = await prisma.cart.findUnique({
      where: { id: created.id },
      include: {
        items: {
          include: {
            Variant: {
              include: {
                Product: {
                  include: { media: { orderBy: { position: "asc" } } },
                },
              },
            },
          },
          orderBy: { id: "asc" },
        },
      },
    });
  }

  return c; // może być null tylko przy błędzie DB — wyżej od razu tworzymy nowy
}

function shape(cart: any) {
  const { subtotalCents, freeShipping } = calcTotals(cart.items || []);
  return {
    id: cart.id,
    items: (cart.items || []).map((it: any) => {
      const img = normalizeImage(it?.Variant?.Product?.media?.[0]?.url);
      return {
        id: it.id,
        variantId: it.variantId,
        qty: it.qty,
        priceCents: it.Variant?.priceCents ?? 0,
        sku: it.Variant?.sku ?? "",
        color: it.Variant?.color ?? null,
        size: it.Variant?.size ?? null,
        product: {
          id: it.Variant?.productId ?? "",
          name: it.Variant?.Product?.name ?? "",
          slug: it.Variant?.Product?.slug ?? "",
          image: img,
        },
      };
    }),
    subtotalCents,
    freeShipping,
    freeShippingThresholdCents: FREE_SHIPPING_THRESHOLD_CENTS,
  };
}

// GET /api/cart – pobierz bieżący koszyk
cart.get("/", async (req: Request, res: Response) => {
  const c = await getOrCreateCart(req, res);
  if (!c) return res.status(500).json({ error: "Cart unavailable" });
  return res.json(shape(c));
});

// POST /api/cart – dodaj element (variantId, qty)
cart.post("/", async (req: Request, res: Response) => {
  const { variantId, qty = 1 } = (req.body || {}) as { variantId?: string; qty?: number };
  if (!variantId) return res.status(400).json({ error: "variantId required" });

  const c = await getOrCreateCart(req, res);
  if (!c) return res.status(500).json({ error: "Could not create cart" });

  const existing = await prisma.cartItem.findFirst({
    where: { cartId: c.id, variantId },
  });

  if (existing) {
    await prisma.cartItem.update({
      where: { id: existing.id },
      data: { qty: existing.qty + Number(qty) },
    });
  } else {
    await prisma.cartItem.create({
      data: { cartId: c.id, variantId, qty: Number(qty) },
    });
  }

  const fresh = await getOrCreateCart(req, res);
  if (!fresh) return res.status(500).json({ error: "Could not fetch cart" });
  return res.status(201).json(shape(fresh));
});

// PATCH /api/cart – aktualizuj ilość (itemId, qty)
cart.patch("/", async (req: Request, res: Response) => {
  const { itemId, qty } = (req.body || {}) as { itemId?: string; qty?: number };
  if (!itemId || qty === undefined) {
    return res.status(400).json({ error: "itemId and qty required" });
  }

  if (Number(qty) <= 0) {
    await prisma.cartItem.delete({ where: { id: itemId } }).catch(() => {});
  } else {
    await prisma.cartItem.update({
      where: { id: itemId },
      data: { qty: Number(qty) },
    });
  }

  const c = await getOrCreateCart(req, res);
  if (!c) return res.status(404).json({ error: "Cart not found" });
  return res.json(shape(c));
});

// DELETE /api/cart – wyczyść koszyk
cart.delete("/", async (req: Request, res: Response) => {
  const c = await getOrCreateCart(req, res);
  if (!c) return res.status(404).json({ error: "Cart not found" });

  await prisma.cartItem.deleteMany({ where: { cartId: c.id } });

  const fresh = await getOrCreateCart(req, res);
  if (!fresh) return res.status(500).json({ error: "Could not fetch cart" });
  return res.json(shape(fresh));
});
