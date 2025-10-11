// src/lib/mailer.ts
import nodemailer, { type Transporter, type SentMessageInfo } from "nodemailer";
import { subjects, templates } from "./emailTemplates";

const {
  SMTP_HOST = "",
  SMTP_PORT = "587",
  SMTP_USER = "",
  SMTP_PASS = "",
  MAIL_FROM = "Gift Store <no-reply@giftstore.local>",
  BRAND_NAME = "Gift Store",
  NODE_ENV = "development",
  SMTP_DEBUG = "0",
} = process.env;

/** ── THROTTLE & RETRY (dla sandboxów typu Mailtrap) ───────────────────── */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MAIL_MIN_GAP_MS = Math.max(0, parseInt(process.env.MAIL_MIN_GAP_MS || "0", 10)); // np. 1800ms
const MAX_RETRIES = Math.max(0, parseInt(process.env.MAIL_MAX_RETRIES || "3", 10));
let lastSentAt = 0;

/** Brak SMTP_HOST ⇒ dev jsonTransport (nie wysyła, loguje JSON) */
const useJsonTransport = !SMTP_HOST;

/** ── Transporter (z fixem typów dla jsonTransport) ─────────────────────── */
let transporter: Transporter;
if (useJsonTransport) {
  // @types/nodemailer nie ma 'jsonTransport' w typach — rzutujemy na any
  const jsonOpts: any = {
    jsonTransport: true,
    logger: SMTP_DEBUG === "1",
    debug: SMTP_DEBUG === "1",
  };
  transporter = nodemailer.createTransport(jsonOpts) as Transporter;
} else {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT || 587),
    secure: Number(SMTP_PORT || 587) === 465, // 465 = SSL/TLS
    auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
    logger: SMTP_DEBUG === "1",
    debug: SMTP_DEBUG === "1",
  }) as Transporter;
}

function isRateLimited(err: any): boolean {
  const msg = (err?.message || "").toLowerCase();
  return err?.responseCode === 550 || msg.includes("too many emails per second");
}

async function sendWithThrottle(data: {
  to: string;
  subject: string;
  html: string;
}): Promise<SentMessageInfo> {
  // Odczekaj odstęp między wysyłkami (globalny throttle)
  if (MAIL_MIN_GAP_MS > 0) {
    const now = Date.now();
    const wait = Math.max(0, lastSentAt + MAIL_MIN_GAP_MS - now);
    if (wait > 0) {
      if (SMTP_DEBUG === "1") console.log(`[mailer] throttle: waiting ${wait}ms`);
      await sleep(wait);
    }
  }

  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    attempt++;
    try {
      if (SMTP_DEBUG === "1") {
        console.log("[mailer] ->", {
          transport: useJsonTransport ? "json" : "smtp",
          to: data.to,
          subject: data.subject,
          htmlLen: data.html?.length || 0,
          attempt,
        });
      }

      const info = await transporter.sendMail({
        from: MAIL_FROM,
        to: data.to,
        subject: data.subject,
        html: data.html,
      });

      lastSentAt = Date.now();

      if (useJsonTransport || NODE_ENV !== "production" || SMTP_DEBUG === "1") {
        const anyInfo = info as any;
        const payload =
          typeof anyInfo?.message === "string"
            ? anyInfo.message
            : anyInfo?.message?.toString?.() ?? anyInfo;
        console.log("[mailer] <- sent (dev)", {
          accepted: anyInfo?.accepted,
          rejected: anyInfo?.rejected,
          response: anyInfo?.response,
          messageId: anyInfo?.messageId,
          payload,
        });
      } else {
        console.log("[mailer] <- sent", {
          messageId: (info as any).messageId ?? info,
          accepted: (info as any).accepted,
          rejected: (info as any).rejected,
          response: (info as any).response,
        });
      }

      return info;
    } catch (err: any) {
      console.error("Send Error:", err?.message || err);

      if (isRateLimited(err) && attempt <= MAX_RETRIES) {
        const backoff = Math.min(5000, 800 * attempt); // 0.8s, 1.6s, 2.4s...
        console.warn(`[mailer] rate-limited 550 — retry in ${backoff}ms (${attempt}/${MAX_RETRIES})`);
        await sleep(backoff);
        continue;
      }

      throw err;
    }
  }
}

/** Publiczna wysyłka prostego maila (z throttle + retry). */
export async function sendMail(to: string, subject: string, html: string): Promise<SentMessageInfo> {
  return sendWithThrottle({ to, subject, html });
}

/** Wysyłka maila z predefiniowanego szablonu. */
export async function sendTemplatedMail<T extends keyof typeof templates>(
  to: string,
  template: T,
  data: Parameters<(typeof templates)[T]>[0],
  subjectOverride?: string
) {
  const makeSubject = subjects[template];
  const render = templates[template];
  const subject = subjectOverride ?? makeSubject(data as any);
  const html = render({ brand: BRAND_NAME, ...(data as any) });
  await sendMail(to, subject, html);
}

/** Podgląd szablonu bez wysyłki (dev). */
export function renderTemplate<T extends keyof typeof templates>(
  template: T,
  data: Parameters<(typeof templates)[T]>[0]
) {
  return templates[template]({ brand: BRAND_NAME, ...(data as any) });
}
