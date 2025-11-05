// src/pages/AdminHeroPage.tsx
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

/** Domyślny styl/treść Hero (do przywracania jednym kliknięciem) */
const DEFAULT_HERO = {
  title: "Najlepsze prezenty na każdą okazję!",
  subtitle: "Znajdź coś wyjątkowego dla bliskich — szybka wysyłka, bogata oferta.",
  imageUrl: "/images/pexels-tofros-com-83191-257855.jpg",
  mobileUrl: "/images/pexels-tofros-com-83191-257855.jpg",
  ctaText: "Przeglądaj prezenty",
  ctaHref: "/categories/wszystkie",
  enabled: true,
};

/** Bezpieczny fetch JSON (z cichym parsowaniem błędów) */
async function safeFetchJson(url: string, init?: RequestInit) {
  const r = await fetch(url, init);
  const text = await r.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  if (!r.ok) throw new Error(json?.error || json?.message || text || `HTTP ${r.status}`);
  return json ?? {};
}

/** Upload obrazka – próbuje kilka wariantów backendu i różnych nazw pól */
async function uploadHeroImage(file: File): Promise<string> {
  async function send(url: string, field: "file" | "image") {
    const fd = new FormData();
    fd.append(field, file);
    const res = await fetch(url, { method: "POST", credentials: "include", body: fd });
    const txt = await res.text();
    let json: any = null;
    try { json = txt ? JSON.parse(txt) : null; } catch {}
    if (!res.ok) throw new Error(json?.error || json?.message || txt || `HTTP ${res.status}`);

    // akceptuj popularne kształty odpowiedzi
    if (typeof json?.url === "string") return json.url;
    if (Array.isArray(json) && json[0]?.url) return json[0].url;
    if (json?.data?.url) return json.data.url;
    if (json?.files?.[0]?.url) return json.files[0].url;
    const guess = String(json?.url || json?.file || json?.path || "");
    if (guess) return guess;

    throw new Error("Nie udało się odczytać URL z odpowiedzi uploadu.");
  }

  // najpierw common endpoints
  try { return await send("/api/admin/upload", "file"); } catch {}
  try { return await send("/api/admin/uploads", "file"); } catch {}
  try { return await send("/api/admin/image", "file"); } catch {}

  // alternatywne pole
  try { return await send("/api/admin/upload", "image"); } catch {}
  try { return await send("/api/admin/image", "image"); } catch {}

  throw new Error("Brak kompatybilnego endpointu uploadu dla hero. Sprawdź router adminUpload.");
}

type HeroForm = {
  title: string;
  subtitle?: string;
  imageUrl?: string;
  mobileUrl?: string;
  ctaText?: string;
  ctaHref?: string;
  enabled?: boolean;
};

type Category = {
  id: string;
  name: string;
  slug: string;
  showInHero?: boolean;
  _count?: { products: number };
};

export default function AdminHeroPage() {
  const [form, setForm] = useState<HeroForm>({
    title: "",
    subtitle: "",
    imageUrl: "",
    mobileUrl: "",
    ctaText: "",
    ctaHref: "",
    enabled: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [cats, setCats] = useState<Category[]>([]);
  const [filter, setFilter] = useState("");

  // ---- INIT: wczytaj hero (admin widzi zawsze – nawet disabled)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await safeFetchJson("/api/admin/hero", { credentials: "include", cache: "no-store" });
        if (!alive) return;
        setForm({
          title: data.title ?? "",
          subtitle: data.subtitle ?? "",
          imageUrl: data.imageUrl ?? "",
          mobileUrl: data.mobileUrl ?? "",
          ctaText: data.ctaText ?? data.ctaPrimaryLabel ?? "",
          ctaHref: data.ctaHref ?? data.ctaPrimaryTo ?? "",
          enabled: data.enabled !== false,
        });
      } catch {
        // brak rekordu – zaczynamy z pustym formularzem (można od razu kliknąć „Przywróć domyślne”)
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // ---- KATEGORIE do chipów (toggle showInHero)
  async function loadCats() {
    const data = await safeFetchJson("/api/admin/categories", { credentials: "include", cache: "no-store" });
    const arr = Array.isArray(data) ? data : data?.items ?? [];
    setCats(arr as Category[]);
  }
  useEffect(() => { loadCats().catch(()=>{}); }, []);

  const visibleCats = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const source = cats.slice().sort((a, b) => a.name.localeCompare(b.name));
    return q ? source.filter(c => c.name.toLowerCase().includes(q) || c.slug.includes(q)) : source;
  }, [cats, filter]);

  // ---- Handlery
  const onChange = (patch: Partial<HeroForm>) => setForm(prev => ({ ...prev, ...patch }));

  async function save() {
    setSaving(true);
    try {
      if (!form.title.trim()) throw new Error("Tytuł nie może być pusty.");

      const payload: HeroForm = {
        title: form.title.trim(),
        subtitle: form.subtitle?.trim() || "",
        imageUrl: form.imageUrl?.trim() || "",
        mobileUrl: form.mobileUrl?.trim() || "",
        ctaText: form.ctaText?.trim() || "",
        ctaHref: form.ctaHref?.trim() || "",
        enabled: form.enabled !== false,
      };

      await safeFetchJson("/api/admin/hero", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      alert("Zapisano Hero.");
      window.dispatchEvent(new Event("categories:refresh")); // odśwież FE (Hero/chipsy)
    } catch (e: any) {
      alert(e?.message || "Nie udało się zapisać.");
    } finally {
      setSaving(false);
    }
  }

  async function uploadAndSet(field: "imageUrl" | "mobileUrl") {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const url = await uploadHeroImage(file);
        setForm(prev => ({ ...prev, [field]: url }));
      } catch (err: any) {
        alert(err?.message || "Upload nieudany.");
      }
    };
    input.click();
  }

  async function toggleShowInHero(cat: Category, next: boolean) {
    try {
      await safeFetchJson(`/api/admin/categories/${encodeURIComponent(cat.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ showInHero: next }),
      });
      await loadCats();
      window.dispatchEvent(new Event("categories:refresh"));
    } catch (e: any) {
      alert(e?.message || "Nie udało się zmienić ustawienia kategorii.");
    }
  }

  if (loading) return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <h1 className="text-2xl font-bold">Hero — edycja</h1>
      <p className="mt-4 text-sm text-neutral-500">Ładowanie…</p>
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Hero — edycja</h1>
        <Link to="/admin" className="rounded-lg border px-3 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/10">
          ← Powrót do panelu
        </Link>
      </div>

      {/* FORMULARZ */}
      <section className="rounded-2xl border p-4 shadow-sm dark:border-white/10">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (!confirm("Przywrócić domyślne ustawienia Hero?")) return;
              setForm(DEFAULT_HERO);
            }}
            className="rounded-lg border px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/10"
          >
            ↩️ Przywróć domyślne
          </button>

          <button
            type="button"
            onClick={async () => {
              if (!confirm("Ustawić domyślne i zapisać?")) return;
              try {
                await fetch("/api/admin/hero", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  credentials: "include",
                  body: JSON.stringify(DEFAULT_HERO),
                }).then(r => r.ok ? r : Promise.reject(r));
                alert("Ustawiono domyślne.");
                window.dispatchEvent(new Event("categories:refresh"));
              } catch {
                alert("Nie udało się zapisać domyślnych (sprawdź /api/admin/hero).");
              }
            }}
            className="rounded-lg border px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/10"
          >
            💾 Zapisz domyślne
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium">Tytuł</label>
            <input
              value={form.title}
              onChange={(e)=>onChange({ title: e.target.value })}
              className="mt-1 w-full rounded-lg border px-3 py-2 dark:border-white/15 dark:bg-white/5"
              placeholder="Zacznij od uśmiechu 🎁"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm font-medium">Podtytuł</label>
            <textarea
              rows={3}
              value={form.subtitle}
              onChange={(e)=>onChange({ subtitle: e.target.value })}
              className="mt-1 w-full rounded-lg border px-3 py-2 dark:border-white/15 dark:bg-white/5"
              placeholder="Wyjątkowe prezenty z szybką wysyłką"
            />
          </div>

          <div>
            <label className="block text-sm font-medium">CTA — etykieta</label>
            <input
              value={form.ctaText}
              onChange={(e)=>onChange({ ctaText: e.target.value })}
              className="mt-1 w-full rounded-lg border px-3 py-2 dark:border-white/15 dark:bg-white/5"
              placeholder="Przeglądaj prezenty"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">CTA — link</label>
            <input
              value={form.ctaHref}
              onChange={(e)=>onChange({ ctaHref: e.target.value })}
              className="mt-1 w-full rounded-lg border px-3 py-2 dark:border-white/15 dark:bg-white/5"
              placeholder="/categories/wszystkie"
            />
          </div>

          <div>
            <label className="block text-sm font-medium">Obraz — desktop</label>
            <div className="mt-1 flex items-center gap-2">
              <input
                value={form.imageUrl}
                onChange={(e)=>onChange({ imageUrl: e.target.value })}
                className="w-full rounded-lg border px-3 py-2 dark:border-white/15 dark:bg-white/5"
                placeholder="/images/hero/desktop.jpg"
              />
              <button
                type="button"
                onClick={() => uploadAndSet("imageUrl")}
                className="shrink-0 rounded-lg border px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/10"
              >
                📤 Upload
              </button>
            </div>
            {form.imageUrl ? (
              <img src={form.imageUrl} alt="" className="mt-2 h-32 w-full rounded-lg object-cover" />
            ) : null}
          </div>

          <div>
            <label className="block text-sm font-medium">Obraz — mobile</label>
            <div className="mt-1 flex items-center gap-2">
              <input
                value={form.mobileUrl}
                onChange={(e)=>onChange({ mobileUrl: e.target.value })}
                className="w-full rounded-lg border px-3 py-2 dark:border-white/15 dark:bg-white/5"
                placeholder="/images/hero/mobile.jpg"
              />
              <button
                type="button"
                onClick={() => uploadAndSet("mobileUrl")}
                className="shrink-0 rounded-lg border px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/10"
              >
                📤 Upload
              </button>
            </div>
            {form.mobileUrl ? (
              <img src={form.mobileUrl} alt="" className="mt-2 h-32 w-full rounded-lg object-cover" />
            ) : null}
          </div>

          <div className="sm:col-span-2 flex items-center gap-3">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={!!form.enabled}
                onChange={(e)=>onChange({ enabled: e.target.checked })}
              />
              <span className="text-sm">Widoczne publicznie</span>
            </label>

            <button
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-mainRed px-4 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Zapisuję…" : "Zapisz"}
            </button>
          </div>
        </div>
      </section>

      {/* KATEGORIE → chipy w Hero */}
      <section className="mt-8 rounded-2xl border p-4 shadow-sm dark:border-white/10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Chipsy w Hero — wybierz kategorie</h2>
          <div className="flex items-center gap-2">
            <input
              value={filter}
              onChange={(e)=>setFilter(e.target.value)}
              className="w-56 rounded-lg border px-3 py-2 text-sm dark:border-white/15 dark:bg-white/5"
              placeholder="Szukaj kategorii…"
            />
            <button
              onClick={()=>loadCats()}
              className="rounded-lg border px-3 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/10"
            >
              Odśwież
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {visibleCats.map((c) => (
            <label
              key={c.id}
              className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm dark:border-white/10"
            >
              <div className="min-w-0">
                <div className="truncate font-medium">{c.name}</div>
                <div className="truncate text-xs text-neutral-500">
                  {c.slug} {typeof c._count?.products === "number" ? `• ${c._count.products}` : ""}
                </div>
              </div>
              <input
                type="checkbox"
                checked={!!c.showInHero}
                onChange={(e)=>toggleShowInHero(c, e.target.checked)}
                aria-label={`Pokaż ${c.name} w Hero`}
              />
            </label>
          ))}
        </div>
      </section>
    </div>
  );
}