// api/src/routes/paymentsOther.ts
import { Router, type Request, type Response } from "express";
import { createHmac } from "node:crypto";
import { prisma } from "../lib/prisma";
import { ok, fail } from "../lib/http";

const router: Router = Router();
const APP_URL = process.env.APP_URL || process.env.SITE_URL || "http://localhost:3000";

/* =================================================================================
 * 1) COD — Za pobraniem
 * ================================================================================= */
router.post("/cod/start", async (req: Request, res: Response) => {
  try {
    const orderId = String(req.body?.orderId || "").trim();
    if (!orderId) return fail(res, 400, "orderId is required");

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return fail(res, 404, "Order not found");

    // U Ciebie brak pola paymentProvider → ustawiamy tylko status
    await prisma.order.update({
      where: { id: orderId },
      data: { status: "PENDING_COD" as any },
    });

    const numberOrId = order.number || order.id;
    return ok(res, { redirectUrl: `${APP_URL}/thank-you?orderId=${encodeURIComponent(numberOrId)}` });
  } catch (e: any) {
    console.error("[paymentsOther] cod/start error:", e);
    return fail(res, 500, e?.message || "Failed to start COD");
  }
});

/* =================================================================================
 * 2) CRYPTO — Coinbase Commerce (session + webhook)
 *    (RAW body dla webhooka w server.ts!)
 * ================================================================================= */
let Coinbase: any;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Coinbase = require("coinbase-commerce-node");
  if (process.env.COINBASE_COMMERCE_API_KEY) {
    Coinbase.Client.init(process.env.COINBASE_COMMERCE_API_KEY);
  }
} catch {
  // jeśli brak modułu – zwrócimy 501 w endpointach
}

router.post("/crypto/coinbase/session", async (req: Request, res: Response) => {
  try {
    if (!process.env.COINBASE_COMMERCE_API_KEY || !Coinbase) {
      return fail(res, 501, "Coinbase disabled (missing module or API key)");
    }

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

    const numberOrId = order.number || order.id;
    const { Charge } = Coinbase.resources;

    const charge = await Charge.create({
      name: `Zamówienie ${numberOrId}`,
      description: "Płatność kryptowalutami",
      local_price: { amount: (order.totalCents / 100).toFixed(2), currency: "PLN" },
      pricing_type: "fixed_price",
      metadata: { orderId: order.id, orderNumber: order.number || "" },
      redirect_url: `${APP_URL}/thank-you?orderId=${encodeURIComponent(numberOrId)}`,
      cancel_url: `${APP_URL}/checkout?payment=canceled=1&order=${encodeURIComponent(numberOrId)}`,
    });

    // opcjonalnie: oznacz jako PENDING (czekamy na webhook)
    await prisma.order.update({ where: { id: order.id }, data: { status: "PENDING" as any } });

    return ok(res, { url: (charge as any).hosted_url });
  } catch (e: any) {
    console.error("[paymentsOther] coinbase session error:", e);
    return fail(res, 500, e?.message || "Failed to create crypto session");
  }
});

/** Coinbase webhook – montuj z RAW body w server.ts:
 * app.post("/api/payments/coinbase/webhook", express.raw({ type: "application/json" }), coinbaseWebhook)
 */
export async function coinbaseWebhook(req: Request, res: Response) {
  try {
    if (!Coinbase) return res.status(501).send("Coinbase module missing");

    const sig = req.headers["x-cc-webhook-signature"] as string;
    const secret = process.env.COINBASE_COMMERCE_WEBHOOK_SECRET || "";
    // @ts-ignore req.body jest Buffer (zapewnia express.raw)
    const event = Coinbase.resources.Webhook.verifyEventBody(req.body, sig, secret);

    if (event.type === "charge:confirmed" || event.type === "charge:resolved") {
      const orderId = event?.event?.data?.metadata?.orderId as string | undefined;
      if (orderId) {
        const order = await prisma.order.findUnique({ where: { id: orderId } });
        if (order && !["PAID", "REFUNDED", "CANCELLED"].includes(order.status as any)) {
          await prisma.order.update({ where: { id: orderId }, data: { status: "PAID" as any } });
        }
      }
    }
    res.json({ received: true });
  } catch (err: any) {
    console.error("[Coinbase webhook] error:", err);
    return res.status(400).send("Webhook Error");
  }
}

/* =================================================================================
 * 3) PayU (sandbox gotowy) – OAuth + utworzenie zamówienia + redirect + notify
 * ================================================================================= */
async function getPayUToken() {
  const id = process.env.PAYU_CLIENT_ID;
  const secret = process.env.PAYU_CLIENT_SECRET;
  const authUrl = process.env.PAYU_AUTH_URL || "https://secure.snd.payu.com/pl/standard/user/oauth/authorize";

  const resp = await fetch(authUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: id || "",
      client_secret: secret || "",
    }),
  });
  if (!resp.ok) throw new Error(`PayU OAuth failed: ${resp.status} ${await resp.text()}`);
  const data = (await resp.json()) as { access_token: string };
  return data.access_token;
}

router.post("/payu/session", async (req: Request, res: Response) => {
  try {
    if (!process.env.PAYU_POS_ID || !process.env.PAYU_CLIENT_ID || !process.env.PAYU_CLIENT_SECRET) {
      return fail(res, 501, "PayU disabled (missing credentials)");
    }

    const orderId = String(req.body?.orderId || "").trim();
    if (!orderId) return fail(res, 400, "orderId is required");

    const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true, user: true } });
    if (!order) return fail(res, 404, "Order not found");
    if (!Number.isFinite(order.totalCents) || order.totalCents <= 0) return fail(res, 400, "Order total must be > 0");

    const token = await getPayUToken();

    const numberOrId = order.number || order.id;
    const notifyUrl = `${APP_URL}/api/payments/payu/notify`;
    const continueUrl = `${APP_URL}/thank-you?orderId=${encodeURIComponent(numberOrId)}`;
    const createUrl = process.env.PAYU_ORDERS_URL || "https://secure.snd.payu.com/api/v2_1/orders";

    const payload = {
      notifyUrl,
      continueUrl,
      customerIp: req.ip || "127.0.0.1",
      merchantPosId: process.env.PAYU_POS_ID,
      description: `Zamówienie ${numberOrId}`,
      currencyCode: "PLN",
      totalAmount: String(Math.round(order.totalCents)), // grosze
      buyer: {
        email:
          (order as any).shippingEmail ||
          (order as any).userEmail ||
          order.user?.email ||
          "klient@example.com",
      },
      products: order.items.map((it) => ({
        name: it.name || "Produkt",
        unitPrice: String(Math.round(it.priceCents || 0)),
        quantity: it.qty,
      })),
      extOrderId: numberOrId, // Twoja referencja – użyjemy w notify
    };

    const resp = await fetch(createUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });

    const data = await resp.json();
    if (!resp.ok) throw new Error(`PayU create order failed: ${resp.status} ${JSON.stringify(data)}`);

    const redirectUri = (data as any)?.redirectUri;
    if (!redirectUri) throw new Error("PayU: missing redirectUri");

    await prisma.order.update({ where: { id: order.id }, data: { status: "PENDING" as any } });
    return ok(res, { url: redirectUri });
  } catch (e: any) {
    console.error("[paymentsOther] payu/session error:", e);
    return fail(res, 500, e?.message || "Failed to create PayU order");
  }
});

router.post("/payu/notify", async (req: Request, res: Response) => {
  try {
    // W produkcji: zweryfikuj OpenPayU-Signature
    const status = req.body?.order?.status; // COMPLETED / CANCELED / ...
    const ext = req.body?.order?.extOrderId || req.body?.order?.additionalDescription || req.body?.order?.description;

    if (status === "COMPLETED" && ext) {
      const order =
        (await prisma.order.findFirst({ where: { number: ext } })) ||
        (await prisma.order.findFirst({ where: { id: ext } }));
      if (order && !["PAID", "REFUNDED", "CANCELLED"].includes(order.status as any)) {
        await prisma.order.update({ where: { id: order.id }, data: { status: "PAID" as any } });
      }
    }
    res.send("OK");
  } catch (e: any) {
    console.error("[PayU] notify error:", e);
    res.status(400).send("error");
  }
});

/* =================================================================================
 * 4) AUTOPAY — pełny szkielet (HMAC) + webhook z weryfikacją
 *     Uzupełnij .env i nazwy nagłówków/pól zgodnie z dokumentacją operatora.
 * ================================================================================= */
function hmacSha256Hex(secret: string, payload: string) {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

router.post("/autopay/session", async (req: Request, res: Response) => {
  try {
    const API_URL = process.env.AUTOPAY_API_URL || "";   // np. https://sandbox.autopay.../payments
    const SECRET  = process.env.AUTOPAY_SECRET || "";
    const MERCHANT_ID = process.env.AUTOPAY_MERCHANT_ID || "";
    if (!API_URL || !SECRET || !MERCHANT_ID) return fail(res, 501, "Autopay disabled (missing credentials)");

    const orderId = String(req.body?.orderId || "").trim();
    if (!orderId) return fail(res, 400, "orderId is required");

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return fail(res, 404, "Order not found");
    if (!Number.isFinite(order.totalCents) || order.totalCents <= 0) return fail(res, 400, "Order total must be > 0");

    const numberOrId = order.number || order.id;

    // DOPASUJ payload do specyfikacji Autopay (pola i nazwy 1:1)
    const body = {
      merchantId: MERCHANT_ID,
      orderId: numberOrId,
      amount: (order.totalCents / 100).toFixed(2),
      currency: "PLN",
      description: `Zamówienie ${numberOrId}`,
      successUrl: `${APP_URL}/thank-you?orderId=${encodeURIComponent(numberOrId)}`,
      failureUrl: `${APP_URL}/checkout?payment=canceled=1&order=${encodeURIComponent(numberOrId)}`,
      notifyUrl:  `${APP_URL}/api/payments/autopay/webhook`,
    };

    const payload = JSON.stringify(body);
    const signature = hmacSha256Hex(SECRET, payload); // jeśli operator wymaga base64 – zmień digest

    const resp = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Nazwę nagłówka dopasuj do dokumentacji (np. X-Signature / X-Auth / X-HMAC)
        "X-Signature": signature,
      },
      body: payload,
    });

    const data: any = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(`Autopay error: ${resp.status} ${JSON.stringify(data)}`);

    const redirectUrl = data?.redirectUrl || data?.url;
    if (!redirectUrl) throw new Error("Autopay: missing redirectUrl");

    await prisma.order.update({ where: { id: order.id }, data: { status: "PENDING" as any } });
    return ok(res, { url: redirectUrl });
  } catch (e: any) {
    console.error("[paymentsOther] autopay/session error:", e);
    return fail(res, 500, e?.message || "Failed to create Autopay session");
  }
});

router.post("/autopay/webhook", async (req: Request, res: Response) => {
  try {
    const SECRET = process.env.AUTOPAY_SECRET || "";
    if (!SECRET) return res.status(501).send("Autopay disabled");

    // Jeśli operator wymaga exact raw body – ustaw express.raw w server.ts.
    const raw = JSON.stringify(req.body || {});
    const provided = String(req.headers["x-signature"] || "");
    const expected = hmacSha256Hex(SECRET, raw);

    if (!provided || provided.toLowerCase() !== expected.toLowerCase()) {
      return res.status(400).send("Invalid signature");
    }

    // Zmapuj status → PAID
    const evt = req.body || {};
    const externalOrderId = evt?.orderId || evt?.control || evt?.reference;
    const status = evt?.status; // SUCCESS / FAILURE / ...

    if (status === "SUCCESS" && externalOrderId) {
      const order =
        (await prisma.order.findFirst({ where: { number: externalOrderId } })) ||
        (await prisma.order.findFirst({ where: { id: externalOrderId } }));
      if (order && !["PAID", "REFUNDED", "CANCELLED"].includes(order.status as any)) {
        await prisma.order.update({ where: { id: order.id }, data: { status: "PAID" as any } });
      }
    }
    res.json({ received: true });
  } catch (e: any) {
    console.error("[Autopay webhook] error:", e);
    res.status(400).send("error");
  }
});

/* =================================================================================
 * 5) PayPo — pełny szkielet (HMAC) + webhook z weryfikacją
 *     Uzupełnij .env i nazwy nagłówków/pól zgodnie z dokumentacją operatora.
 * ================================================================================= */
function hmacSha256B64(secret: string, payload: string) {
  return createHmac("sha256", secret).update(payload).digest("base64");
}

router.post("/paypo/session", async (req: Request, res: Response) => {
  try {
    const API_URL = process.env.PAYPO_API_URL || ""; // np. https://sandbox.paypo.../transactions
    const API_KEY = process.env.PAYPO_API_KEY || "";
    const SHOP_ID = process.env.PAYPO_SHOP_ID || "";
    if (!API_URL || !API_KEY || !SHOP_ID) return fail(res, 501, "PayPo disabled (missing credentials)");

    const orderId = String(req.body?.orderId || "").trim();
    if (!orderId) return fail(res, 400, "orderId is required");

    const order = await prisma.order.findUnique({ where: { id: orderId }, include: { user: true } });
    if (!order) return fail(res, 404, "Order not found");
    if (!Number.isFinite(order.totalCents) || order.totalCents <= 0) return fail(res, 400, "Order total must be > 0");

    const numberOrId = order.number || order.id;

    // Payload – dopasuj 1:1 do specyfikacji PayPo
    const body = {
      shopId: SHOP_ID,
      order: {
        reference: numberOrId,
        amount: (order.totalCents / 100).toFixed(2),
        currency: "PLN",
        description: `Zamówienie ${numberOrId}`,
      },
      buyer: {
        email:
          (order as any).shippingEmail ||
          (order as any).userEmail ||
          order.user?.email ||
          "klient@example.com",
      },
      urls: {
        success: `${APP_URL}/thank-you?orderId=${encodeURIComponent(numberOrId)}`,
        cancel:  `${APP_URL}/checkout?payment=canceled=1&order=${encodeURIComponent(numberOrId)}`,
        notify:  `${APP_URL}/api/payments/paypo/webhook`,
      },
    };

    const payload = JSON.stringify(body);
    // Nazwę nagłówka dopasuj do dokumentacji (np. X-Signature). Jeśli wymagają timestampu – dodaj go.
    const signature = hmacSha256B64(API_KEY, payload);

    const resp = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Signature": signature,
      },
      body: payload,
    });

    const data: any = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(`PayPo error: ${resp.status} ${JSON.stringify(data)}`);

    const redirectUrl = data?.redirectUrl || data?.url || data?.approvalUrl;
    if (!redirectUrl) throw new Error("PayPo: missing redirectUrl");

    await prisma.order.update({ where: { id: order.id }, data: { status: "PENDING" as any } });
    return ok(res, { url: redirectUrl });
  } catch (e: any) {
    console.error("[paymentsOther] paypo/session error:", e);
    return fail(res, 500, e?.message || "Failed to start PayPo");
  }
});

router.post("/paypo/webhook", async (req: Request, res: Response) => {
  try {
    const API_KEY = process.env.PAYPO_API_KEY || "";
    if (!API_KEY) return res.status(501).send("PayPo disabled");

    // Jeśli wymagany exact raw body – użyj express.raw w server.ts
    const raw = JSON.stringify(req.body || {});
    const provided = String(req.headers["x-signature"] || "");
    const expected = hmacSha256B64(API_KEY, raw);

    if (!provided || provided !== expected) {
      return res.status(400).send("Invalid signature");
    }

    const status = req.body?.status; // APPROVED / REJECTED / CANCELLED ...
    const ref = req.body?.order?.reference || req.body?.reference;

    if (status === "APPROVED" && ref) {
      const order =
        (await prisma.order.findFirst({ where: { number: ref } })) ||
        (await prisma.order.findFirst({ where: { id: ref } }));
      if (order && !["PAID", "REFUNDED", "CANCELLED"].includes(order.status as any)) {
        await prisma.order.update({ where: { id: order.id }, data: { status: "PAID" as any } });
      }
    }
    res.json({ received: true });
  } catch (e: any) {
    console.error("[PayPo webhook] error:", e);
    res.status(400).send("error");
  }
});

export default router;
