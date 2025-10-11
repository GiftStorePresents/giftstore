// src/lib/invoice.ts
import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";

export type InvoiceParty = {
  name: string;
  nip?: string | null;
  addr1?: string | null;
  zip?: string | null;
  city?: string | null;
  country?: string | null;
  email?: string | null;
};

export type InvoiceItem = {
  name: string;
  qty: number;
  unitPriceCents: number;
};

export type InvoiceData = {
  invoiceNumber: string;
  issueDate: Date;
  seller: InvoiceParty;
  buyer: InvoiceParty;
  items: InvoiceItem[];
  shippingCents?: number | null;
  surchargeCents?: number | null;
  discountCents?: number | null;
  totalCents: number;
};

function PLN(c?: number | null) {
  return typeof c === "number" ? (c / 100).toFixed(2) + " zł" : "—";
}

/**
 * Generuje PDF na dysk i zwraca ścieżkę względną (np. "invoices/INV-...pdf").
 * assetsDirectory – katalog bazowy (np. "<repo>/storage").
 */
export async function generateInvoicePDF(
  invoice: InvoiceData,
  assetsDirectory = path.resolve(process.cwd(), "storage")
): Promise<string> {
  // upewnij się, że katalog bazowy istnieje
  fs.mkdirSync(assetsDirectory, { recursive: true });

  const invoicesDir = path.join(assetsDirectory, "invoices");
  fs.mkdirSync(invoicesDir, { recursive: true });

  const fileName = `${invoice.invoiceNumber}.pdf`;
  const filePath = path.join(invoicesDir, fileName);

  const doc = new PDFDocument({ size: "A4", margin: 40 });
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  // Nagłówek
  doc.fontSize(18).text("FAKTURA VAT", { align: "right" });
  doc.moveDown(0.2);
  doc.fontSize(12).text(`Nr: ${invoice.invoiceNumber}`, { align: "right" });
  doc.text(
    `Data wystawienia: ${invoice.issueDate.toLocaleDateString("pl-PL")}`,
    { align: "right" }
  );

  doc.moveDown(1.2);

  // Sprzedawca / Nabywca
  doc.fontSize(12).text("Sprzedawca:", { underline: true });
  doc.text(invoice.seller.name);
  if (invoice.seller.nip) doc.text(`NIP: ${invoice.seller.nip}`);
  if (invoice.seller.addr1) doc.text(invoice.seller.addr1);
  doc.text(`${invoice.seller.zip || ""} ${invoice.seller.city || ""}`);
  if (invoice.seller.country) doc.text(invoice.seller.country);
  if (invoice.seller.email) doc.text(`E-mail: ${invoice.seller.email}`);

  doc.moveDown(0.8);
  doc.fontSize(12).text("Nabywca:", { underline: true });
  doc.text(invoice.buyer.name);
  if (invoice.buyer.nip) doc.text(`NIP: ${invoice.buyer.nip}`);
  if (invoice.buyer.addr1) doc.text(invoice.buyer.addr1);
  doc.text(`${invoice.buyer.zip || ""} ${invoice.buyer.city || ""}`);
  if (invoice.buyer.country) doc.text(invoice.buyer.country);
  if (invoice.buyer.email) doc.text(`E-mail: ${invoice.buyer.email}`);

  doc.moveDown(1);

  // Pozycje
  doc.fontSize(12).text("Pozycje:", { underline: true });
  doc.moveDown(0.4);
  invoice.items.forEach((it) => {
    const line = `${it.name}  ×  ${it.qty}  —  ${PLN(it.unitPriceCents)}  /  Razem: ${PLN(
      it.unitPriceCents * it.qty
    )}`;
    doc.text(line);
  });

  doc.moveDown(0.6);
  if (typeof invoice.discountCents === "number" && invoice.discountCents > 0) {
    doc.text(`Rabat: -${PLN(invoice.discountCents)}`);
  }
  if (typeof invoice.shippingCents === "number") {
    doc.text(`Wysyłka: ${PLN(invoice.shippingCents)}`);
  }
  if (typeof invoice.surchargeCents === "number" && invoice.surchargeCents > 0) {
    doc.text(`Dopłata do płatności: ${PLN(invoice.surchargeCents)}`);
  }
  doc.moveDown(0.4);
  doc.font("Helvetica-Bold").text(`Suma do zapłaty: ${PLN(invoice.totalCents)}`);
  doc.font("Helvetica");

  doc.moveDown(1.2);
  doc.fontSize(10).fillColor("#666").text("Dziękujemy za zakupy!", { align: "center" });

  doc.end();

  await new Promise<void>((resolve, reject) => {
    stream.on("finish", () => resolve());
    stream.on("error", (e) => reject(e));
  });

  // zwracamy ścieżkę względną względem assetsDirectory
  return path.join("invoices", fileName).replace(/\\/g, "/");
}
