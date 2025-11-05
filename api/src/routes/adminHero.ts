// api/src/routes/adminHero.ts
import { Router, type Request, type Response, type NextFunction } from "express";
import { prisma } from "../lib/prisma";

const router: Router = Router();

/* ============================================
 * Domyślna, „bezpieczna” konfiguracja Hero
 * ============================================ */
const DEFAULT_HERO: HeroPayload = {
  title: "Najlepsze prezenty na każdą okazję!",
  subtitle: "Znajdź coś wyjątkowego dla bliskich — szybka wysyłka, bogata oferta.",
  imageUrl: "/images/pexels-tofros-com-83191-257855.jpg",
  mobileUrl: "/images/pexels-tofros-com-83191-257855.jpg",
  ctaText: "Przeglądaj prezenty",
  ctaHref: "/categories/wszystkie",
  enabled: true,
};

/* ============================================
 * Typy i mała walidacja / sanityzacja
 * ============================================ */
type HeroPayload = {
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

/** rzutowanie i sanityzacja payloadu */
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

  // tytuł obowiązkowy
  if (!out.title) out.title = DEFAULT_HERO.title;

  // domyślny enabled = true
  if (typeof out.enabled === "undefined") out.enabled = true;

  return out;
}

/** Selektor wyłącznie publicznych pól */
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
 * Auth helper
 * ============================================ */
function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const role = (req as any)?.user?.role;
  if (role !== "ADMIN") return res.status(403).json({ error: "forbidden" });
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
 * ADMIN: odczyt pełnego payloadu (zawsze coś zwróć)
 * ============================================ */
router.get("/admin/hero", requireAdmin, async (_req, res) => {
  try {
    const existing = await readHero();
    // Zwróć istniejące albo domyślne (żeby formularz nigdy nie był „pusty”)
    return res.json(existing ?? DEFAULT_HERO);
  } catch (e: any) {
    return res.status(500).json({ error: "failed_to_read_hero", details: String(e?.message || e) });
  }
});

/* ============================================
 * ADMIN: PUT — zapis pełny
 * ============================================ */
router.put("/admin/hero", requireAdmin, async (req, res) => {
  try {
    const next = sanitizeHeroPayload(req.body);
    const saved = await writeHero(next);
    return res.json(saved);
  } catch (e: any) {
    return res.status(500).json({ error: "failed_to_write_hero", details: String(e?.message || e) });
  }
});

/* ============================================
 * ADMIN: PATCH — częściowa aktualizacja (merge)
 * ============================================ */
router.patch("/admin/hero", requireAdmin, async (req, res) => {
  try {
    const current = (await readHero()) ?? DEFAULT_HERO;
    const patch = sanitizeHeroPayload({ ...current, ...req.body });
    const saved = await writeHero(patch);
    return res.json(saved);
  } catch (e: any) {
    return res.status(500).json({ error: "failed_to_patch_hero", details: String(e?.message || e) });
  }
});

/* ============================================
 * ADMIN: DELETE — usuń wpis (publiczny endpoint wróci do default)
 * ============================================ */
router.delete("/admin/hero", requireAdmin, async (_req, res) => {
  try {
    await prisma.siteSetting.delete({ where: { key: KEY } }).catch(() => {});
    return res.status(204).end();
  } catch (e: any) {
    return res.status(500).json({ error: "failed_to_delete_hero", details: String(e?.message || e) });
  }
});

/* ============================================
 * ADMIN: RESET — ustaw domyślne i zapisz
 * ============================================ */
router.post("/admin/hero/reset", requireAdmin, async (_req, res) => {
  try {
    const saved = await writeHero(DEFAULT_HERO);
    return res.json(saved);
  } catch (e: any) {
    return res.status(500).json({ error: "failed_to_reset_hero", details: String(e?.message || e) });
  }
});

/* ============================================
 * PUBLIC: pokaż hero (default jeśli brak wpisu)
 * - jeśli enabled === false → 404 (ukryj sekcję)
 * ============================================ */
router.get("/public/hero", async (_req, res) => {
  try {
    const existing = await readHero();
    const v = existing ?? DEFAULT_HERO;
    if (v.enabled === false) return res.status(404).json({ message: "hero disabled" });
    return res.json(v);
  } catch (e: any) {
    return res.status(500).json({ error: "failed_to_read_public_hero", details: String(e?.message || e) });
  }
});

export default router;
