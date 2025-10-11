// src/routes/adminOrders.ts
import { Router, type Request, type Response, type NextFunction } from "express";
import { prisma } from "../lib/prisma";
import { ok, fail } from "../lib/http";
import { issueInvoiceAndNotify } from "../services/invoicing";
import { sendMail } from "../lib/mailer";
import { subjects, templates } from "../lib/emailTemplates";

const router: Router = Router();

/** (opcjonalnie) autoryzacja admina */
function requireAdmin(_req: Request, _res: Response, next: NextFunction) {
  // TODO: podłącz realne sprawdzanie uprawnień (JWT/rola).
  return next();
}

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
]);

/**
 * GET /api/admin/orders
 * Query:
 *  - q: string
 *  - status: PENDING|PAID|...
 *  - page: number
 *  - limit: number (1..100, domyślnie 20)
 */
router.get("/", requireAdmin, async (req: Request, res: Response) => {
  const q = (req.query.q as string | undefined)?.trim() || "";
  const rawLimit = parseInt((req.query.limit as string | undefined) || "20", 10);
  const take = Math.max(1, Math.min(100, Number.isFinite(rawLimit) ? rawLimit : 20));
  const page = Math.max(1, parseInt((req.query.page as string | undefined) || "1", 10));
  const skip = (page - 1) * take;

  const status = (req.query.status as string | undefined)?.toUpperCase() || "";
  const where: any = {};
  if (status && ORDER_STATUSES.has(status)) where.status = status;

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
      include: { user: { select: { id: true, email: true, name: true } } },
    }),
    prisma.order.count({ where }),
  ]);

  return ok(res, { items, total, page, pages: Math.max(1, Math.ceil(total / take)) });
});

/** export.csv – musi być przed trasą z parametrem */
router.get("/export.csv", requireAdmin, async (_req: Request, res: Response) => {
  const orders = await prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    include: { user: { select: { email: true } } },
  });

  const header = ["id", "number", "status", "totalCents", "userEmail", "createdAt"];
  const lines = [header.join(",")];

  for (const o of orders) {
    const row = [
      o.id,
      o.number,
      o.status,
      o.totalCents.toString(),
      o.user?.email || "",
      o.createdAt.toISOString(),
    ];
    lines.push(row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
  }

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="orders.csv"`);
  return res.status(200).send(lines.join("\n"));
});

/**
 * GET /api/admin/orders/:idOrNumber
 * Zwraca szczegóły + pozycje snapshot (posortowane po id pozycji).
 */
router.get("/:idOrNumber", requireAdmin, async (req: Request, res: Response) => {
  const idOrNumber = (req.params.idOrNumber || "").trim();
  if (!idOrNumber) return fail(res, 400, "order id/number is required");

  const order = await prisma.order.findFirst({
    where: { OR: [{ id: idOrNumber }, { number: idOrNumber }] },
    select: {
      id: true,
      number: true,
      status: true,
      createdAt: true,

      user: { select: { id: true, email: true, name: true } },

      shippingName: true,
      shippingAddr1: true,
      shippingCity: true,
      shippingZip: true,
      shippingCountry: true,
      shippingEmail: true,

      subtotalCents: true,
      discountCents: true,
      shippingCents: true,
      paymentSurchargeCents: true,
      totalCents: true,

      invoiceRequested: true,
      invoiceNumber: true,
      invoiceIssuedAt: true,

      items: {
        select: {
          id: true, // stabilne sortowanie i debug
          name: true,
          category: true,
          sku: true,
          qty: true,
          priceCents: true,
        },
        orderBy: { id: "asc" },
      },
    },
  });

  if (!order) return fail(res, 404, "Order not found");
  return ok(res, { order });
});

/**
 * PATCH /api/admin/orders/:idOrNumber/status
 * Zmienia status, wysyła mail statusowy (jeśli SEND_STATUS_EMAILS=1),
 * a przy PAID/PREPARING dodatkowo wystawia fakturę i wysyła „Faktura gotowa”.
 */
router.patch("/:idOrNumber/status", requireAdmin, async (req: Request, res: Response) => {
  const idOrNumber = (req.params.idOrNumber || "").trim();
  if (!idOrNumber) return fail(res, 400, "order id/number is required");

  const nextStatus = (req.body?.status || "").toString().toUpperCase();
  const note = (req.body?.note || "").toString();
  if (!ORDER_STATUSES.has(nextStatus)) return fail(res, 400, "Invalid status");

  const before = await prisma.order.findFirst({
    where: { OR: [{ id: idOrNumber }, { number: idOrNumber }] },
    include: { user: true, items: true },
  });
  if (!before) return fail(res, 404, "Order not found");

  const updated = await prisma.order.update({
    where: { id: before.id },
    data: { status: nextStatus as any },
    include: { user: true },
  });

  // ── 1) Mail statusowy ──────────────────────────────────────────────
  try {
    if (process.env.SEND_STATUS_EMAILS === "1") {
      const recipient =
        (before as any).shippingEmail ||
        (before as any).userEmail ||
        before.user?.email ||
        "";

      if (recipient) {
        const siteUrl =
          process.env.APP_URL || process.env.SITE_URL || "http://localhost:3000";
        const ctaUrl = `${siteUrl}/orders/${encodeURIComponent(updated.number || updated.id)}`;

        const orderForTpl = {
          id: before.id,
          number: before.number,
          status: nextStatus,
          items: before.items as any,
          subtotalCents: before.subtotalCents ?? null,
          discountCents: before.discountCents ?? null,
          shippingCents: before.shippingCents ?? null,
          paymentSurchargeCents: before.paymentSurchargeCents ?? null,
          totalCents: before.totalCents,
        };

        await sendMail(
          recipient,
          subjects.orderStatusUpdate({ order: orderForTpl, status: nextStatus }),
          templates.orderStatusUpdate({ order: orderForTpl, status: nextStatus, ctaUrl, note })
        );

        // (Domyślnie wyłączone) e-mail do admina — tylko jeśli włączysz SEND_ADMIN_EMAILS=1
        if (process.env.SEND_ADMIN_EMAILS === "1" && process.env.ADMIN_ORDER_EMAIL) {
          await sendMail(
            process.env.ADMIN_ORDER_EMAIL,
            `Status ${nextStatus}: ${updated.number || updated.id}`,
            `Zmieniono status na ${nextStatus}`
          );
        }

        console.log("[adminOrders] status mail sent to:", recipient, "status:", nextStatus);
      } else {
        console.log("[adminOrders] no recipient for status mail.");
      }
    } else {
      console.log("[adminOrders] SEND_STATUS_EMAILS != 1 → skipping status mail.");
    }
  } catch (e: any) {
    console.warn("[adminOrders] status mail failed:", e?.message || e);
  }

  // ── 2) Faktura przy PAID/PREPARING ─────────────────────────────────
  try {
    if (nextStatus === "PAID" || nextStatus === "PREPARING") {
      const inv = await issueInvoiceAndNotify(updated.id);
      console.log(
        "[adminOrders] invoice check -> requested:",
        (inv as any)?.invoiceRequested,
        "issuedAt:",
        (inv as any)?.invoiceIssuedAt,
        "pdf:",
        (inv as any)?.invoicePdfPath
      );
    }
  } catch (e: any) {
    console.warn("[adminOrders] invoice issue/send failed:", e?.message || e);
  }

  return ok(res, {
    order: {
      id: updated.id,
      number: updated.number,
      status: updated.status,
      invoiceIssuedAt: updated.invoiceIssuedAt,
      invoiceNumber: updated.invoiceNumber,
    },
  });
});

export default router;
