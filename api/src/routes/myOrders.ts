// src/routes/myOrders.ts
import { Router, type Request, type Response, type NextFunction } from "express";
import * as path from "node:path";
import * as fs from "node:fs";
import { prisma } from "../lib/prisma";
import { ok, fail } from "../lib/http";

const router: Router = Router();

/** Proste wymaganie zalogowania — globalny middleware w server.ts wstawia (req as any).user */
function requireAuth(req: Request, res: Response, next: NextFunction) {
  const u = (req as any)?.user;
  if (!u?.id) return fail(res, 401, "Unauthorized");
  return next();
}

/**
 * GET /api/my/orders
 * Lista zamówień zalogowanego użytkownika (z podstawowymi polami).
 */
router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id as string;

    const items = await prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        number: true,
        status: true,
        totalCents: true,
        createdAt: true,
        invoiceIssuedAt: true,
        invoiceNumber: true,
      },
    });

    return ok(res, { items });
  } catch (e: any) {
    console.error("GET /api/my/orders error:", e?.message || e);
    return fail(res, 500, "Failed to fetch orders");
  }
});

/**
 * GET /api/my/orders/:idOrNumber
 * Szczegóły zamówienia zalogowanego użytkownika.
 * Front oczekuje: items[].{ name, sku, qty, priceCents } (snapshoty).
 */
router.get("/:idOrNumber", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id as string;
    const idOrNumber = (req.params.idOrNumber || "").trim();
    if (!idOrNumber) return fail(res, 400, "Order id/number is required");

    const order = await prisma.order.findFirst({
      where: {
        AND: [
          { userId },
          { OR: [{ id: idOrNumber }, { number: idOrNumber }] },
        ],
      },
      select: {
        id: true,
        number: true,
        status: true,
        createdAt: true,
        totalCents: true,
        subtotalCents: true,
        discountCents: true,
        shippingCents: true,
        paymentSurchargeCents: true,

        // Faktura (do pokazywania przycisku PDF)
        invoiceIssuedAt: true,
        invoiceNumber: true,

        // KLUCZOWE: snapshot pozycji, które UI renderuje w tabeli
        items: {
          select: {
            name: true,        // snapshot nazwy produktu (string | null)
            sku: true,         // snapshot SKU (string | null)
            qty: true,         // liczba sztuk (int)
            priceCents: true,  // cena jednostkowa w groszach (int)
            // opcjonalnie, jeśli trzymasz:
            // color: true,
            // size: true,
          },
        },
      },
    });

    if (!order) return fail(res, 404, "Order not found");
    return ok(res, { order });
  } catch (e: any) {
    console.error("GET /api/my/orders/:idOrNumber error:", e?.message || e);
    return fail(res, 500, "Failed to fetch order");
  }
});

/**
 * GET /api/my/orders/:idOrNumber/invoice.pdf
 * Zalogowany użytkownik pobiera swoją fakturę PDF (jeśli wystawiona).
 * Plik jest trzymany pod <CWD>/storage/<invoicePdfPath>.
 */
router.get("/:idOrNumber/invoice.pdf", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id as string;
    const idOrNumber = (req.params.idOrNumber || "").trim();
    if (!idOrNumber) return fail(res, 400, "Order id/number is required");

    const order = await prisma.order.findFirst({
      where: {
        AND: [
          { userId },
          { OR: [{ id: idOrNumber }, { number: idOrNumber }] },
        ],
      },
      select: {
        id: true,
        number: true,
        invoiceIssuedAt: true,
        invoicePdfPath: true,
      },
    });

    if (!order) return fail(res, 404, "Order not found");
    if (!order.invoiceIssuedAt || !order.invoicePdfPath) {
      return fail(res, 404, "Invoice not found");
    }

    // Ścieżka do pliku: bezpiecznie w katalogu /storage
    const storageRoot = path.resolve(process.cwd(), "storage");
    const abs = path.resolve(storageRoot, order.invoicePdfPath);

    // Zabezpieczenie przed path traversal
    if (!abs.startsWith(storageRoot)) {
      console.warn("Invoice path traversal attempt:", { abs, storageRoot });
      return fail(res, 400, "Invalid invoice path");
    }
    if (!fs.existsSync(abs)) {
      console.warn("Invoice file missing on disk:", abs);
      return fail(res, 404, "Invoice file missing");
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${(order.number || order.id)}.pdf"`
    );
    res.setHeader("Cache-Control", "private, max-age=0, must-revalidate");

    const stream = fs.createReadStream(abs);
    stream.on("error", (err) => {
      console.error("Invoice stream error:", err);
      if (!res.headersSent) {
        return fail(res, 500, "Failed to serve invoice");
      }
    });
    stream.pipe(res);
  } catch (e: any) {
    console.error("GET /api/my/orders/:idOrNumber/invoice.pdf error:", e?.message || e);
    return fail(res, 500, "Failed to serve invoice");
  }
});

export default router;
