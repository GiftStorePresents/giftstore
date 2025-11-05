// api/src/server.ts
import express, { type Request, type Response, type NextFunction, type RequestHandler } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import fs from "fs";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";
import pino from "pino";
import pinoHttp from "pino-http";
import { nanoid } from "nanoid";
import { randomBytes } from "node:crypto";
import { prisma } from "./lib/prisma";
import { env } from "./config/env";
import multer from "multer"; // ⬅️ NEW

// ── Routers (public)
import products from "./routes/products";
import { cart } from "./routes/cart";
import wishlist from "./routes/wishlist";
import coupons from "./routes/coupons";
import blogPublicRouter from "./routes/blog.public";
// ⭐ PUBLIC: categories
import publicCategoriesRouter from "./routes/publicCategories";

// ── Auth
import { auth } from "./routes/auth";
import authGoogle from "./routes/authGoogle";
import authApple from "./routes/authApple";
import authMagic from "./routes/authMagic";
import authEmailChange from "./routes/authEmailChange";
import auth2fa from "./routes/auth2fa";

// OAuth strategies
import "./lib/passport";
import "./lib/passportApple";

// ── Admin
import adminCategories from "./routes/adminCategories";
import admin from "./routes/admin";
import adminUsers from "./routes/adminUsers";
import ordersAdmin from "./routes/adminOrders";
import adminBlog from "./routes/adminBlog";
import adminUpload from "./routes/adminUpload";
import adminCoupons from "./routes/adminCoupons";
import adminSeedRouter from "./routes/admin.seed";
import adminHero from "./routes/adminHero"; // (admin + public)

// ⭐ NEW: Admin Products & Product Media
import adminProducts from "./routes/adminProducts";
import adminProductMedia from "./routes/adminProductMedia";

// ── Orders (public)
import publicOrders from "./routes/publicOrders";
import myOrders from "./routes/myOrders";

// ── Payments (Stripe)
import paymentsStripe, { stripeWebhook } from "./routes/paymentsStripe";

// ── CSRF
import { ensureCsrfCookie, requireCsrf } from "./middleware/csrf";

// ── Sitemaps/robots
import {
  buildSitemapIndex,
  buildUrlset,
  sendXmlCached,
  type SimpleEntry,
  chunk,
} from "./utils/sitemap";
import { getProductRows, getCategoryRows, getArticleRows } from "./services/sitemapData";

// ── NEW: notify
import notifyRouter from "./routes/notify";

// ⭐️ Admin Logs (z katalogu lib)
import adminLogRouter from "./lib/adminLog";

// ───────────────────────────────────────────────────────────────────────────────
// App init
// ───────────────────────────────────────────────────────────────────────────────
const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.set("etag", false);

// ───────────────────────────────────────────────────────────────────────────────
// Security headers (łagodna CSP pod obrazki zewnętrzne)
// ───────────────────────────────────────────────────────────────────────────────
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false,
  })
);

// ✅ ZMIENIONA SEKCJA CSP — dodane domeny InPost/OSM + worker/frame
app.use((req: Request, res: Response, next: NextFunction) => {
  const connectSrc = [
    "'self'",
    "https://geowidget.easypack24.net",
    "https://api-pl-points.easypack24.net",
    "https://nominatim.openstreetmap.org",
    "https://tiles.openstreetmap.org",
  ].join(" ");

  const imgSrc = ["*", "data:", "blob:"].join(" ");

  const csp =
    `connect-src ${connectSrc}; ` +
    `script-src 'self' https://geowidget.easypack24.net https://unpkg.com; ` +
    `style-src 'self' 'unsafe-inline' https://geowidget.easypack24.net https://unpkg.com; ` +
    `img-src ${imgSrc}; ` +
    `worker-src blob:; ` +
    `frame-src https://geowidget.easypack24.net;`;

  res.setHeader("Content-Security-Policy", csp);
  next();
});

// ───────────────────────────────────────────────────────────────────────────────
// CORS
// ───────────────────────────────────────────────────────────────────────────────
const SITE_URL = env.SITE_URL.replace(/\/+$/, "");
const API_URL = (process.env.API_URL || "").replace(/\/+$/, "");

const allowedOrigins = new Set<string>([SITE_URL, API_URL].filter(Boolean));
if (!env.IS_PROD) {
  ["http://localhost:3000", "http://localhost:4000", "http://localhost:5173"].forEach((o) => allowedOrigins.add(o));
}

const corsConfig: cors.CorsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (allowedOrigins.has(origin)) return cb(null, true);
    return cb(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-CSRF-Token", "x-csrf-token", "X-Requested-With", "Stripe-Signature", "x-seo-ping-token"],
};
app.use(cors(corsConfig));
app.options("*", cors(corsConfig));

// ───────────────────────────────────────────────────────────────────────────────
/** Logger */
// ───────────────────────────────────────────────────────────────────────────────
const logger = pino({ level: process.env.LOG_LEVEL || "info" });

app.use(
  pinoHttp({
    logger,
    genReqId: (req) => (req.headers["x-request-id"] as string) || nanoid(10),
    customSuccessMessage(req, res) {
      return `${req.method} ${req.url} ${res.statusCode}`;
    },
    customErrorMessage(_req, res, err) {
      return `ERR ${res.statusCode} - ${err.message}`;
    },
    customLogLevel(_req, res, err) {
      if (err || res.statusCode >= 500) return "error";
      if (res.statusCode >= 400) return "warn";
      return "info";
    },
    serializers: {
      req(req) {
        return { id: (req as any).id, method: req.method, url: req.url };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  })
);

// ───────────────────────────────────────────────────────────────────────────────
// Statics (UPLOADS + PUBLIC)
// ───────────────────────────────────────────────────────────────────────────────
const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

app.use(
  "/uploads",
  (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin as string | undefined;
    if (origin && allowedOrigins.has(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }
    res.setHeader("Cache-Control", "public, max-age=86400, immutable");
    next();
  },
  express.static(uploadsDir)
);

const publicDir = path.join(process.cwd(), "public");
if (fs.existsSync(publicDir)) {
  app.use(
    express.static(publicDir, {
      etag: true,
      maxAge: "1d",
      setHeaders: (res, filePath) => {
        if (filePath.endsWith(".xml")) res.setHeader("Content-Type", "application/xml; charset=utf-8");
        if (filePath.endsWith(".txt")) res.setHeader("Content-Type", "text/plain; charset=utf-8");
        if (filePath.endsWith(".webmanifest")) res.setHeader("Content-Type", "application/manifest+json; charset=utf-8");
      },
    })
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// Anti-cache for /api
// ───────────────────────────────────────────────────────────────────────────────
app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});

// ───────────────────────────────────────────────────────────────────────────────
// Stripe webhook – RAW (musi być PRZED parserami)
// ───────────────────────────────────────────────────────────────────────────────
app.post("/api/payments/stripe/webhook", express.raw({ type: "application/json" }), (req: Request, res: Response) =>
  stripeWebhook(req, res)
);

// ───────────────────────────────────────────────────────────────────────────────
// Parsers + CSRF
// ───────────────────────────────────────────────────────────────────────────────
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(ensureCsrfCookie);

const isPaymentWebhook = (req: Request) => req.path.startsWith("/api/payments/") && /webhook/i.test(req.path);
const isNewsletterSubscribe = (req: Request) => req.path === "/api/newsletter/subscribe";
const isCouponValidate = (req: Request) => req.path === "/api/coupons/validate";
const isOAuthPath = (req: Request) =>
  req.path === "/api/auth/google" ||
  req.path === "/api/auth/google/callback" ||
  req.path === "/api/auth/apple" ||
  req.path === "/api/auth/apple/callback";

const csrfForMutations = (req: Request, res: Response, next: NextFunction) => {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return next();
  if (isPaymentWebhook(req) || isOAuthPath(req) || isNewsletterSubscribe(req) || isCouponValidate(req)) return next();
  const hdr = (req.headers["x-csrf-token"] as string) || (req.headers as any)["X-CSRF-Token"];
  if (!hdr && (req as any).cookies?.csrf) (req.headers as any)["x-csrf-token"] = (req as any).cookies.csrf;
  return requireCsrf(req, res, next);
};
app.use(csrfForMutations);

// ⬇️ NEW: multer config (in-memory, limity)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 5 }, // 10 MB, max 5 plików
});

// ───────────────────────────────────────────────────────────────────────────────
// attachUser (JWT/dev)
// ───────────────────────────────────────────────────────────────────────────────
const JWT_SECRET = env.JWT_SECRET;
function pickToken(req: Request): string | undefined {
  const c = (req as any).cookies || {};
  const cookieToken = c.token || c.jwt || c.auth || c.auth_token || c.access_token || c.id_token || c.USER_ID || undefined;
  const auth = req.headers.authorization;
  const bearer = auth && auth.startsWith("Bearer ") ? auth.slice(7) : undefined;
  const xAuth = (req.headers["x-auth-token"] as string) || (req.headers["x-access-token"] as string);
  return (cookieToken as string) || bearer || xAuth;
}
async function attachUser(req: Request, _res: Response, next: NextFunction) {
  try {
    let userId: string | undefined;
    let role: "USER" | "ADMIN" | undefined;
    let email: string | undefined;

    const token = pickToken(req);
    if (token) {
      try {
        const payload = jwt.verify(token, JWT_SECRET) as any;
        if (payload?.sub) userId = String(payload.sub);
        if (payload?.role) role = payload.role;
        if (payload?.email) email = payload.email;
      } catch {}
    }

    if (!userId) {
      const c = (req as any).cookies || {};
      userId = c.uid || c.userId || c.USER_ID || undefined;
    }

    if (userId && !role) {
      const u = await prisma.user.findUnique({
        where: { id: String(userId) },
        select: { id: true, role: true, email: true },
      });
      if (u) {
        userId = u.id;
        role = u.role as any;
        email ||= u.email || undefined;
      }
    }

    if (userId && role) (req as any).user = { id: userId, role, email };
  } catch {}
  next();
}
app.use(attachUser);

// ───────────────────────────────────────────────────────────────────────────────
// Health
// ───────────────────────────────────────────────────────────────────────────────
app.get("/", (_req: Request, res: Response) => res.send("Giftstore API is running 🚀"));
app.get("/api/health", (_req: Request, res: Response) => res.json({ ok: true }));

// ───────────────────────────────────────────────────────────────────────────────
// robots + sitemaps
// ───────────────────────────────────────────────────────────────────────────────
const SITE_URL_ABS = SITE_URL;

app.get("/robots.txt", (_req: Request, res: Response) => {
  res.type("text/plain");
  res.set("Cache-Control", "public, max-age=3600, s-maxage=3600");
  res.send(`User-agent: *
Allow: /

Sitemap: ${SITE_URL_ABS}/sitemap.xml
`);
});

app.get("/sitemap.xml", async (req: Request, res: Response) => {
  const nowIso = new Date().toISOString();
  const maps = [
    { loc: `${SITE_URL_ABS}/sitemap-products.xml`, lastmod: nowIso },
    { loc: `${SITE_URL_ABS}/sitemap-categories.xml`, lastmod: nowIso },
    { loc: `${SITE_URL_ABS}/sitemap-blog.xml`, lastmod: nowIso },
  ];
  return sendXmlCached(req, res, buildSitemapIndex(maps), 3600);
});

app.get("/sitemap-products.xml", async (req: Request, res: Response) => {
  const rows = await getProductRows(prisma as any, API_URL);
  const urls: SimpleEntry[] = rows.map((r) => ({
    loc: `${SITE_URL_ABS}/product/${r.slug}`,
    ...(r.updatedAt ? { lastmod: new Date(r.updatedAt as any).toISOString() } : {}),
    changefreq: "daily",
    priority: 0.9,
  }));

  if (urls.length > 49000) {
    const parts = chunk(urls);
    const n = Number((req.query?.n as string) || 0) || 0;
    const idx = Math.min(Math.max(n, 0), parts.length - 1);
    return sendXmlCached(req, res, buildUrlset(parts[idx] ?? []), 3600);
  }
  return sendXmlCached(req, res, buildUrlset(urls), 3600);
});

app.get("/sitemap-categories.xml", async (_req: Request, res: Response) => {
  const rows = await getCategoryRows(prisma as any, API_URL);
  const urls: SimpleEntry[] = rows.map((r) => ({
    loc: `${SITE_URL_ABS}/categories/${r.slug}`,
    ...(r.updatedAt ? { lastmod: new Date(r.updatedAt as any).toISOString() } : {}),
    changefreq: "weekly",
    priority: 0.6,
  }));
  return sendXmlCached(_req, res, buildUrlset(urls), 3600);
});

app.get("/sitemap-blog.xml", async (_req: Request, res: Response) => {
  const rows = await getArticleRows(prisma as any, API_URL);
  const urls: SimpleEntry[] = rows.map((r) => ({
    loc: `${SITE_URL_ABS}/blog/${r.slug}`,
    ...(r.updatedAt ? { lastmod: new Date(r.updatedAt as any).toISOString() } : {}),
    changefreq: "weekly",
    priority: 0.7,
  }));
  return sendXmlCached(_req, res, buildUrlset(urls), 3600);
});

// ───────────────────────────────────────────────────────────────────────────────
// Newsletter
// ───────────────────────────────────────────────────────────────────────────────
const newsletterLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

async function makeTransporter() {
  const SMTP_HOST = env.SMTP.HOST;
  const SMTP_PORT = env.SMTP.PORT;
  const SMTP_USER = env.SMTP.USER;
  const SMTP_PASS = env.SMTP.PASS;
  if (!SMTP_HOST) return null;

  const mod: any = await (Function('return import("nodemailer")')() as Promise<any>).catch(() => null);
  if (!mod) return null;
  const nodemailer = mod.default || mod;

  const port = Number(SMTP_PORT || 587);
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: String(port) === "465",
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS || "" } : undefined,
  });
}
function makeToken(n = 24) {
  return randomBytes(n).toString("base64url");
}
function absUrl(pathname: string) {
  const base = (process.env.APP_URL || env.SITE_URL).replace(/\/+$/, "");
  const needsSlash = pathname && !pathname.startsWith("/");
  return `${base}${needsSlash ? "/" : ""}${pathname}`;
}
async function sendConfirmEmail(to: string, confirmToken: string) {
  const transporter = await makeTransporter();
  if (!transporter) throw new Error("SMTP not configured");
  const from = process.env.SMTP_FROM || "Gift Store <no-reply@giftstore.pl>";
  const confirmUrl = absUrl(`/api/newsletter/confirm?token=${encodeURIComponent(confirmToken)}`);
  const html = `
    <div style="font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px">
      <h2>Potwierdź zapis do newslettera Gift Store</h2>
      <p>Kliknij przycisk, aby potwierdzić subskrypcję:</p>
      <p><a href="${confirmUrl}" style="display:inline-block;padding:12px 18px;background:#FFD700;color:#000;text-decoration:none;border-radius:10px;font-weight:600">Potwierdź zapis</a></p>
      <p>Jeśli nie działa, skopiuj link:<br><a href="${confirmUrl}">${confirmUrl}</a></p>
    </div>`;
  await transporter.sendMail({
    from,
    to,
    subject: "Potwierdź zapis do newslettera",
    text: `Potwierdź zapis: ${confirmUrl}`,
    html,
  });
}
async function sendWelcomeEmail(to: string, unsubscribeToken?: string) {
  const transporter = await makeTransporter();
  if (!transporter) return;
  const from = process.env.SMTP_FROM || "Gift Store <no-reply@giftstore.pl>";
  const unsubscribeUrl = unsubscribeToken
    ? absUrl(`/api/newsletter/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`)
    : null;
  const html = `
    <div style="font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;padding:24px;max-width:640px;margin:0 auto">
      <h2 style="margin:0 0 12px">Subskrypcja potwierdzona 🎉</h2>
      <p style="margin:0 0 16px">Dziękujemy za zapis do newslettera Gift Store. Będziemy wysyłać tylko przydatne inspiracje i oferty.</p>
      ${unsubscribeUrl ? `<p style="font-size:12px;color:#666">Możesz zrezygnować: <a href="${unsubscribeUrl}">${unsubscribeUrl}</a></p>` : "" }
    </div>`;
  await transporter.sendMail({
    from,
    to,
    subject: "Subskrypcja potwierdzona – Gift Store",
    text: "Dziękujemy za zapis do newslettera Gift Store." + (unsubscribeUrl ? ` Rezygnacja: ${unsubscribeUrl}` : ""),
    html,
  });
}

app.post("/api/newsletter/subscribe", newsletterLimiter, async (req: Request, res: Response) => {
  const { email } = (req.body || {}) as { email?: string };
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).send("Invalid email");

  const ip =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    "";
  const ua = req.headers["user-agent"] || "";
  const source = req.headers.referer || "";

  const existing = await prisma.newsletterSubscriber.findUnique({ where: { email } }).catch(() => null);
  if (existing && existing.status === "SUBSCRIBED") return res.send({ ok: true, duplicate: true });

  const confirmToken = makeToken();
  const unsubscribeToken = existing?.unsubscribeToken || makeToken();

  if (!existing) {
    await prisma.newsletterSubscriber.create({
      data: {
        email,
        status: "PENDING",
        confirmToken,
        unsubscribeToken,
        ip,
        userAgent: String(ua),
        source: String(source),
      },
    });
  } else {
    await prisma.newsletterSubscriber.update({
      where: { email },
      data: { status: "PENDING", confirmToken, ip, userAgent: String(ua), source: String(source) },
    });
  }

  try {
    await sendConfirmEmail(email, confirmToken);
  } catch {
    return res.status(500).send("SMTP error");
  }

  return res.send({ ok: true, pending: true });
});

app.get("/api/newsletter/confirm", async (req: Request, res: Response) => {
  const { token } = req.query as { token?: string };
  if (!token) return res.status(400).send("Missing token");

  const sub = await prisma.newsletterSubscriber.findFirst({ where: { confirmToken: token } });
  if (!sub) return res.status(404).send("Invalid token");

  await prisma.newsletterSubscriber.update({
    where: { email: sub.email },
    data: { status: "SUBSCRIBED", confirmedAt: new Date(), confirmToken: null },
  });

  sendWelcomeEmail(sub.email, sub.unsubscribeToken || undefined).catch(() => void 0);

  return res.redirect(302, absUrl("/?newsletter=confirmed"));
});

app.get("/api/newsletter/unsubscribe", async (req: Request, res: Response) => {
  const { token } = req.query as { token?: string };
  if (!token) return res.status(400).send("Missing token");

  const sub = await prisma.newsletterSubscriber.findFirst({ where: { unsubscribeToken: token } });
  if (!sub) return res.status(404).send("Invalid token");

  await prisma.newsletterSubscriber.update({
    where: { email: sub.email },
    data: { status: "UNSUBSCRIBED", unsubscribedAt: new Date() },
  });

  return res.redirect(302, absUrl("/?newsletter=unsubscribed"));
});

// ───────────────────────────────────────────────────────────────────────────────
// ⬇️ NEW: Formularz kontaktowy – POST /api/contact
//     (po parsers + CSRF, przed routerami i 404)
// ───────────────────────────────────────────────────────────────────────────────
app.post(
  "/api/contact",
  upload.fields([
    { name: "files[]", maxCount: 5 },
    { name: "files",  maxCount: 5 },
  ]),
  async (req: Request, res: Response) => {
    try {
      const {
        topic = "",
        name = "",
        email = "",
        phone = "",
        message = "",
      } = (req.body || {}) as Record<string, string>;
      const orderNumber = (req.body as any)?.orderNumber || (req.body as any)?.orderId || "";

      if (!topic || !name || !email || !message) {
        return res.status(400).json({ error: "Brak wymaganych pól." });
      }

      // Multer (fields): req.files to mapa nazwa_pola -> tablica plików
      const raw = (req.files as any) || {};
      const filesArr: Express.Multer.File[] = Array.isArray(raw)
        ? raw
        : ([] as Express.Multer.File[])
            .concat(raw["files[]"] || [])
            .concat(raw["files"] || []);

      const attachments = filesArr.map((f) => ({
        filename: f.originalname,
        content: f.buffer,
        contentType: f.mimetype,
      }));

      const transporter = await makeTransporter();
      if (!transporter) return res.status(500).json({ error: "SMTP not configured" });

      const from = process.env.SMTP_FROM || "Gift Store <no-reply@giftstore.pl>";
      const to = process.env.CONTACT_TO || from;

      const subject = `[Kontakt] ${topic} — ${name}${orderNumber ? ` (#${orderNumber})` : ""}`;

      const text =
`Nowe zgłoszenie z formularza kontaktowego:

Temat: ${topic}
Imię i nazwisko: ${name}
E-mail: ${email}
Telefon: ${phone || "-"}
Numer zamówienia: ${orderNumber || "-"}

Wiadomość:
${message}
`;

      const html = `
        <div style="font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;line-height:1.5">
          <h2>Nowe zgłoszenie z formularza kontaktowego</h2>
          <p><b>Temat:</b> ${escapeHtml(topic)}</p>
          <p><b>Imię i nazwisko:</b> ${escapeHtml(name)}</p>
          <p><b>E-mail:</b> ${escapeHtml(email)}</p>
          <p><b>Telefon:</b> ${escapeHtml(phone || "-")}</p>
          <p><b>Numer zamówienia:</b> ${escapeHtml(orderNumber || "-")}</p>
          <p><b>Wiadomość:</b><br/>${nl2br(escapeHtml(message))}</p>
        </div>
      `;

      await transporter.sendMail({
        from,
        to,
        replyTo: email,
        subject,
        text,
        html,
        attachments,
      });

      return res.json({ ok: true });
    } catch (err: any) {
      (req as any).log?.error({ err }, "Contact form send failed");
      return res.status(500).json({ error: err?.message || "Send failed" });
    }
  }
);

function escapeHtml(s: string) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function nl2br(s: string) {
  return String(s).replace(/\n/g, "<br/>");
}

// ───────────────────────────────────────────────────────────────────────────────
// PUBLIC + ADMIN API — KOLEJNOŚĆ
// ───────────────────────────────────────────────────────────────────────────────

// Public coupons
app.use("/api", coupons);

// ⭐ PUBLIC CATEGORIES
app.use("/api", publicCategoriesRouter);

// ADMIN (montujemy PRZED resztą adminów)
app.use("/api/admin", adminCategories);
app.use("/api/admin", adminProducts);       // ⭐ nowy router produktów (admin)
app.use("/api/admin", adminProductMedia);   // ⭐ nowy router mediów produktów (admin)
app.use("/api/admin", admin);
app.use("/api/admin", adminUsers);
app.use("/api/admin/orders", ordersAdmin);
app.use("/api/admin", adminBlog);
app.use("/api/admin", adminUpload);
app.use("/api/admin", adminCoupons);

// ✅ rejestracja routera logów admina
app.use("/api/admin", adminLogRouter);

// HERO router (admin + public: /admin/hero oraz /public/hero)
app.use("/api", adminHero);

// ── NEW: notify (publiczne API do zgłoszeń back-in-stock)
app.use("/api", notifyRouter);

// Guard na SEED (PROD wymaga ADMIN_ALLOW_SEED=1)
const allowSeed: RequestHandler = (req, res, next) => {
  if (env.IS_PROD && process.env.ADMIN_ALLOW_SEED !== "1") {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  next();
};
app.use("/api/admin", allowSeed, adminSeedRouter);

// PUBLIC/SHARED (po adminach)
app.use("/api/products", products);
app.use("/api", products);

app.use("/api/cart", cart);
app.use("/api/wishlist", wishlist);

// Kanoniczny publiczny blog
app.use("/api/blog", blogPublicRouter);
app.use("/api/public/blog", blogPublicRouter); // alias kompatybilności

// Auth
app.use("/api/auth", auth);
app.use("/api/auth", authGoogle);
app.use("/api/auth", authApple);
app.use("/api/auth/magic", authMagic);
app.use("/api/auth", authEmailChange);
app.use("/api/auth", auth2fa);

// Orders
app.use("/api/orders", publicOrders);
app.use("/api/my/orders", myOrders);

// Payments
app.use("/api/payments/stripe", paymentsStripe);

// 404 dla nieznanych /api/*
app.use("/api/*", (_req: Request, res: Response) => res.status(404).json({ error: "Not found" }));

// ───────────────────────────────────────────────────────────────────────────────
// Global error handler
// ───────────────────────────────────────────────────────────────────────────────
app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  if (err?.message?.startsWith?.("CORS")) {
    (req as any).log?.warn({ err }, "CORS error");
    return res.status(403).json({ error: err.message, requestId: (req as any).id });
  }
  if (err?.status === 403 && /csrf/i.test(err?.message || "")) {
    (req as any).log?.warn({ err }, "CSRF error");
    return res.status(403).json({ error: err.message || "CSRF validation failed", requestId: (req as any).id });
  }
  (req as any).log?.error({ err }, "Unhandled error");
  res.status(500).json({ error: "Internal Server Error", requestId: (req as any).id });
});

// ───────────────────────────────────────────────────────────────────────────────
// Server start + smoke-check Hero
// ───────────────────────────────────────────────────────────────────────────────
const port = Number(process.env.PORT || 4000);
app.listen(port, () => {
  logger.info(`API running on http://localhost:${port}`);
  logger.info(`Serving uploads from: ${uploadsDir} -> http://localhost:${port}/uploads/...`);
  logger.info(`APP_URL=${process.env.APP_URL || env.SITE_URL} API_URL=${process.env.API_URL || `http://localhost:${port}`}`);
  // 🔍 Smoke-check hero
  prisma.siteSetting
    .findUnique({ where: { key: "hero" } })
    .then((row) => {
      if (!row) {
        logger.warn("[hero] Hero not configured – pokaż placeholder w panelu admina (np. kafel „Skonfiguruj hero”).");
      } else {
        const enabled = (row.value as any)?.enabled ?? true;
        logger.info(`[hero] found (enabled=${enabled})`);
      }
    })
    .catch((e) => logger.warn({ err: e?.message }, "[hero] smoke-check failed"));
});
