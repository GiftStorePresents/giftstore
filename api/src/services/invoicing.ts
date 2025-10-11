// src/services/invoicing.ts
import { prisma } from "../lib/prisma";
import { sendMail } from "../lib/mailer";
import { subjects, templates } from "../lib/emailTemplates";
import { generateInvoicePDF } from "../lib/invoice";

/**
 * Wystawia fakturę (jeśli invoiceRequested = true i faktura jeszcze nie istnieje),
 * zapisuje metadane i – jeśli SEND_INVOICE_EMAILS != "0" – wysyła mail
 * z linkiem do pobrania PDF (chroniony endpoint backendu).
 *
 * Zwraca zaktualizowane zamówienie (z polami invoice*), albo oryginalne,
 * jeśli nie trzeba było nic robić.
 */
export async function issueInvoiceAndNotify(orderId: string) {
  // 1) Pobierz zamówienie z danymi do faktury i pozycjami
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { user: true, items: true },
  });
  if (!order) throw new Error("Order not found");

  console.log("[invoicing] begin", {
    order: order.number || order.id,
    requested: order.invoiceRequested,
    alreadyIssued: !!order.invoiceIssuedAt,
    to: order.invoiceEmail || order.user?.email || order.shippingEmail || "(none)",
  });

  // 2) Jeśli klient nie chciał faktury albo już była wystawiona — nic nie rób
  if (!order.invoiceRequested || order.invoiceIssuedAt) {
    console.log(
      "[invoicing] skip: requested=%s issued=%s id=%s",
      order.invoiceRequested,
      Boolean(order.invoiceIssuedAt),
      order.id
    );
    return order;
  }

  // 3) Nadaj numer faktury
  const d = new Date();
  const invNumber =
    `INV-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
      d.getDate()
    ).padStart(2, "0")}` + `-${(order.number || order.id).slice(-4)}`;

  // 4) Sprzedawca (ENV -> fallback)
  const seller = {
    name: process.env.INVOICE_SELLER_NAME || "Gift Store Sp. z o.o.",
    nip: process.env.INVOICE_SELLER_NIP || "",
    addr1: process.env.INVOICE_SELLER_ADDR1 || "Ul. Przykładowa 1",
    zip: process.env.INVOICE_SELLER_ZIP || "00-000",
    city: process.env.INVOICE_SELLER_CITY || "Warszawa",
    country: process.env.INVOICE_SELLER_COUNTRY || "PL",
    email: process.env.INVOICE_SELLER_EMAIL || "",
  };

  // 5) Nabywca (z pól fakturowych; fallbacki z danych zam.)
  const buyer = {
    name:
      order.invoiceCompanyName ||
      order.shippingName ||
      (order.user?.name || order.user?.email || ""),
    nip: order.invoiceNip || null,
    addr1: order.invoiceAddr1 || null,
    zip: order.invoiceZip || null,
    city: order.invoiceCity || null,
    country: order.invoiceCountry || null,
    email: order.invoiceEmail || order.user?.email || order.shippingEmail || null,
  };

  // 6) Pozycje
  const items = (order.items || []).map((it) => ({
    name: it.name || "(produkt)",
    qty: it.qty,
    unitPriceCents: it.priceCents,
  }));

  // 7) Generowanie PDF (do ./storage/invoices/…)
  const invoicePathRel = await generateInvoicePDF({
    invoiceNumber: invNumber,
    issueDate: new Date(),
    seller,
    buyer,
    items,
    shippingCents: order.shippingCents ?? null,
    surchargeCents: order.paymentSurchargeCents ?? null,
    discountCents: order.discountCents ?? null,
    totalCents: order.totalCents,
  });

  // 8) Zapis metadanych faktury
  const updated = await prisma.order.update({
    where: { id: order.id },
    data: {
      invoiceNumber: invNumber,
      invoiceIssuedAt: new Date(),
      invoicePdfPath: invoicePathRel,
    },
    include: { user: true, items: true },
  });

  // 9) Mail „Faktura gotowa” (opcjonalny – SEND_INVOICE_EMAILS)
  try {
    if (process.env.SEND_INVOICE_EMAILS === "0") {
      console.log(
        "[invoicing] SEND_INVOICE_EMAILS=0 → pomijam sendMail (PDF wygenerowany), order=%s inv=%s",
        updated.id,
        invNumber
      );
      return updated;
    }

    const numberOrId = updated.number || updated.id;
    const apiUrl = process.env.API_URL || "http://localhost:4000";
    const downloadUrl = `${apiUrl}/api/my/orders/${encodeURIComponent(
      numberOrId
    )}/invoice.pdf`;

    const recipient =
      (updated as any).invoiceEmail ||
      (updated as any).shippingEmail ||
      (updated as any).userEmail ||
      updated.user?.email ||
      "";

    console.log("[invoice-mail] candidate", {
      order: numberOrId,
      to: recipient,
      url: downloadUrl,
    });

    if (recipient) {
      await sendMail(
        recipient,
        subjects.invoiceReady({ order: updated, invoiceNumber: invNumber }),
        templates.invoiceReady({
          order: updated,
          invoiceNumber: invNumber,
          downloadUrl, // spójna nazwa w szablonie
        })
      );
      console.log("[invoice-mail] sent OK");
    } else {
      console.warn(
        "[invoicing] brak adresata e-mail do faktury (recipient empty) for order %s",
        updated.id
      );
    }
  } catch (e) {
    console.warn("[invoicing] email send failed:", (e as any)?.message || e);
  }

  return updated;
}
