// src/utils/seedCoupons.ts
import fs from "node:fs/promises";
import path from "node:path";

/** Kształt pojedynczego kuponu wyciąganego z seeda. */
export type RawCoupon = {
  code?: unknown;
  type?: unknown;
  percentage?: unknown;
  amount?: unknown;     // grosze
  minOrder?: unknown;   // grosze
  validFrom?: unknown;  // Date | ISO | null
  validTo?: unknown;
  usageLimit?: unknown;
  perUserLimit?: unknown;
  active?: unknown;
};

/* ---------------------------------------------
 *  Robustne czytanie prisma/seed.(ts|js)
 * --------------------------------------------- */
async function tryRead(p: string) {
  try {
    await fs.access(p);
    return await fs.readFile(p, "utf8");
  } catch {
    return null;
  }
}

export function resolveSeedCandidates(): string[] {
  const here = typeof __dirname !== "undefined" ? __dirname : process.cwd();
  const envRaw = (process.env.COUPONS_SEED_FILE || process.env.PRISMA_SEED_FILE || "").trim();
  const envAbs = envRaw ? (path.isAbsolute(envRaw) ? envRaw : path.resolve(process.cwd(), envRaw)) : "";

  const cands: string[] = [
    envAbs,
    path.resolve(process.cwd(), "prisma/seed.ts"),
    path.resolve(process.cwd(), "prisma/seed.js"),
    path.resolve(here, "../../prisma/seed.ts"),
    path.resolve(here, "../../prisma/seed.js"),
    path.resolve(here, "../../../prisma/seed.ts"),
    path.resolve(here, "../../../prisma/seed.js"),
  ].filter(Boolean) as string[];

  // kilka poziomów wyżej – gdy projekt jest odpalony z innego cwd
  let cur = here;
  for (let i = 0; i < 5; i++) {
    cands.push(path.resolve(cur, "prisma/seed.ts"));
    cands.push(path.resolve(cur, "prisma/seed.js"));
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }

  return Array.from(new Set(cands));
}

export async function readPrismaSeedFile(): Promise<{ path: string; text: string; tried: string[] } | null> {
  const tried = resolveSeedCandidates();
  for (const p of tried) {
    const t = await tryRead(p);
    if (t != null) return { path: p, text: t, tried };
  }
  return null;
}

/* ---------------------------------------------
 *  Normalizacja + parser „seed-like”
 * --------------------------------------------- */

/** new Date("...") -> "...", inne new Date(...) -> null, usuń BOM/CRLF i podkreślenia w liczbach */
export function normalizeSeedText(text: string): string {
  let s = String(text || "")
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/new\s+Date\s*\(\s*(['"])(.*?)\1\s*\)/g, '"$2"')
    .replace(/new\s+Date\s*\([^)]*\)/g, "null");
  // 1_000 -> 1000
  s = s.replace(/\b\d[\d_]*\b/g, (substr: string) => substr.replace(/_/g, ""));
  return s;
}

/** Zamiana JS-literal -> JSON (po normalizacji). */
function stringObjectToJson(body: string): any | null {
  let s = String(body)
    .replace(/\/\*[\s\S]*?\*\//g, "") // /* ... */
    .replace(/\/\/.*$/gm, "") // // ...
    .replace(/:\s*undefined/g, ": null")
    .replace(/'/g, '"')
    .replace(/(\w+)\s*:/g, '"$1":')
    .replace(/,\s*}/g, "}")
    .replace(/,\s*]/g, "]");
  try {
    return JSON.parse(`{${s}}`);
  } catch {
    return null;
  }
}

/**
 * Parsuje popularne wzorce z pliku seed:
 *  A) upsertCoupon("CODE", { ... })
 *  B) prisma.coupon.upsert({ where:{ code: 'X' }, create:{...}, update:{...} })
 *  C) prisma.coupon.create({ data:{ ... } })
 *  D) prisma.coupon.createMany({ data:[ {...},{...} ] })
 *  E) luźne bloki: create: { ... }
 */
export function parseSeedCoupons(rawText: string): RawCoupon[] {
  const text = normalizeSeedText(rawText);
  const out: RawCoupon[] = [];

  // E) create: { ... } (luźne wycinki z upsertów)
  {
    const re = /create\s*:\s*{([\s\S]*?)}\s*[),}]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const obj = stringObjectToJson(m[1] as string);
      if (obj) out.push(obj);
    }
  }

  // A) upsertCoupon("CODE", { ... })
  {
    const re = /upsertCoupon\s*\(\s*['"`]([\w\-]+)['"`]\s*,\s*{([\s\S]*?)}\s*\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const code = m[1] as string;
      const body = stringObjectToJson(m[2] as string);
      if (body) out.push({ code, ...body });
    }
  }

  // B) prisma.coupon.upsert({ where:{ code:'X' }, create:{...}, update:{...} })
  {
    const re =
      /prisma\.coupon\.upsert\s*\(\s*{[\s\S]*?where\s*:\s*{[\s\S]*?code\s*:\s*(['"`])([\w\-]+)\1[\s\S]*?}\s*,[\s\S]*?create\s*:\s*{([\s\S]*?)}[\s\S]*?}\s*\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const code = m[2] as string;
      const body = stringObjectToJson(m[3] as string);
      if (body) out.push({ code, ...body });
    }
  }

  // C) prisma.coupon.create({ data:{ ... } })
  {
    const re = /prisma\.coupon\.create\s*\(\s*{[\s\S]*?data\s*:\s*{([\s\S]*?)}[\s\S]*?}\s*\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const body = stringObjectToJson(m[1] as string);
      if (body) out.push(body);
    }
  }

  // D) prisma.coupon.createMany({ data:[ {...},{...} ] })
  {
    const re = /prisma\.coupon\.createMany\s*\(\s*{[\s\S]*?data\s*:\s*\[([\s\S]*?)\][\s\S]*?}\s*\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const rawArrayBody = m[1] as string;

      // Zamień na JSON-ową tablicę
      const arrText =
        "[" +
        rawArrayBody
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/\/\/.*$/gm, "")
          .replace(/(\w+)\s*:/g, '"$1":')
          .replace(/'/g, '"')
          .replace(/,\s*}/g, "}")
          .replace(/,\s*]/g, "]") +
        "]";

      try {
        const parsed: unknown = JSON.parse(arrText);
        if (Array.isArray(parsed)) {
          // upewnij się, że to tablica obiektów
          (parsed as unknown[]).forEach((obj) => {
            if (obj && typeof obj === "object") out.push(obj as RawCoupon);
          });
        }
      } catch {
        // ignoruj błędną sekcję
      }
    }
  }

  return out;
}
