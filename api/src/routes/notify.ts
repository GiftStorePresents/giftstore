// api/src/routes/notify.ts
import {
  Router,
  type Request,
  type Response,
  type Router as RouterType,
} from "express";
import rateLimit from "express-rate-limit";
import { prisma } from "../lib/prisma";
import { requireCsrf } from "../middleware/csrf";

/** 👇 Jawna adnotacja typu usuwa TS2742 */
const router: RouterType = Router();

/** Mały limiter anty-spamowy */
const limiter: ReturnType<typeof rateLimit> = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

/** Lekki transporter SMTP (taki sam schemat jak w server.ts) */
async function makeTransporter() {
  const host = process.env.SMTP_HOST || process.env.SMTP__HOST;
  const port = Number(process.env.SMTP_PORT || process.env.SMTP__PORT || 587);
  const user = process.env.SMTP_USER || process.env.SMTP__USER || "";
  const pass = process.env.SMTP_PASS || process.env.SMTP__PASS || "";
  if (!host) return null;

  // dynamiczny import, bez zależności w bundle
  const mod: any = await (Function('return import("nodemailer")')() as Promise<any>).catch(() => null);
  if (!mod) return null;
  const nodemailer = mod.default || mod;

  return nodemailer.createTransport({
    host,
    port,
    secure: String(port) === "465",
    auth: user ? { user, pass } : undefined,
  });
}

function fromAddr() {
  return process.env.SMTP_FROM || "Gift Store <no-reply@giftstore.pl>";
}
function adminNotifyTo() {
  return (
    process.env.NOTIFY_ADMIN_EMAIL ||
    process.env.SMTP_ADMIN ||
    process.env.SMTP_USER ||
    "admin@giftstore.pl"
  );
}

/**
 * POST /api/notify/back-in-stock
 * Body: { email: string, slug: string, name?: string }
 */
router.post(
  "/notify/back-in-stock",
  limiter,
  requireCsrf,
  async (req: Request, res: Response) => {
    const { email, slug, name } = (req.body || {}) as {
      email?: string;
      slug?: string;
      name?: string;
    };

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).send("Invalid email");
    }
    if (!slug) return res.status(400).send("Missing slug");

    // 1) Mail do admina (jeśli skonfigurowano SMTP)
    try {
      const tr = await makeTransporter();
      if (tr) {
        const html = `
          <div style="font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif">
            <h2>Prośba o powiadomienie (back-in-stock)</h2>
            <ul>
              <li><b>Produkt:</b> ${name || "(brak)"} (${slug})</li>
              <li><b>E-mail klienta:</b> ${email}</li>
              <li><b>Data:</b> ${new Date().toISOString()}</li>
            </ul>
          </div>`;
        await tr.sendMail({
          from: fromAddr(),
          to: adminNotifyTo(),
          subject: `[Gift Store] Back-in-stock: ${name || slug}`,
          text: `Klient prosi o powiadomienie o dostępności.\nProdukt: ${name || ""} (${slug})\nE-mail: ${email}`,
          html,
        });
      }
    } catch {
      // brak SMTP nie blokuje 200
    }

    // 2) Lekki log do SiteSetting (JSON), bez migracji
    try {
      const key = "backInStockQueue";
      const row = await prisma.siteSetting.findUnique({ where: { key } }).catch(() => null);
      const item = { email, slug, name: name || null, ts: Date.now() };
      if (!row) {
        await prisma.siteSetting.create({ data: { key, value: [item] } });
      } else {
        const arr = Array.isArray(row.value) ? (row.value as any[]) : [];
        arr.push(item);
        const trimmed = arr.slice(Math.max(0, arr.length - 500));
        await prisma.siteSetting.update({ where: { key }, data: { value: trimmed } });
      }
    } catch {
      // cicho
    }

    return res.json({ ok: true });
  }
);

export default router;
