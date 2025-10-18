// api/src/server.ts
import express, { type Request, type Response, type NextFunction } from "express";
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
import cron from "node-cron";
import { prisma } from "./lib/prisma";

// --- Konfiguracja środowiska (nasza warstwa) ---
import { env } from "./config/env";

// -------- Routers (public) --------
import { products } from "./routes/products";
import { cart } from "./routes/cart";
import wishlist from "./routes/wishlist";
import coupons from "./routes/coupons"; // POST /api/coupons/validate
import blog from "./routes/blog";

// -------- Auth --------
import { auth } from "./routes/auth";
// ❌ usunięto: import authGoogle from "./routes/authGoogle";
// ❌ usunięto: import authApple from "./routes/authApple";
import authMagic from "./routes/authMagic";
import authEmailChange from "./routes/authEmailChange";
import auth2fa from "./routes/auth2fa";

// -------- Admin --------
import admin from "./routes/admin";
import adminUsers from "./routes/adminUsers";
import adminProducts from "./routes/adminProducts";
import adminProductMedia from "./routes/adminProductMedia";
import adminSeed from "./routes/admin.seed";
import adminProductsMaintenance from "./routes/adminProductsMaintenance";
import ordersAdmin from "./routes/adminOrders"; // /api/admin/orders
import adminBlog from "./routes/adminBlog";
import adminUpload from "./routes/adminUpload";
import adminCoupons from "./routes/adminCoupons";

// -------- Public checkout --------
import publicOrders from "./routes/publicOrders"; // /api/orders
import myOrders from "./routes/myOrders";

// -------- Payments (Stripe) --------
import paymentsStripe, { stripeWebhook } from "./routes/paymentsStripe";

import { ensureCsrfCookie, requireCsrf } from "./middleware/csrf";

// -------- Sitemaps/robots helpers --------
import {
  buildSitemapIndex,
  buildUrlset,
  sendXmlCached, // ETag + Cache-Control + 304
  type SimpleEntry,
  chunk,
} from "./utils/sitemap";
import { getProductRows, getCategoryRows, getArticleRows } from "./services/sitemapData";

// -------- Coupons auto-import helpers --------
import { readPrismaSeedFile, parseSeedCoupons } from "./utils/seedCoupons";
import { ensureCoupon } from "./utils/ensureCoupon";

// ---------------------------------------------------------------------
// Inicjalizacja aplikacji
// ---------------------------------------------------------------------
const app = express();

// ufamy proxy (X-Forwarded-*) – potrzebne do poprawnego IP/CORS za reverse proxy
app.set("trust proxy", 1);
app.set("etag", false);

// ---------------------------------------------------------------------
// Security headers
// ---------------------------------------------------------------------
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    // CSP ustawiamy niżej ręcznie nagłówkiem
    contentSecurityPolicy: false,
  })
);

// --- Content-Security-Policy (kontrola ręczna) ---
app.use((req, res, next) => {
  const connectSrc = [
    "'self'",
    env.IS_PROD ? null : "ws:", // Vite HMR w dev
    "https://geowidget.easypack24.net",
    "https://nominatim.openstreetmap.org",
  ]
    .filter(Boolean)
    .join(" ");

  const csp =
    `connect-src ${connectSrc}; ` +
    `script-src 'self' https://geowidget.easypack24.net https://unpkg.com; ` +
    `style-src 'self' 'unsafe-inline' https://geowidget.easypack24.net https://unpkg.com; ` +
    `img-src * data:`;

  res.setHeader("Content-Security-Policy", csp);
  next();
});

// ---------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------
const allowedOrigins = new Set<string>([
  env.SITE_URL.replace(/\/+$/, ""),
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
]);

const corsConfig: cors.CorsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-CSRF-Token",
    "x-csrf-token",
    "X-Requested-With",
    "Stripe-Signature",
    "x-seo-ping-token",
    "X-Dev-User-Id",
    "X-Dev-Admin",
  ],
};
app.use(cors(corsConfig));
app.options("*", cors(corsConfig));

// ---------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------
const logger =
  env.IS_PROD
    ? pino({ level: process.env.LOG_LEVEL || "info" })
    : pino({
        level: process.env.LOG_LEVEL || "info",
        transport: { target: "pino-pretty", options: { translateTime: "SYS:standard" } },
      });

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

// ---------------------------------------------------------------------
// Statyki /uploads i /public
// ---------------------------------------------------------------------
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
        if (filePath.endsWith(".webmanifest"))
          res.setHeader("Content-Type", "application/manifest+json; charset=utf-8");
      },
    })
  );
}

// ---------------------------------------------------------------------
// Anti-cache dla /api
// ---------------------------------------------------------------------
app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});

// ---------------------------------------------------------------------
// Stripe webhook: RAW body, zanim json parsers
// ---------------------------------------------------------------------
app.post(
  "/api/payments/stripe/webhook",
  express.raw({ type: "application/json" }),
  (req: Request, res: Response) => stripeWebhook(req, res)
);

// ---------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ---------------------------------------------------------------------
// CSRF (cookie + validation)
// ---------------------------------------------------------------------
app.use(ensureCsrfCookie);

const isPaymentWebhook = (req: Request) =>
  req.path.startsWith("/api/payments/") && /webhook/i.test(req.path);
const isNewsletterSubscribe = (req: Request) => req.path === "/api/newsletter/subscribe";
const isCouponValidate = (req: Request) => req.path === "/api/coupons/validate";

const csrfForMutations = (req: Request, res: Response, next: NextFunction) => {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return next();
  if (isPaymentWebhook(req) || req.path === "/admin/seo/ping" || isNewsletterSubscribe(req) || isCouponValidate(req)) {
    return next();
  }

  const hdr = (req.headers["x-csrf-token"] as string) || (req.headers as any)["X-CSRF-Token"];
  if (!hdr && (req as any).cookies?.csrf) {
    (req.headers as any)["x-csrf-token"] = (req as any).cookies.csrf;
  }
  return requireCsrf(req, res, next);
};
app.use(csrfForMutations);

// ---------------------------------------------------------------------
// AUTH – attachUser
// ---------------------------------------------------------------------
const JWT_SECRET = env.JWT_SECRET;

function pickToken(req: Request): string | undefined {
  const c = (req as any).cookies || {};
  const cookieToken =
    c.token || c.jwt || c.auth || c.auth_token || c.access_token || c.id_token || undefined;

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
      } catch {
        // ignore invalid JWT
      }
    }

    if (!env.IS_PROD) {
      const devUser = (req.headers["x-dev-user-id"] as string) || undefined;
      const devAdmin = (req.headers["x-dev-admin"] as string) || undefined;
      if (!userId && devUser) userId = devUser;
      if (devAdmin === "1") role = "ADMIN";
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

    if (userId && role) {
      (req as any).user = { id: userId, role, email };
    }
  } catch {
    // no-op
  }
  next();
}

app.use(attachUser);

// ---------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------
app.get("/", (_req: Request, res: Response) => {
  res.send("Giftstore API is running 🚀");
});
app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ ok: true });
});
if (!env.IS_PROD) {
  app.get("/api/_whoami", (req: Request, res: Response) => {
    res.json({ user: (req as any).user || null });
  });
}

// ---------------------------------------------------------------------
// robots.txt + Sitemaps (SEO)
// ---------------------------------------------------------------------
const SITE_URL = env.SITE_URL.replace(/\/+$/, "");
const API_URL = (process.env.API_URL || "").replace(/\/+$/, "");

// robots.txt
app.get("/robots.txt", (_req: Request, res: Response) => {
  res.type("text/plain");
  res.set("Cache-Control", "public, max-age=3600, s-maxage=3600");
  res.send(`User-agent: *
Allow: /

Sitemap: ${SITE_URL}/sitemap.xml
`);
});

// sitemap index
app.get("/sitemap.xml", async (req: Request, res: Response) => {
  const nowIso = new Date().toISOString();
  const maps = [
    { loc: `${SITE_URL}/sitemap-products.xml`, lastmod: nowIso },
    { loc: `${SITE_URL}/sitemap-categories.xml`, lastmod: nowIso },
    { loc: `${SITE_URL}/sitemap-blog.xml`, lastmod: nowIso },
  ];
  return sendXmlCached(req, res, buildSitemapIndex(maps), 3600);
});

// sitemap produktów
app.get("/sitemap-products.xml", async (req: Request, res: Response) => {
  // Rzutowanie do any – unifikacja typów wygenerowanego PrismaClient vs oczekiwanie helpera
  const rows = await getProductRows(prisma as any, API_URL);
  const urls: SimpleEntry[] = rows.map((r) => ({
    loc: `${SITE_URL}/product/${r.slug}`,
    ...(r.updatedAt ? { lastmod: new Date(r.updatedAt as any).toISOString() } : {}),
    changefreq: "daily",
    priority: 0.9,
  }));

  if (urls.length > 49000) {
    const parts = chunk(urls);
    const n = Number((req.query?.n as string) || 0) || 0;
    const idx = Math.min(Math.max(n, 0), parts.length - 1);
    const part = parts[idx] ?? [];
    return sendXmlCached(req, res, buildUrlset(part), 3600);
  }
  return sendXmlCached(req, res, buildUrlset(urls), 3600);
});

// sitemap kategorii
app.get("/sitemap-categories.xml", async (_req: Request, res: Response) => {
  const rows = await getCategoryRows(prisma as any, API_URL);
  const urls: SimpleEntry[] = rows.map((r) => ({
    loc: `${SITE_URL}/categories/${r.slug}`,
    ...(r.updatedAt ? { lastmod: new Date(r.updatedAt as any).toISOString() } : {}),
    changefreq: "weekly",
    priority: 0.6,
  }));
  return sendXmlCached(_req, res, buildUrlset(urls), 3600);
});

// sitemap bloga
app.get("/sitemap-blog.xml", async (_req: Request, res: Response) => {
  const rows = await getArticleRows(prisma as any, API_URL);
  const urls: SimpleEntry[] = rows.map((r) => ({
    loc: `${SITE_URL}/blog/${r.slug}`,
    ...(r.updatedAt ? { lastmod: new Date(r.updatedAt as any).toISOString() } : {}),
    changefreq: "weekly",
    priority: 0.7,
  }));
  return sendXmlCached(_req, res, buildUrlset(urls), 3600);
});

// ---------------------------------------------------------------------
// Ping Google/Bing po sitemap (opcjonalne)
// ---------------------------------------------------------------------
async function pingSearchEngines(indexUrl: string) {
  const targets = [
    `https://www.google.com/ping?sitemap=${encodeURIComponent(indexUrl)}`,
    `https://www.bing.com/ping?sitemap=${encodeURIComponent(indexUrl)}`,
  ];
  const out: { url: string; status: number }[] = [];
  for (const t of targets) {
    try {
      const r = await fetch(t);
      out.push({ url: t, status: r.status });
    } catch {
      out.push({ url: t, status: 0 });
    }
  }
  return out;
}

type SeoPingResult = { url: string; status: number };
type SeoPingState = {
  lastHash: string;
  lastRunAt?: string;
  lastChangedAt?: string;
  lastResult?: SeoPingResult[];
  lastOk?: boolean;
  runs: number;
};
const seoPingState: SeoPingState = { lastHash: "", runs: 0 };

const pingStateFile = path.join(process.cwd(), "data", "seoPingState.json");
(function loadPingState() {
  try {
    const raw = fs.readFileSync(pingStateFile, "utf-8");
    Object.assign(seoPingState, JSON.parse(raw));
  } catch {}
})();
function savePingState() {
  try {
    fs.mkdirSync(path.dirname(pingStateFile), { recursive: true });
    fs.writeFileSync(pingStateFile, JSON.stringify(seoPingState, null, 2));
  } catch {}
}

async function computeSitemapHash(): Promise<string> {
  const r = await fetch(`${SITE_URL}/sitemap.xml`, { headers: { Accept: "application/xml" } });
  const xml = await r.text();
  const { createHash } = await import("node:crypto");
  return createHash("sha1").update(xml).digest("hex");
}

/** Wysyłka maila – opcjonalna (SMTP lub webhook). */
async function sendSeoMail(subject: string, text: string) {
  if (process.env.SEO_MAIL_WEBHOOK) {
    try {
      await fetch(process.env.SEO_MAIL_WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, text }),
      });
      return;
    } catch {}
  }

  const SMTP_HOST = env.SMTP.HOST;
  const SMTP_PORT = env.SMTP.PORT;
  const SMTP_USER = env.SMTP.USER;
  const SMTP_PASS = env.SMTP.PASS;
  const SEO_MAIL_FROM = process.env.SEO_MAIL_FROM;
  const SEO_MAIL_TO = process.env.SEO_MAIL_TO;

  if (!SMTP_HOST || !SEO_MAIL_FROM || !SEO_MAIL_TO) return;

  try {
    const mod: any = await (Function('return import("nodemailer")')() as Promise<any>).catch(() => null);
    if (!mod) return;
    const nodemailer = mod.default || mod;

    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT || 587),
      secure: String(SMTP_PORT || "587") === "465",
      auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
    });

    await transporter.sendMail({ from: SEO_MAIL_FROM, to: SEO_MAIL_TO, subject, text });
  } catch {
    // ignore
  }
}

/**
 * Ręczny ping (np. po deployu z CI/CD)
 */
app.post("/admin/seo/ping", async (req: Request, res: Response) => {
  const token = String(req.query.token || req.headers["x-seo-ping-token"] || "");
  const secret = String(process.env.SEO_PING_TOKEN || "");
  if (!secret || token !== secret) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const beforeHash = seoPingState.lastHash || "";
  const currentHash = await computeSitemapHash();

  const indexUrl = `${SITE_URL}/sitemap.xml`;
  const results = await pingSearchEngines(indexUrl);

  seoPingState.runs = (seoPingState.runs || 0) + 1;
  seoPingState.lastRunAt = new Date().toISOString();
  seoPingState.lastResult = results;
  seoPingState.lastOk = results.some((r) => r.status >= 200 && r.status < 400);

  const changed = currentHash !== beforeHash;
  if (changed) {
    seoPingState.lastHash = currentHash;
    seoPingState.lastChangedAt = new Date().toISOString();
    savePingState();

    const statuses = results.map((r) => r.status).join(", ");
    await sendSeoMail(
      "Sitemap changed – ping sent",
      `Sitemap hash changed.\nSite: ${SITE_URL}\nIndex: ${indexUrl}\nStatuses: ${statuses}\nWhen: ${seoPingState.lastChangedAt}`
    );
  } else {
    savePingState();
  }

  return res.json({ ok: true, indexUrl, changed, state: seoPingState, results });
});

/** (opcjonalny podgląd statusu) */
app.get("/admin/seo/ping/status", async (_req: Request, res: Response) => {
  const token = String(_req.query.token || _req.headers["x-seo-ping-token"] || "");
  const secret = String(process.env.SEO_PING_TOKEN || "");
  if (!secret || token !== secret) {
    return res.status(401).json({ error: "unauthorized" });
  }
  try {
    const currentHash = await computeSitemapHash();
    seoPingState.lastHash ||= currentHash;
  } catch {}
  return res.json({ ok: true, siteUrl: SITE_URL, state: seoPingState });
});

// ---------------------------------------------------------------------
// Newsletter (SMTP + Prisma, double opt-in)
// ---------------------------------------------------------------------
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

function token(n = 24) {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(n))).toString("base64url");
}
// Node 18 nie ma global crypto.getRandomValues — fallback:
import { randomBytes } from "node:crypto";
function tokenBytes(n = 24) {
  return randomBytes(n).toString("base64url");
}
// używamy fallbacku:
const makeToken = tokenBytes;

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
      <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
      <p style="font-size:12px;color:#555">Otrzymałeś tę wiadomość, bo ktoś wpisał Twój adres na Gift Store.</p>
    </div>
  `;

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
      ${unsubscribeUrl ? `<p style="font-size:12px;color:#666">Możesz zrezygnować w dowolnym momencie: <a href="${unsubscribeUrl}">${unsubscribeUrl}</a></p>` : ""}
    </div>
  `;

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

  if (existing && existing.status === "SUBSCRIBED") {
    return res.send({ ok: true, duplicate: true });
  }

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

  const redirectTo = absUrl("/?newsletter=confirmed");
  return res.redirect(302, redirectTo);
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

  const redirectTo = absUrl("/?newsletter=unsubscribed");
  return res.redirect(302, redirectTo);
});

// ---------------------------------------------------------------------
// PUBLIC API (routery)
// ---------------------------------------------------------------------
app.use("/api", coupons); // kupony
app.use("/api/products", products);
app.use("/api/cart", cart);
app.use("/api/wishlist", wishlist);
app.use("/api/blog", blog);

// Auth (JWT / magic / 2FA / email-change)
app.use("/api/auth", auth);
app.use("/api/auth/magic", authMagic);
app.use("/api/auth", authEmailChange);
app.use("/api/auth", auth2fa);

// ✅ OAuth rejestrujemy warunkowo (żeby CI/E2E nie wywalał się bez kluczy)
const OAUTH_DISABLED = String(process.env.AUTH_DISABLE_OAUTH || "").toLowerCase() === "true";
if (OAUTH_DISABLED) {
  logger.info("[auth] Google/Apple OAuth disabled: AUTH_DISABLE_OAUTH=true");
} else {
  (async () => {
    try {
      const modGoogle = await import("./routes/authGoogle");
      const authGoogle = (modGoogle as any).default || (modGoogle as any);
      app.use("/api/auth", authGoogle);
      logger.info("[auth] Google OAuth routes registered");
    } catch (e: any) {
      logger.warn({ err: e?.message }, "[auth] Google OAuth not registered");
    }

    try {
      const modApple = await import("./routes/authApple");
      const authApple = (modApple as any).default || (modApple as any);
      app.use("/api/auth", authApple);
      logger.info("[auth] Apple OAuth routes registered");
    } catch (e: any) {
      logger.warn({ err: e?.message }, "[auth] Apple OAuth not registered");
    }
  })();
}

// Public orders (checkout)
app.use("/api/orders", publicOrders);

// My orders (dla zalogowanego)
app.use("/api/my/orders", myOrders);

// ADMIN API
app.use("/api/admin", admin);
app.use("/api/admin", adminUsers);
app.use("/api/admin", adminProducts);
app.use("/api/admin", adminProductMedia);
app.use("/api/admin", adminSeed);
app.use("/api/admin", adminProductsMaintenance);
app.use("/api/admin/orders", ordersAdmin);
app.use("/api/admin", adminBlog);
app.use("/api/admin", adminUpload);
app.use("/api/admin", adminCoupons);

// PAYMENTS API
app.use("/api/payments/stripe", paymentsStripe);

// 404 dla nieznanych /api/*
app.use("/api/*", (_req: Request, res: Response) => {
  res.status(404).json({ error: "Not found" });
});

// Global error handler
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

// ---------------------------------------------------------------------
// Auto-flow (opcjonalny, tylko prod)
// ---------------------------------------------------------------------
if (env.IS_PROD && process.env.AUTO_FLOW_ENABLED === "1") {
  const every = "*/10 * * * *"; // co 10 min
  const minutes = Math.max(1, parseInt(process.env.AUTO_FLOW_PREPARING_TO_PACKING_MIN || "120", 10));

  cron.schedule(every, async () => {
    try {
      const threshold = new Date(Date.now() - minutes * 60 * 1000);
      const toMove = await prisma.order.findMany({
        where: { status: "PREPARING", updatedAt: { lt: threshold } },
        select: { id: true },
      });
      for (const o of toMove) {
        await prisma.order.update({ where: { id: o.id }, data: { status: "PACKING" as any } });
      }
      if (toMove.length) {
        (app as any).log?.info?.(`[auto-flow] moved ${toMove.length} orders to PACKING`);
      }
    } catch (e: any) {
      console.warn("[auto-flow] job failed:", e?.message);
    }
  });
}

// ---------------------------------------------------------------------
// Server start
// ---------------------------------------------------------------------
const port = Number(process.env.PORT || 4000);
app.listen(port, () => {
  logger.info(`API running on http://localhost:${port}`);
  logger.info(`Serving uploads from: ${uploadsDir} -> http://localhost:${port}/uploads/...`);
  logger.info(
    `APP_URL=${process.env.APP_URL || env.SITE_URL} API_URL=${process.env.API_URL || `http://localhost:${port}`}`
  );
});

// ---------------------------------------------------------------------
// Auto-import kuponów z prisma/seed.ts przy starcie (opcjonalny)
// ---------------------------------------------------------------------
if (process.env.AUTO_IMPORT_COUPONS === "1") {
  (async () => {
    try {
      const found = await readPrismaSeedFile();
      if (!found) {
        logger.warn("[coupons:auto-import] seed file not found (set COUPONS_SEED_FILE or PRISMA_SEED_FILE)");
        return;
      }
      const items = parseSeedCoupons(found.text);
      if (!items.length) {
        logger.warn("[coupons:auto-import] no items parsed from seed file");
        return;
      }
      let created = 0,
        updated = 0,
        failed = 0;
      for (const raw of items) {
        try {
          // rzutowanie na any – ujednolica różnice typów między pomocnikami a naszym klientem
          const r = await ensureCoupon(prisma as any, raw as any, { upsert: true });
          if (r?.created) created++;
          else if (r?.updated) updated++;
        } catch (e: any) {
          failed++;
          logger.warn({ code: (raw as any)?.code, err: e?.message }, "[coupons:auto-import] item failed");
        }
      }
      logger.info(`[coupons:auto-import] created=${created} updated=${updated} failed=${failed} (from ${items.length})`);
    } catch (e: any) {
      logger.error({ err: e?.message }, "[coupons:auto-import] failed");
    }
  })();
}
