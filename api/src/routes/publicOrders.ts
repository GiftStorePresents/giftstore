// api/src/routes/publicOrders.ts
import { Router, type Request, type Response } from "express";
import { prisma } from "../lib/prisma";
import { ok, fail } from "../lib/http";
import { sendMail } from "../lib/mailer";

const router: Router = Router();

/** Prosta numeracja: ORD-YYYYMMDD-XXXX */
function genOrderNumber(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `ORD-${y}${m}${day}-${rand}`;
}

type CreateOrderItem =
  | { variantId: string; qty: number; slug?: never }
  | { slug: string; qty: number; variantId?: never };

type CreateOrderBody = {
  email: string;
  name?: string;

  items: CreateOrderItem[];

  // Kwoty w groszach – jeśli FE je wyśle, użyjemy; w innym razie przeliczymy.
  subtotalCents?: number;
  shippingCents?: number;
  discountCents?: number;
  paymentSurchargeCents?: number;
  totalCents?: number;

  // Adres (minimalny)
  shippingName?: string;
  shippingAddr1?: string;
  shippingCity?: string;
  shippingZip?: string;
  shippingCountry?: string;

  // (opcjonalnie – mogą być na froncie, ale NIE zapisujemy ich, jeśli nie ma pól w schema.prisma)
  shippingMethod?: string;
  paymentMethod?: string;

  // --- FAKTURA ---
  invoiceRequested?: boolean;
  invoiceCompanyName?: string | null;
  invoiceNip?: string | null;
  invoiceAddr1?: string | null;
  invoiceCity?: string | null;
  invoiceZip?: string | null;
  invoiceCountry?: string | null;
  invoiceEmail?: string | null;
};

router.post("/", async (req: Request, res: Response) => {
  try {
    const body = req.body as Partial<CreateOrderBody> | undefined;

    const email = (body?.email || "").toString().trim().toLowerCase();
    const name = (body?.name || "").toString().trim();
    if (!email) return fail(res, 400, "Email is required");

    const rawItems: CreateOrderItem[] = Array.isArray(body?.items) ? body!.items : [];
    if (!rawItems.length) return fail(res, 400, "items is required");

    // Użytkownik (gość albo istniejący)
    const user = await prisma.user.upsert({
      where: { email },
      create: { email, name: name || null },
      update: name ? { name } : {},
    });

    // Rozwiąż pozycje do wariantów/produktów i przygotuj snapshoty
    type Resolved = {
      qty: number;
      priceCents: number;        // wymagane przez schema
      sku: string | null;        // snapshot SKU (null, nie undefined)
      name: string;              // snapshot nazwy produktu
      category: string | null;   // snapshot kategorii (np. slug)
      productId: string | null;
      variantId: string | null;
      slug?: string | null;      // tylko do e-maila (opcjonalnie)
    };

    const resolved: Resolved[] = [];

    for (const it of rawItems) {
      const qty = Math.max(1, Number(it.qty || 0));
      if (!qty) continue;

      // 🔹 ŚCIEŻKA: variantId
      if ("variantId" in it && it.variantId) {
        const variant = await prisma.variant.findUnique({
          where: { id: it.variantId },
          include: {
            // ✅ nowa nazwa relacji: product + category
            product: {
              include: {
                category: true,
              },
            },
          },
        });

        if (!variant || !variant.product) {
          return fail(res, 400, `Variant not found: ${it.variantId}`);
        }

        const product = variant.product;
        const categorySlug = product.category ? product.category.slug : null;

        resolved.push({
          qty,
          priceCents: variant.priceCents,
          sku: variant.sku ?? null,
          name: product.name,
          category: categorySlug, // snapshot kategorii (slug)
          productId: product.id,
          variantId: variant.id,
          slug: product.slug ?? null,
        });
      }
      // 🔹 ŚCIEŻKA: slug produktu
      else if ("slug" in it && it.slug) {
        const product = await prisma.product.findUnique({
          where: { slug: it.slug },
          include: {
            variants: { orderBy: { priceCents: "asc" } },
            category: true, // ✅ potrzebne, żeby mieć product.category
          },
        });
        if (!product) return fail(res, 400, `Product not found: ${it.slug}`);
        const variant = product.variants[0];
        if (!variant) return fail(res, 400, `No variant for product: ${it.slug}`);

        const categorySlug = product.category ? product.category.slug : null;

        resolved.push({
          qty,
          priceCents: variant.priceCents,
          sku: variant.sku ?? null,
          name: product.name,
          category: categorySlug,
          productId: product.id,
          variantId: variant.id,
          slug: product.slug ?? null,
        });
      } else {
        return fail(res, 400, "Each item must have variantId or slug");
      }
    }

    if (!resolved.length) return fail(res, 400, "No valid items");

    // Sumy (fallback, jeśli FE nie podało)
    const subtotalAuto = resolved.reduce((s, r) => s + r.priceCents * r.qty, 0);

    const subtotalCents =
      Number.isFinite(body?.subtotalCents) ? Number(body!.subtotalCents) : subtotalAuto;

    const shippingCents =
      Number.isFinite(body?.shippingCents) ? Number(body!.shippingCents) : 0;

    const discountCents =
      Number.isFinite(body?.discountCents) ? Number(body!.discountCents) : 0;

    const paymentSurchargeCents =
      Number.isFinite(body?.paymentSurchargeCents) ? Number(body!.paymentSurchargeCents) : 0;

    // total = sub - discount + shipping + surcharge (chyba że FE podał total)
    const totalCalc = subtotalCents - discountCents + shippingCents + paymentSurchargeCents;
    const totalCents =
      Number.isFinite(body?.totalCents) ? Number(body!.totalCents) : totalCalc;

    // Adres / kontakt
    const shippingName =
      (body?.shippingName || "").toString().trim() || name || email;
    const shippingAddr1 = (body?.shippingAddr1 || "(z profilu)").toString().trim();
    const shippingCity = (body?.shippingCity || "-").toString().trim();
    const shippingZip = (body?.shippingZip || "-").toString().trim();
    const shippingCountry = (body?.shippingCountry || "PL").toString().trim();

    // --- FAKTURA: tylko jeśli klient zaznaczył
    const invoiceRequested = body?.invoiceRequested === true;

    if (invoiceRequested) {
      // Minimalna walidacja – tak jak na froncie
      if (
        !body?.invoiceCompanyName ||
        !body?.invoiceAddr1 ||
        !body?.invoiceCity ||
        !body?.invoiceZip
      ) {
        return fail(res, 400, "Missing required invoice fields");
      }
    }

    // Zapis zamówienia + pozycje (snapshoty)
    const created = await prisma.order.create({
      data: {
        number: genOrderNumber(),
        status: "PENDING",
        userId: user.id,

        subtotalCents,
        shippingCents,
        discountCents,
        paymentSurchargeCents,
        totalCents,

        // dane wysyłki/kontaktowe
        shippingName,
        shippingAddr1,
        shippingCity,
        shippingZip,
        shippingCountry,
        shippingEmail: email,

        // --- ZAPIS PÓL FAKTURY ---
        invoiceRequested: invoiceRequested,
        invoiceCompanyName: invoiceRequested ? (body?.invoiceCompanyName || null) : null,
        invoiceNip: invoiceRequested ? (body?.invoiceNip || null) : null,
        invoiceAddr1: invoiceRequested ? (body?.invoiceAddr1 || null) : null,
        invoiceCity: invoiceRequested ? (body?.invoiceCity || null) : null,
        invoiceZip: invoiceRequested ? (body?.invoiceZip || null) : null,
        invoiceCountry: invoiceRequested ? (body?.invoiceCountry || "PL") : null,
        invoiceEmail: invoiceRequested ? (body?.invoiceEmail || email) : null,

        // pozycje (snapshot)
        items: {
          create: resolved.map((r) => ({
            name: r.name,             // snapshot – wymagane w schema
            sku: r.sku ?? null,       // null zamiast undefined
            category: r.category,     // snapshot kategorii (slug)
            qty: r.qty,
            priceCents: r.priceCents, // wymagane w schema
            productId: r.productId,   // mogą być null
            variantId: r.variantId,   // mogą być null
          })),
        },
      },
      select: { id: true, number: true, createdAt: true },
    });

    // ===== E-mail (best-effort) =====
    const listHtml = resolved
      .map((r) => {
        const lineTotal = (r.priceCents * r.qty) / 100;
        const cat = r.category ? `, ${r.category}` : "";
        const sku = r.sku ? ` <small>[${r.sku}]</small>` : "";
        const slug = r.slug ? ` /${r.slug}` : "";
        return `<li>${r.name}${cat}${sku}${slug} × ${r.qty} — ${lineTotal.toFixed(
          2
        )} zł</li>`;
      })
      .join("");

    const summaryHtml = `
      <p>Dziękujemy za zamówienie <b>${created.number}</b>.</p>
      <ul>${listHtml}</ul>
      <p><b>Suma:</b> ${(totalCents / 100).toFixed(2)} zł</p>
      <p>Dostawa: ${shippingName}, ${shippingAddr1}, ${shippingZip} ${shippingCity}</p>
      ${
        invoiceRequested
          ? `<p>✅ Poprosiłeś o fakturę – wyślemy ją po zaksięgowaniu płatności.</p>`
          : ""
      }
    `;

    try {
      await sendMail(email, `Potwierdzenie zamówienia ${created.number}`, summaryHtml);
      if (process.env.ADMIN_ORDER_EMAIL) {
        await sendMail(
          process.env.ADMIN_ORDER_EMAIL,
          `Nowe zamówienie ${created.number}`,
          `<p>Nowe zamówienie od ${email}.</p>${summaryHtml}`
        );
      }
    } catch (mailErr) {
      // nie blokujemy zamówienia, jeżeli e-mail się wysypie
      console.warn("[orders:create] mail error:", (mailErr as Error)?.message);
    }

    return ok(res, { ok: true, order: created });
  } catch (e: any) {
    console.error("[orders:create] error:", e);
    return fail(res, 500, e?.message || "Failed to create order");
  }
});

export default router;
export { router };
