import { Router, type Request, type Response } from "express";
import path from "path";
import fs from "fs/promises";
import { randomUUID } from "crypto";
import { prisma } from "../lib/prisma";
import { popularGiftsData } from "../seed/popularGiftsData";

function normalizeCategory(input?: string | null, tags?: string[] | null): string {
  const map = new Map<string, string>([
    ["dla niej", "dla-niej"],
    ["dla-niej", "dla-niej"],
    ["dla niego", "dla-niego"],
    ["dla-niego", "dla-niego"],
    ["dla dzieci", "dla-dzieci"],
    ["dla-dzieci", "dla-dzieci"],
    ["dla mamy", "dla-mamy"],
    ["dla-mamy", "dla-mamy"],
    ["dla taty", "dla-taty"],
    ["dla-taty", "dla-taty"],
    ["na urodziny", "na-urodziny"],
    ["na-urodziny", "na-urodziny"],
    ["urodziny", "na-urodziny"],
  ]);
  const pick = (v?: string | null) => map.get(String(v || "").toLowerCase().trim());
  const byField = pick(input);
  if (byField) return byField;
  for (const t of tags || []) {
    const m = pick(t);
    if (m) return m;
  }
  return "inne";
}

async function downloadImageToUploads(srcUrl: string, uploadsDir: string): Promise<string> {
  const src = String(srcUrl || "");
  if (!src) throw new Error("Brak adresu obrazka (srcUrl).");

  const r = await fetch(src);
  if (!r.ok) {
    throw new Error(`Nie udało się pobrać obrazka: ${src} -> ${r.status} ${r.statusText}`);
  }

  const ab = await r.arrayBuffer();
  const buf = Buffer.from(ab);

  const cleanNoQuery = (String(src).split("?")[0] ?? "");
  const clean = (cleanNoQuery.split("#")[0] ?? "");
  const extMatch = clean.match(/\.(jpe?g|png|webp|gif|avif)$/i);
  const ext = extMatch ? extMatch[0] : ".jpg";

  const filename = `seed_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`;
  const abs = path.join(uploadsDir, filename);

  await fs.mkdir(uploadsDir, { recursive: true });
  await fs.writeFile(abs, buf);

  return `/uploads/${filename}`;
}

async function findProductBySlug(slug: string): Promise<null | { id: string }> {
  if (!slug) return null;
  const p = await prisma.product.findUnique({ where: { slug }, select: { id: true } });
  return p ?? null;
}

const router: Router = Router();

/** POST /api/admin/seed/popular */
router.post("/seed/popular", async (_req: Request, res: Response) => {
  try {
    const created: Array<{ id: string; slug: string }> = [];
    const uploadsRoot = path.resolve(process.cwd(), "uploads");

    for (const raw of popularGiftsData) {
      const priceCents =
        typeof (raw as any).priceCents === "number"
          ? (raw as any).priceCents
          : Math.round(Number((raw as any).price ?? 0) * 100);

      const imageUrl: string | undefined =
        (raw as any).imageUrl || (raw as any).image || undefined;

      const slug: string = String((raw as any).slug || "").trim();
      if (!slug) continue;

      const exists = await findProductBySlug(slug);
      if (exists) continue;

      const categorySlug = normalizeCategory((raw as any).category ?? null, (raw as any).tags);

      const product = await prisma.product.create({
        data: {
          name: String((raw as any).name ?? "").trim() || "Produkt",
          slug,
          description: String((raw as any).description ?? ""),
          brand: (raw as any).brand ? String((raw as any).brand) : null,
          category: categorySlug,
          featured: !!(raw as any).featured,
        },
        select: { id: true },
      });

      const sku =
        (raw as any).sku ||
        (slug ? slug.toUpperCase() : randomUUID());

      await prisma.variant.create({
        data: {
          productId: product.id,
          sku,
          priceCents: Number(priceCents || 0),
          stock: (raw as any).stock ?? 100,
          color: (raw as any).color || null,
          size: (raw as any).size || null,
          personalize: !!(raw as any).personalize,
        },
      });

      if (imageUrl) {
        try {
          const relUrl = await downloadImageToUploads(imageUrl, uploadsRoot);
          await prisma.media.create({
            data: { productId: product.id, url: relUrl, kind: "image", position: 0 },
          });
        } catch (e: any) {
          console.error("[seed image] error:", e?.message || e);
        }
      }

      created.push({ id: product.id, slug });
    }

    return res.json({ ok: true, createdCount: created.length, created });
  } catch (e: any) {
    console.error("[seed popular] error:", e);
    return res.status(500).json({ ok: false, error: e?.message || "Seed failed" });
  }
});

export default router;
