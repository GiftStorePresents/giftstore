import { Router, type Request, type Response } from "express";
import { prisma } from "../lib/prisma";
import { ok, fail } from "../lib/http";
import { sendMail } from "../lib/mailer";
import { subjects, templates } from "../lib/emailTemplates";

const router: Router = Router();

/** Dozwolone statusy zgodne z enumem w schema.prisma */
const ORDER_STATUSES = new Set([
  "PENDING",
  "PAID",
  "PREPARING",
  "PACKING",
  "READY_TO_SHIP",
  "SHIPPED",
  "FULFILLED",
  "CANCELLED",
  "REFUNDED",
] as const);

/** CSV helper */
const csvEscape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

/** GET /api/admin/orders */
router.get("/", async (req: Request, res: Response) => {
  try {
    const q = (req.query.q as string | undefined)?.trim() || "";
    const rawLimit = parseInt((req.query.limit as string | undefined) || "20", 10);
    const take = Math.max(1, Math.min(100, Number.isFinite(rawLimit) ? rawLimit : 20));
    const page = Math.max(1, parseInt((req.query.page as string | undefined) || "1", 10));
    const skip = (page - 1) * take;
    const status = (req.query.status as string | undefined)?.toUpperCase() || "";

    const where: any = {};
    if (status && ORDER_STATUSES.has(status as any)) where.status = status;
    if (q) {
      where.OR = [
        { number: { contains: q, mode: "insensitive" } },
        { id: q },
        { user: { email: { contains: q, mode: "insensitive" } } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.order.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { id: true, email: true, name: true } },
          // lista nie potrzebuje pozycji – lżej
        },
      }),
      prisma.order.count({ where }),
    ]);

    return ok(res, { items, total, page, pages: Math.max(1, Math.ceil(total / take)) });
  } catch (err) {
    console.error("GET /api/admin/orders error:", err);
    return fail(res, 500, "Failed to fetch orders");
  }
});

/**
 * GET /api/admin/orders/export.csv
 * Eksport na POZIOMIE POZYCJI (OrderItem). Do każdej pozycji dokładamy category/slug/brand.
 */
router.get("/export.csv", async (_req: Request, res: Response) => {
  try {
    // 1) zamówienia z pozycjami + user
    const orders = await prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { id: true, email: true, name: true } },
        items: {
          select: {
            name: true,
            sku: true,
            qty: true,
            priceCents: true,
            color: true,
            size: true,
            productId: true,
            variantId: true,
          },
        },
      },
    });

    // 2) unikatowe productId
    const productIds = new Set<string>();
    for (const o of orders) {
      for (const it of o.items) {
        if (it.productId) productIds.add(it.productId);
      }
    }

    // 3) map produkt -> { category, slug, brand }
    const productsMap = new Map<string, { category: string | null; slug: string; brand: string | null }>();
    if (productIds.size > 0) {
      const products = await prisma.product.findMany({
        where: { id: { in: Array.from(productIds) } },
        select: { id: true, category: true, slug: true, brand: true },
      });
      for (const p of products) {
        productsMap.set(p.id, { category: p.category, slug: p.slug, brand: p.brand });
      }
    }

    // 4) CSV
    const header = [
      "orderId",
      "orderNumber",
      "status",
      "createdAt",
      "userId",
      "userEmail",
      "userName",
      "itemName",
      "itemSku",
      "qty",
      "itemPriceCents",
      "itemTotalCents",
      "productId",
      "productSlug",
      "category",
      "brand",
      "color",
      "size",
      "orderTotalCents",
    ];
    const lines: string[] = [header.map(csvEscape).join(",")];

    for (const o of orders) {
      if (o.items.length > 0) {
        for (const it of o.items) {
          const prod = it.productId ? productsMap.get(it.productId) : undefined;
          const row = [
            o.id,
            o.number,
            o.status,
            o.createdAt.toISOString(),
            o.user?.id || "",
            o.user?.email || "",
            o.user?.name || "",
            it.name,
            it.sku ?? "",
            it.qty,
            it.priceCents,
            (it.qty * it.priceCents) | 0,
            it.productId ?? "",
            prod?.slug ?? "",
            prod?.category ?? "",
            prod?.brand ?? "",
            it.color ?? "",
            it.size ?? "",
            o.totalCents,
          ];
          lines.push(row.map(csvEscape).join(","));
        }
      } else {
        const row = [
          o.id, o.number, o.status, o.createdAt.toISOString(),
          o.user?.id || "", o.user?.email || "", o.user?.name || "",
          "", "", 0, 0, 0, "", "", "", "", "", "", o.totalCents,
        ];
        lines.push(row.map(csvEscape).join(","));
      }
    }

    const payload = "\uFEFF" + lines.join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="orders-items.csv"');
    return res.status(200).send(payload);
  } catch (err) {
    console.error("GET /api/admin/orders/export.csv error:", err);
    return fail(res, 500, "Failed to export CSV");
  }
});

/** GET /api/admin/orders/:orderId */
router.get("/:orderId", async (req: Request, res: Response) => {
  try {
    const orderId = (req.params.orderId || "").trim();
    if (!orderId) return fail(res, 400, "orderId is required");

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        user: { select: { id: true, email: true, name: true } },
        items: {
          select: { qty: true, priceCents: true, name: true, sku: true, color: true, size: true },
        },
      },
    });

    if (!order) return fail(res, 404, "Order not found");
    return ok(res, { order });
  } catch (err) {
    console.error("GET /api/admin/orders/:orderId error:", err);
    return fail(res, 500, "Failed to fetch order");
  }
});

/**
 * PATCH /api/admin/orders/:orderId/status
 * Body:
 * {
 *   status: string,
 *   note?: string,
 *   trackingNumber?: string,
 *   carrierName?: string,
 *   trackingUrl?: string,
 *   estDelivery?: string
 * }
 */
router.patch("/:orderId/status", async (req: Request, res: Response) => {
  try {
    const orderId = (req.params.orderId || "").trim();
    if (!orderId) return fail(res, 400, "orderId is required");

    const status = (req.body?.status || "").toString().toUpperCase();
    if (!ORDER_STATUSES.has(status as any)) return fail(res, 400, "Invalid status");

    // opcjonalne pola do e-maili
    const note: string | undefined = req.body?.note || undefined;
    const trackingNumber: string | undefined = req.body?.trackingNumber || undefined;
    const carrierName: string | undefined = req.body?.carrierName || undefined;
    const trackingUrl: string | undefined = req.body?.trackingUrl || undefined;
    const estDelivery: string | undefined = req.body?.estDelivery || undefined;

    // 1) Zmień status
    const updated = await prisma.order.update({
      where: { id: orderId },
      data: { status: status as any },
      include: { user: { select: { id: true, email: true, name: true } } },
    });

    // 2) Wyślij maile, jeżeli włączone
    if (process.env.SEND_STATUS_EMAILS === "1") {
      // pobierz pełne order z pozycjami do templatu
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: { user: true, items: true },
      });

      if (order) {
        const recipient =
          (order as any).shippingEmail ||
          (order as any).userEmail ||
          order.user?.email ||
          "";

        if (recipient) {
          const numberOrId = order.number || order.id;
          const ctaUrl =
            (process.env.APP_URL || process.env.SITE_URL || "http://localhost:5173") +
            `/orders/${encodeURIComponent(numberOrId)}`;

          const orderForTpl = {
            id: order.id,
            number: order.number,
            status,
            items: order.items as any,
            subtotalCents: order.subtotalCents ?? null,
            discountCents: order.discountCents ?? null,
            shippingCents: order.shippingCents ?? null,
            paymentSurchargeCents: order.paymentSurchargeCents ?? null,
            totalCents: order.totalCents,
          };

          if (status === "SHIPPED") {
            // e-mail „wysłane + tracking”
            await sendMail(
              recipient,
              subjects.orderShipped({ order: orderForTpl }),
              templates.orderShipped({
                order: orderForTpl,
                trackingNumber,
                carrierName,
                trackingUrl,
                estDelivery,
                ctaUrl,
              })
            );
          } else {
            // ogólna aktualizacja statusu
            await sendMail(
              recipient,
              subjects.orderStatusUpdate({ order: orderForTpl, status }),
              templates.orderStatusUpdate({
                order: orderForTpl,
                status,
                note,
                ctaUrl,
              })
            );
          }
        }

        // (opcjonalnie) powiadom admina o istotnych statusach
        if (process.env.ADMIN_ORDER_EMAIL && (status === "CANCELLED" || status === "REFUNDED")) {
          await sendMail(
            process.env.ADMIN_ORDER_EMAIL,
            subjects.orderStatusUpdate({ order: order as any, status }),
            templates.orderStatusUpdate({
              order: { id: order.id, number: order.number, status, totalCents: order.totalCents } as any,
              status,
              note,
            })
          );
        }
      }
    }

    return ok(res, { ok: true, order: updated });
  } catch (err) {
    console.error("PATCH /api/admin/orders/:orderId/status error:", err);
    return fail(res, 500, "Failed to update status");
  }
});

export default router;
