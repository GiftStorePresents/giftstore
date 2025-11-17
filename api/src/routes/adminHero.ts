// api/src/routes/adminHero.ts
import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { prisma } from "../lib/prisma";

/* Dwa osobne routery:
 * - adminHeroRouter  → montowany pod /api/admin  → /api/admin/hero
 * - publicHeroRouter → montowany pod /api/public → /api/public/hero
 */
const adminHeroRouter: express.Router = express.Router();
const publicHeroRouter: express.Router = express.Router();

/* ============================================
 * Typy i drobna walidacja / sanityzacja
 * ============================================ */
export type HeroPayload = {
  title: string;
  subtitle?: string;
  imageUrl?: string;
  mobileUrl?: string;
  ctaText?: string;
  ctaHref?: string;
  enabled?: boolean;
};

function isObject(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

function str(v: unknown, max = 400): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return s ? s.slice(0, max) : "";
}

function bool(v: unknown): boolean | undefined {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const t = v.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(t)) return true;
    if (["0", "false", "no", "off"].includes(t)) return false;
  }
  return undefined;
}

/* ============================================
 * Domyślna konfiguracja Hero (bezpieczna)
 * ============================================ */
const DEFAULT_HERO: HeroPayload = {
  title: "Najlepsze prezenty na każdą okazję!",
  subtitle:
    "Znajdź coś wyjątkowego dla bliskich — szybka wysyłka, bogata oferta.",
  imageUrl: "/images/pexels-tofros-com-83191-257855.jpg",
  mobileUrl: "/images/pexels-tofros-com-83191-257855.jpg",
  ctaText: "Przeglądaj prezenty",
  ctaHref: "/categories/wszystkie",
  enabled: true,
};

/** Rzutowanie i sanityzacja payloadu */
function sanitizeHeroPayload(input: unknown): HeroPayload {
  const src = isObject(input) ? input : {};
  const out: HeroPayload = {
    title: str(src.title, 200) ?? "",
    subtitle: str(src.subtitle, 600) ?? "",
    imageUrl: str(src.imageUrl, 600),
    mobileUrl: str(src.mobileUrl, 600),
    ctaText: str(src.ctaText, 120) ?? "",
    ctaHref: str(src.ctaHref, 300) ?? "",
    enabled: bool(src.enabled),
  };

  if (!out.title) out.title = DEFAULT_HERO.title;
  if (typeof out.enabled === "undefined") out.enabled = true;

  return out;
}

/** Selektor publicznych pól (bez śmieci) */
function toPublic(v: any): HeroPayload {
  const s = sanitizeHeroPayload(v);
  return {
    title: s.title,
    subtitle: s.subtitle ?? "",
    imageUrl: s.imageUrl ?? "",
    mobileUrl: s.mobileUrl ?? "",
    ctaText: s.ctaText ?? "",
    ctaHref: s.ctaHref ?? "",
    enabled: s.enabled !== false,
  };
}

/* ============================================
 * Auth helper — tylko ADMIN
 * ============================================ */
function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const role = (req as any)?.user?.role;
  if (role !== "ADMIN") {
    return res.status(403).json({ error: "forbidden" });
  }
  next();
}

/* ============================================
 * Helpers: odczyt/zapis w SiteSetting
 * ============================================ */
const KEY = "hero";

async function readHero(): Promise<HeroPayload | null> {
  const row = await prisma.siteSetting.findUnique({ where: { key: KEY } });
  if (!row) return null;
  return toPublic(row.value);
}

async function writeHero(value: HeroPayload): Promise<HeroPayload> {
  const sanitized = toPublic(value);
  const row = await prisma.siteSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: sanitized },
    update: { value: sanitized },
  });
  return toPublic(row.value);
}

/* ============================================
 * ADMIN ROUTES → montowane pod /api/admin
 * finalne ścieżki:
 *   GET    /api/admin/hero
 *   PATCH  /api/admin/hero
 *   PUT    /api/admin/hero
 *   DELETE /api/admin/hero
 *   POST   /api/admin/hero/reset
 * ============================================ */

adminHeroRouter.get("/hero", requireAdmin, async (req: Request, res: Response) => {
  try {
    (req as any).log?.info?.("[adminHero] GET /admin/hero");
    const existing = await readHero();
    return res.json(existing ?? DEFAULT_HERO);
  } catch (e: any) {
    return res.status(500).json({
      error: "failed_to_read_hero",
      details: String(e?.message || e),
    });
  }
});

adminHeroRouter.put("/hero", requireAdmin, async (req: Request, res: Response) => {
  try {
    (req as any).log?.info?.("[adminHero] PUT /admin/hero");
    const next = sanitizeHeroPayload(req.body);
    const saved = await writeHero(next);
    return res.json(saved);
  } catch (e: any) {
    return res.status(500).json({
      error: "failed_to_write_hero",
      details: String(e?.message || e),
    });
  }
});

adminHeroRouter.patch("/hero", requireAdmin, async (req: Request, res: Response) => {
  try {
    (req as any).log?.info?.("[adminHero] PATCH /admin/hero");
    const current = (await readHero()) ?? DEFAULT_HERO;
    const patch = sanitizeHeroPayload({ ...current, ...req.body });
    const saved = await writeHero(patch);
    return res.json(saved);
  } catch (e: any) {
    return res.status(500).json({
      error: "failed_to_patch_hero",
      details: String(e?.message || e),
    });
  }
});

adminHeroRouter.delete("/hero", requireAdmin, async (req: Request, res: Response) => {
  try {
    (req as any).log?.info?.("[adminHero] DELETE /admin/hero");
    await prisma.siteSetting.delete({ where: { key: KEY } }).catch(() => {});
    return res.status(204).end();
  } catch (e: any) {
    return res.status(500).json({
      error: "failed_to_delete_hero",
      details: String(e?.message || e),
    });
  }
});

adminHeroRouter.post("/hero/reset", requireAdmin, async (req: Request, res: Response) => {
  try {
    (req as any).log?.info?.("[adminHero] POST /admin/hero/reset");
    const saved = await writeHero(DEFAULT_HERO);
    return res.json(saved);
  } catch (e: any) {
    return res.status(500).json({
      error: "failed_to_reset_hero",
      details: String(e?.message || e),
    });
  }
});

/* ============================================
 * PUBLIC ROUTES → montowane pod /api/public
 * finalna ścieżka:
 *   GET /api/public/hero
 * ============================================ */

publicHeroRouter.get("/hero", async (req: Request, res: Response) => {
  try {
    (req as any).log?.info?.("[adminHero] GET /public/hero");
    const existing = await readHero();
    const v = existing ?? DEFAULT_HERO;
    if (v.enabled === false) {
      return res.status(404).json({ message: "hero disabled" });
    }
    return res.json(v);
  } catch (e: any) {
    return res.status(500).json({
      error: "failed_to_read_public_hero",
      details: String(e?.message || e),
    });
  }
});

export { adminHeroRouter, publicHeroRouter };
