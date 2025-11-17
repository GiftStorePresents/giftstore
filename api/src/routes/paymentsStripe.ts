// src/routes/paymentsStripe.ts
import { Router, type Request, type Response } from "express";
import Stripe from "stripe";
import { prisma } from "../lib/prisma";
import { ok, fail } from "../lib/http";
import { sendMail } from "../lib/mailer";
import { paymentConfirmationEmail } from "../lib/emailTemplates";
import { issueInvoiceAndNotify } from "../services/invoicing";

const router: Router = Router();

// Stripe (wersja przypięta do klucza w panelu)
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");

// Front URL (powrót z Checkout)
const APP_URL =
  process.env.APP_URL || process.env.SITE_URL || "http://localhost:3000";

/**
 * POST /api/payments/stripe/session
 * body: { orderId: string }
 * Tworzy Stripe Checkout Session (karta, BLIK, P24) i zwraca url do przekierowania.
 */
router.post("/session", async (req: Request, res: Response) => {
  try {
    const orderId = String(req.body?.orderId || "").trim();
    if (!orderId) return fail(res, 400, "orderId is required");

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true, user: true },
    });
    if (!order) return fail(res, 404, "Order not found");
    if (!Number.isFinite(order.totalCents) || order.totalCents <= 0) {
      return fail(res, 400, "Order total must be > 0");
    }

    // Pozycje do Stripe – snapshot (wszystko w groszach)
    const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = order.items.map(
      (it) => ({
        quantity: it.qty,
        price_data: {
          currency: "pln",
          unit_amount: Math.round(it.priceCents), // grosze
          product_data: {
            name: it.name || "(produkt)",
            metadata: { sku: it.sku || "", orderId: order.id },
          },
        },
      })
    );

    // Wysyłka jako osobna pozycja (jeśli > 0)
    if (typeof order.shippingCents === "number" && order.shippingCents > 0) {
      line_items.push({
        quantity: 1,
        price_data: {
          currency: "pln",
          unit_amount: Math.round(order.shippingCents),
          product_data: {
            name: "Wysyłka",
            metadata: { sku: "SHIPPING", orderId: order.id },
          },
        },
      });
    }

    // Dopłata do płatności (np. pobranie)
    if (
      typeof order.paymentSurchargeCents === "number" &&
      order.paymentSurchargeCents > 0
    ) {
      line_items.push({
        quantity: 1,
        price_data: {
          currency: "pln",
          unit_amount: Math.round(order.paymentSurchargeCents),
          product_data: {
            name: "Dopłata do płatności",
            metadata: { sku: "PAYMENT_SURCHARGE", orderId: order.id },
          },
        },
      });
    }

    // >>> ZMIANA: kierujemy na /thank-you i /checkout <<<
    const numberOrId = order.number || order.id;
    const successUrl = `${APP_URL}/thank-you?orderId=${encodeURIComponent(
      numberOrId
    )}`;
    const cancelUrl = `${APP_URL}/checkout?payment=canceled=1&order=${encodeURIComponent(
      numberOrId
    )}`;

    const params: Stripe.Checkout.SessionCreateParams = {
      mode: "payment",
      line_items,
      success_url: successUrl,
      cancel_url: cancelUrl,
      payment_method_types: ["card", "blik", "p24"] as any,
      metadata: { orderId: order.id, orderNumber: order.number || "" },
      ...(order.user?.email ? { customer_email: order.user.email } : {}),
      // opcjonalnie: allow_promotion_codes: true,
    };

    const session = await stripe.checkout.sessions.create(params);
    return ok(res, { url: session.url });
  } catch (e: any) {
    console.error("[paymentsStripe] create session error:", e);
    return fail(res, 500, e?.message || "Failed to create Stripe session");
  }
});

/**
 * Webhook handler – montowany w server.ts z RAW body:
 * app.post("/api/payments/stripe/webhook", express.raw({ type: "application/json" }), stripeWebhook)
 */
export async function stripeWebhook(req: Request, res: Response) {
  const sig = req.headers["stripe-signature"] as string;
  const whSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
  let event: Stripe.Event;

  try {
    // @ts-ignore – req.body to Buffer (zapewnia express.raw w server.ts)
    event = stripe.webhooks.constructEvent(req.body, sig, whSecret);
  } catch (err: any) {
    console.error("[Stripe webhook] signature error:", err?.message);
    return res
      .status(400)
      .send(`Webhook Error: ${err?.message || "invalid signature"}`);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const orderId = session.metadata?.orderId;
        if (!orderId) break;

        // Pobierz zamówienie z userem i pozycjami (do maili)
        const order = await prisma.order.findUnique({
          where: { id: orderId },
          include: { user: true, items: true },
        });
        if (!order) break;

        // 1) Ustaw status po płatności – PAID (idempotentnie)
        const target = "PAID" as const;
        if (order.status !== "CANCELLED" && order.status !== "REFUNDED") {
          if (order.status !== target) {
            await prisma.order.update({
              where: { id: orderId },
              data: { status: target as any },
            });
          }
        }

        // 1a) (opcjonalnie) rejestracja użycia kuponu, z idempotencją
        try {
          if (order.couponCode) {
            const coupon = await prisma.coupon.findUnique({
              where: { code: order.couponCode },
              select: { id: true },
            });

            if (coupon) {
              const already = await prisma.couponRedemption.findFirst({
                where: { couponId: coupon.id, orderId: order.id },
                select: { id: true },
              });

              if (!already) {
                await prisma.$transaction([
                  prisma.coupon.update({
                    where: { id: coupon.id },
                    data: { usedCount: { increment: 1 } },
                  }),
                  prisma.couponRedemption.create({
                    data: {
                      couponId: coupon.id,
                      orderId: order.id,
                      userId: order.userId ?? null,
                    },
                  }),
                ]);
              }
            }
          }
        } catch (cErr: any) {
          console.warn(
            "[Stripe webhook] coupon register error:",
            cErr?.message || cErr
          );
        }

        // 2) MAIL do klienta: potwierdzenie płatności
        try {
          const numberOrId = order.number || order.id;

          const orderForTpl = {
            id: order.id,
            number: order.number,
            status: target,
            items: order.items as any,
            subtotalCents: order.subtotalCents ?? null,
            discountCents: order.discountCents ?? null,
            shippingCents: order.shippingCents ?? null,
            paymentSurchargeCents: order.paymentSurchargeCents ?? null,
            totalCents: order.totalCents,
          };

          const ctaUrl = `${APP_URL}/orders/${encodeURIComponent(numberOrId)}`;
          const recipient =
            (order as any).shippingEmail ||
            (order as any).userEmail ||
            order.user?.email ||
            "";

          if (recipient) {
            const htmlClient = paymentConfirmationEmail({
              order: orderForTpl,
              customerName: (order.user as any)?.name || undefined,
              ctaUrl,
              footerNote: process.env.BRAND_FOOTER_NOTE || undefined,
            });
            await sendMail(
              recipient,
              `Płatność przyjęta: ${numberOrId}`,
              htmlClient
            );
          }
        } catch (mailErr: any) {
          console.warn(
            "[Stripe webhook] mail error:",
            mailErr?.message || mailErr
          );
        }

        // 3) FAKTURA: centralny serwis (wystawi i – jeśli włączone – wyśle e-mail z linkiem)
        try {
          await issueInvoiceAndNotify(orderId);
        } catch (invErr: any) {
          console.warn(
            "[Stripe webhook] invoice error:",
            invErr?.message || invErr
          );
        }

        break;
      }

      default:
        // inne eventy pomijamy
        break;
    }

    res.json({ received: true });
  } catch (err: any) {
    console.error("[Stripe webhook] handler error:", err);
    return res.status(500).send("Webhook handler failed");
  }
}

export default router;
