// src/lib/emailTemplates.ts

/** =========================
 *  Typy wspólne + helpers
 *  ========================= */
type BaseData = { brand?: string };

export type OrderItemLike = {
  name?: string | null;
  sku?: string | null;
  qty: number;
  priceCents: number;
};

export type OrderLike = {
  id: string;
  number?: string | null;
  status: string;
  items?: OrderItemLike[];
  subtotalCents?: number | null;
  discountCents?: number | null;
  shippingCents?: number | null;
  paymentSurchargeCents?: number | null;
  totalCents: number;
};

const C = {
  bg: "#f7f7f8",
  card: "#ffffff",
  text: "#1f2937",
  subtext: "#6b7280",
  red: "#9b1c1c",     // mainRed
  gold: "#d4af37",    // gold
  border: "#e5e7eb",
  badge: "#f1f5f9",
};

const PLN = (cents?: number | null) =>
  typeof cents === "number" ? (cents / 100).toFixed(2) + " zł" : "—";

function brandName(override?: string) {
  return override || process.env.BRAND_NAME || "Gift Store";
}

function logo(logoUrl?: string) {
  const src =
    logoUrl ||
    process.env.BRAND_LOGO_URL ||
    "https://dummyimage.com/200x48/9b1c1c/ffffff&text=Gift+Store";
  const alt = brandName();
  return `
    <img src="${src}" alt="${alt}" width="200" height="48"
         style="display:block; max-width:200px; height:auto;" />
  `;
}

function badge(status: string) {
  return `
    <span style="
      display:inline-block;
      padding:6px 10px;
      border-radius:9999px;
      background:${C.badge};
      color:${C.text};
      font-weight:600;
      font-size:12px;
      letter-spacing:.3px;
      text-transform:uppercase;
    ">${status}</span>`;
}

const baseStyles = `
  body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; background:${C.bg}; padding:24px; }
  .card { max-width: 640px; margin:0 auto; background:${C.card}; border-radius:16px; padding:24px; border:1px solid ${C.border}; }
  .h1 { margin:0 0 16px; color:${C.red}; }
  .btn { display:inline-block; padding:12px 18px; border-radius:9999px; text-decoration:none; background:${C.gold}; color:${C.red}; font-weight:800; }
  .muted { color:${C.subtext}; font-size:12px; margin-top:16px; }
  code { background:#f3f4f6; padding:3px 6px; border-radius:6px; }
`;

function htmlShell(content: string, brand?: string) {
  return `<!doctype html>
<html lang="pl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<style>${baseStyles}</style></head>
<body>
  <div class="card">
    ${content}
    <p class="muted">— ${brandName(brand)}</p>
  </div>
</body>
</html>`;
}

/** =========================
 *  Etykiety statusów
 *  ========================= */
export const STATUS_LABEL: Record<string, string> = {
  PENDING: "Oczekujące",
  PAID: "Opłacone",
  PREPARING: "W przygotowaniu",
  PACKING: "Pakowanie",
  READY_TO_SHIP: "Gotowe do wysyłki",
  SHIPPED: "Wysłane",
  FULFILLED: "Zrealizowane",
  CANCELLED: "Anulowane",
  REFUNDED: "Zwrócone",
};

/** =========================
 *  Nazwy szablonów i tematy
 *  ========================= */
export type TemplateName =
  | "verifyCode"
  | "resetPassword"
  | "magicLogin"
  | "changeEmailStart"
  | "changeEmailConfirmed"
  | "paymentConfirmation"   // klient – płatność przyjęta
  | "adminPaymentInfo"      // admin – płatność przyjęta (skrót)
  | "orderStatusUpdate"     // klient – dowolna zmiana statusu
  | "orderShipped"          // klient – wysyłka z trackingiem
  | "invoiceReady";         // ⬅ NOWE: faktura gotowa

export const subjects: Record<TemplateName, (data: any) => string> = {
  verifyCode: () => "Twój kod weryfikacyjny",
  resetPassword: () => "Reset hasła",
  magicLogin: () => "Link logowania",
  changeEmailStart: () => "Potwierdź zmianę e-mail",
  changeEmailConfirmed: () => "Adres e-mail został zmieniony",

  paymentConfirmation: (data: { order?: OrderLike }) =>
    `Płatność przyjęta — ${data?.order?.number || data?.order?.id || ""}`,
  adminPaymentInfo: (data: { order?: OrderLike }) =>
    `Płatność przyjęta: ${data?.order?.number || data?.order?.id || ""} (ADMIN)`,

  orderStatusUpdate: (data: { order?: OrderLike; status?: string }) => {
    const s = (data?.status || data?.order?.status || "").toUpperCase();
    const label = STATUS_LABEL[s] || s || "Status";
    const no = data?.order?.number || data?.order?.id || "";
    return `Aktualizacja statusu — ${label} (${no})`;
  },

  orderShipped: (data: { order?: OrderLike }) =>
    `Wysłane — ${data?.order?.number || data?.order?.id || ""}`,

  // ⬇ NOWE — temat maila z fakturą
  invoiceReady: (data: { order?: OrderLike; invoiceNumber?: string }) => {
    const no = data?.order?.number || data?.order?.id || "";
    const inv = data?.invoiceNumber || "";
    return `Faktura ${inv} — ${no}`;
  },
};

/** =========================
 *  Szablony (HTML)
 *  ========================= */
export const templates: Record<TemplateName, (data: any) => string> = {
  /** --- Auth/zmiana e-maila --- */
  verifyCode: ({ code, brand }: BaseData & { code: string }) =>
    htmlShell(
      `<h1 class="h1">Kod weryfikacyjny</h1>
       <p>Twój kod:</p>
       <p style="font-size:22px;letter-spacing:3px;"><b>${code}</b></p>
       <p class="muted">Kod ważny 15 minut.</p>`,
      brand
    ),

  resetPassword: ({ link, brand }: BaseData & { link: string }) =>
    htmlShell(
      `<h1 class="h1">Reset hasła</h1>
       <p>Kliknij, aby ustawić nowe hasło:</p>
       <p><a class="btn" href="${link}">Ustaw nowe hasło</a></p>
       <p class="muted">Link ważny 30 minut.</p>`,
      brand
    ),

  magicLogin: ({ link, brand }: BaseData & { link: string }) =>
    htmlShell(
      `<h1 class="h1">Logowanie jednym kliknięciem</h1>
       <p>Wejdź przez link:</p>
       <p><a class="btn" href="${link}">Zaloguj</a></p>
       <p class="muted">Link ważny 15 minut.</p>`,
      brand
    ),

  changeEmailStart: ({
    confirmLink,
    newEmail,
    brand,
  }: BaseData & { confirmLink: string; newEmail: string }) =>
    htmlShell(
      `<h1 class="h1">Potwierdź nowy e-mail</h1>
       <p>Zażądano zmiany e-maila na: <b>${newEmail}</b>.</p>
       <p>Aby dokończyć, kliknij:</p>
       <p><a class="btn" href="${confirmLink}">Potwierdź zmianę e-maila</a></p>
       <p class="muted">Link ważny 30 minut. Jeśli to nie Ty – zignoruj tę wiadomość.</p>`,
      brand
    ),

  changeEmailConfirmed: ({ brand }: BaseData) =>
    htmlShell(
      `<h1 class="h1">Zmieniono e-mail</h1>
       <p>Adres e-mail na Twoim koncie został zmieniony.</p>`,
      brand
    ),

  /** --- Potwierdzenie płatności (klient) --- */
  paymentConfirmation: ({
    order,
    customerName,
    ctaUrl,
    logoUrl,
    footerNote,
    brand,
  }: {
    order: OrderLike;
    customerName?: string;
    ctaUrl?: string;
    logoUrl?: string;
    footerNote?: string;
    brand?: string;
  }) => {
    const numberOrId = order.number || order.id;

    const itemsRows =
      order.items?.map((it) => {
        const name = it.name || "(produkt)";
        const sku = it.sku ? ` — <span style="color:${C.subtext};">SKU: ${it.sku}</span>` : "";
        return `
          <tr>
            <td style="padding:10px 12px; border-bottom:1px solid ${C.border}">
              <div style="font-weight:600;">${name}</div>
              <div style="font-size:12px; color:${C.subtext};">${sku || ""}</div>
            </td>
            <td style="padding:10px 12px; border-bottom:1px solid ${C.border}; text-align:center;">${it.qty}</td>
            <td style="padding:10px 12px; border-bottom:1px solid ${C.border}; text-align:right;">${PLN(it.priceCents)}</td>
            <td style="padding:10px 12px; border-bottom:1px solid ${C.border}; text-align:right; font-weight:600;">
              ${PLN(it.priceCents * it.qty)}
            </td>
          </tr>
        `;
      }).join("") || "";

    const discountRow =
      typeof order.discountCents === "number" && order.discountCents > 0
        ? `
          <tr>
            <td style="padding:8px 0; color:${C.subtext};">Rabat</td>
            <td style="padding:8px 0; text-align:right; color:${C.text};">-${PLN(order.discountCents)}</td>
          </tr>`
        : "";

    const shippingRow =
      typeof order.shippingCents === "number"
        ? `
          <tr>
            <td style="padding:8px 0; color:${C.subtext};">Wysyłka</td>
            <td style="padding:8px 0; text-align:right; color:${C.text};">${PLN(order.shippingCents)}</td>
          </tr>`
        : "";

    const surchargeRow =
      typeof order.paymentSurchargeCents === "number" && order.paymentSurchargeCents > 0
        ? `
          <tr>
            <td style="padding:8px 0; color:${C.subtext};">Dopłata do płatności</td>
            <td style="padding:8px 0; text-align:right; color:${C.text};">${PLN(order.paymentSurchargeCents)}</td>
          </tr>`
        : "";

    const subtotalRow =
      typeof order.subtotalCents === "number"
        ? `
          <tr>
            <td style="padding:8px 0; color:${C.subtext};">Produkty (netto)</td>
            <td style="padding:8px 0; text-align:right; color:${C.text};">${PLN(order.subtotalCents)}</td>
          </tr>`
        : "";

    const cta = ctaUrl
      ? `
        <a href="${ctaUrl}" target="_blank" rel="noreferrer"
          style="
            display:inline-block;
            background:${C.gold};
            color:${C.red};
            font-weight:800;
            padding:12px 20px;
            border-radius:9999px;
            text-decoration:none;
            letter-spacing:.3px;
          ">
          Zobacz szczegóły zamówienia
        </a>`
      : "";

    const header = `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${C.card}; border-radius:16px; box-shadow:0 10px 30px rgba(0,0,0,.05); overflow:hidden;">
        <tr>
          <td style="padding:24px; background:${C.card};">
            ${logo(logoUrl)}
          </td>
        </tr>
        <tr><td style="padding:8px 24px;">${badge(order.status)}</td></tr>
        <tr>
          <td style="padding:12px 24px 0; color:${C.text};">
            <h1 style="margin:0 0 6px; font-size:22px; color:${C.red};">Płatność przyjęta</h1>
            <p style="margin:0; font-size:14px; color:${C.subtext};">
              Zamówienie <strong>${numberOrId}</strong> zostało opłacone. Dziękujemy${customerName ? `, ${customerName}` : ""}!
            </p>
          </td>
        </tr>
      </table>
    `;

    const itemsTable = `
      <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse; border:1px solid ${C.border}; border-radius:12px; overflow:hidden;">
        <thead>
          <tr style="background:#fafafa;">
            <th align="left"  style="padding:10px 12px; font-size:12px; color:${C.subtext}; text-transform:uppercase; letter-spacing:.4px;">Produkt</th>
            <th align="center"style="padding:10px 12px; font-size:12px; color:${C.subtext}; text-transform:uppercase; letter-spacing:.4px;">Ilość</th>
            <th align="right" style="padding:10px 12px; font-size:12px; color:${C.subtext}; text-transform:uppercase; letter-spacing:.4px;">Cena</th>
            <th align="right" style="padding:10px 12px; font-size:12px; color:${C.subtext}; text-transform:uppercase; letter-spacing:.4px;">Razem</th>
          </tr>
        </thead>
        <tbody>${itemsRows}</tbody>
      </table>
    `;

    const totals = `
      <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
        ${subtotalRow}
        ${discountRow}
        ${shippingRow}
        ${surchargeRow}
        <tr>
          <td style="padding:12px 0; font-weight:800; color:${C.text}; border-top:1px solid ${C.border};">Suma</td>
          <td style="padding:12px 0; text-align:right; font-weight:800; color:${C.red}; border-top:1px solid ${C.border};">${PLN(order.totalCents)}</td>
        </tr>
      </table>
    `;

    const footer = `
      <div style="padding:16px 0; color:${C.subtext}; font-size:12px;">
        ${footerNote || "W razie pytań napisz do nas, chętnie pomożemy. Dziękujemy za zakupy!"}
      </div>
      <div style="color:${C.subtext}; font-size:12px; margin-top:8px;">© ${new Date().getFullYear()} ${brandName(brand)}</div>
    `;

    return `<!DOCTYPE html>
<html lang="pl">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width" /></head>
<body style="margin:0; background:${C.bg};">
  <div style="max-width:640px; margin:24px auto; background:${C.card}; border-radius:16px; padding:0; border:1px solid ${C.border}; overflow:hidden;">
    <div style="padding:0 0 8px 0">${header}</div>
    <div style="padding:16px 24px 8px;">${itemsTable}</div>
    <div style="padding:4px 24px 16px;">${totals}</div>
    ${cta ? `<div style="padding:8px 24px 24px;">${cta}</div>` : ""}
    <div style="padding:16px 24px; background:#fafafa;">${footer}</div>
  </div>
</body>
</html>`;
  },

  /** --- Krótkie powiadomienie dla admina --- */
  adminPaymentInfo: ({
    order,
    logoUrl,
    brand,
  }: {
    order: OrderLike;
    logoUrl?: string;
    brand?: string;
  }) => {
    const numberOrId = order.number || order.id;
    return `<!DOCTYPE html>
<html lang="pl">
<head><meta charset="utf-8" /></head>
<body style="margin:0; background:${C.bg}; font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellspacing="0" cellpadding="0" style="padding:24px 0;">
    <tr><td align="center">
      <table width="640" cellspacing="0" cellpadding="0" style="max-width:640px; width:100%; background:${C.card}; border-radius:16px; overflow:hidden; border:1px solid ${C.border}">
        <tr><td style="padding:24px;">${logo(logoUrl)}</td></tr>
        <tr><td style="padding:0 24px 12px; color:${C.text};">
          <h2 style="margin:0 0 6px; color:${C.red};">Płatność przyjęta (ADMIN)</h2>
          <p style="margin:0;">Zamówienie <strong>${numberOrId}</strong> opłacone. Status: <strong>${order.status}</strong>.</p>
        </td></tr>
        <tr><td style="padding:12px 24px 24px; color:${C.subtext}; font-size:12px;">
          Suma: <strong style="color:${C.text};">${PLN(order.totalCents)}</strong><br/>
          Marka: ${brandName(brand)}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  },

  /** --- Ogólna aktualizacja statusu (client) --- */
  orderStatusUpdate: ({
    order,
    status,
    note,
    ctaUrl,
    logoUrl,
    brand,
  }: {
    order: OrderLike;
    status?: string;
    note?: string;
    ctaUrl?: string;
    logoUrl?: string;
    brand?: string;
  }) => {
    const effectiveStatus = (status || order.status || "").toUpperCase();
    const label = STATUS_LABEL[effectiveStatus] || effectiveStatus || "Status";
    const numberOrId = order.number || order.id;

    const cta = ctaUrl
      ? `<a href="${ctaUrl}" target="_blank" rel="noreferrer"
            style="display:inline-block;background:${C.gold};color:${C.red};font-weight:800;padding:12px 20px;border-radius:9999px;text-decoration:none;letter-spacing:.3px;">
           Zobacz szczegóły zamówienia
         </a>`
      : "";

    return `<!DOCTYPE html>
<html lang="pl"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width" /></head>
<body style="margin:0; background:${C.bg};">
  <div style="max-width:640px; margin:24px auto; background:${C.card}; border-radius:16px; padding:0; border:1px solid ${C.border}; overflow:hidden;">
    <div style="padding:24px;">${logo(logoUrl)}</div>
    <div style="padding:0 24px 8px;">${badge(label)}</div>
    <div style="padding:12px 24px 8px; color:${C.text};">
      <h1 style="margin:0 0 6px; font-size:22px; color:${C.red};">${label}</h1>
      <p style="margin:0; font-size:14px; color:${C.subtext};">
        Zamówienie <strong>${numberOrId}</strong> — nowy status: <strong>${label}</strong>.
      </p>
      ${note ? `<p style="margin:8px 0 0; font-size:14px; color:${C.text};">${note}</p>` : ""}
    </div>
    ${cta ? `<div style="padding:12px 24px 24px;">${cta}</div>` : ""}
    <div style="padding:16px 24px; background:#fafafa; color:${C.subtext}; font-size:12px;">
      Dziękujemy za zakupy!<br/>© ${new Date().getFullYear()} ${brandName(brand)}
    </div>
  </div>
</body></html>`;
  },

  /** --- Wysłane z trackingiem (client) --- */
  orderShipped: ({
    order,
    trackingNumber,
    carrierName,
    trackingUrl,
    estDelivery,
    ctaUrl,
    logoUrl,
    brand,
  }: {
    order: OrderLike;
    trackingNumber?: string;
    carrierName?: string;
    trackingUrl?: string;
    estDelivery?: string;
    ctaUrl?: string;
    logoUrl?: string;
    brand?: string;
  }) => {
    const numberOrId = order.number || order.id;
    const label = STATUS_LABEL["SHIPPED"] || "Wysłane";

    const trackBlock = (trackingNumber || trackingUrl)
      ? `
        <div style="margin-top:10px; padding:12px; border:1px dashed ${C.border}; border-radius:12px; background:#fafafa;">
          ${carrierName ? `<div style="font-weight:600; color:${C.text};">Przewoźnik: ${carrierName}</div>` : ""}
          ${trackingNumber ? `<div style="color:${C.text};">Numer śledzenia: <b>${trackingNumber}</b></div>` : ""}
          ${trackingUrl ? `<div style="margin-top:8px;"><a href="${trackingUrl}" target="_blank" rel="noreferrer" style="color:${C.red}; font-weight:700; text-decoration:none;">Śledź przesyłkę →</a></div>` : ""}
          ${estDelivery ? `<div style="margin-top:8px; color:${C.subtext}; font-size:13px;">Przewidywana dostawa: <b style="color:${C.text};">${estDelivery}</b></div>` : ""}
        </div>`
      : "";

    const cta = ctaUrl
      ? `<a href="${ctaUrl}" target="_blank" rel="noreferrer"
            style="display:inline-block;background:${C.gold};color:${C.red};font-weight:800;padding:12px 20px;border-radius:9999px;text-decoration:none;letter-spacing:.3px;">
           Zobacz szczegóły zamówienia
         </a>`
      : "";

    return `<!DOCTYPE html>
<html lang="pl"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width" /></head>
<body style="margin:0; background:${C.bg};">
  <div style="max-width:640px; margin:24px auto; background:${C.card}; border-radius:16px; padding:0; border:1px solid ${C.border}; overflow:hidden;">
    <div style="padding:24px;">${logo(logoUrl)}</div>
    <div style="padding:0 24px 8px;">${badge(label)}</div>
    <div style="padding:12px 24px 8px; color:${C.text};">
      <h1 style="margin:0 0 6px; font-size:22px; color:${C.red};">Przesyłka nadana</h1>
      <p style="margin:0; font-size:14px; color:${C.subtext};">
        Zamówienie <strong>${numberOrId}</strong> zostało nadane.
      </p>
      ${trackBlock}
    </div>
    ${cta ? `<div style="padding:12px 24px 24px;">${cta}</div>` : ""}
    <div style="padding:16px 24px; background:#fafafa; color:${C.subtext}; font-size:12px;">
      Dziękujemy za zakupy!<br/>© ${new Date().getFullYear()} ${brandName(brand)}
    </div>
  </div>
</body></html>`;
  },

  /** --- NOWE: faktura gotowa (client) --- */
  invoiceReady: ({
    order,
    invoiceNumber,
    downloadUrl,   // ujednolicony parametr linku
    logoUrl,
    brand,
  }: {
    order: OrderLike;
    invoiceNumber?: string;
    downloadUrl: string;   // absolutny URL do endpointu pobrania PDF
    logoUrl?: string;
    brand?: string;
  }) => {
    const numberOrId = order.number || order.id;

    return `<!DOCTYPE html>
<html lang="pl"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width" /></head>
<body style="margin:0; background:${C.bg};">
  <div style="max-width:640px; margin:24px auto; background:${C.card}; border-radius:16px; padding:0; border:1px solid ${C.border}; overflow:hidden;">
    <div style="padding:24px;">${logo(logoUrl)}</div>
    <div style="padding:12px 24px 0; color:${C.text};">
      <h1 style="margin:0 0 8px; font-size:22px; color:${C.red};">Faktura gotowa</h1>
      <p style="margin:0; font-size:14px; color:${C.subtext};">
        Dla zamówienia <strong>${numberOrId}</strong>${invoiceNumber ? ` wystawiono fakturę <strong>${invoiceNumber}</strong>` : ""}.
      </p>
    </div>

    <div style="padding:16px 24px 24px;">
      <a href="${downloadUrl}" target="_blank" rel="noreferrer"
         style="display:inline-block;background:${C.gold};color:${C.red};font-weight:800;padding:12px 20px;border-radius:9999px;text-decoration:none;letter-spacing:.3px;">
        Pobierz fakturę (PDF)
      </a>

      <div style="color:${C.subtext}; font-size:12px; margin-top:12px;">
        Suma zamówienia: <b style="color:${C.text};">${PLN(order.totalCents)}</b>
      </div>
    </div>

    <div style="padding:16px 24px; background:#fafafa; color:${C.subtext}; font-size:12px;">
      Dziękujemy za zakupy! W razie pytań odpowiedz na tę wiadomość.<br/>© ${new Date().getFullYear()} ${brandName(brand)}
    </div>
  </div>
</body></html>`;
  },
};

/** =========================
 *  Wygodne aliasy – import po nazwie
 *  ========================= */
export const paymentConfirmationEmail = templates.paymentConfirmation;
export const adminPaymentInfoEmail = templates.adminPaymentInfo;
export const invoiceReadyEmail = templates.invoiceReady;
