// src/pages/AdminProductDetailsPage.tsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, API_BASE, ensureCsrf } from "../api";

/* ===============================================
   Typy zgodne z backendem (defensywnie)
================================================= */
type Category = {
  id: string;
  name: string;
  slug: string;
};

type Variant = {
  id: string;
  sku?: string | null;
  priceCents?: number | null;
  stock?: number | null;
  color?: string | null;
  size?: string | null;
  personalize?: boolean | null;

  // ✅ NOWE: pola rabatu
  discountActive?: boolean | null;
  salePriceCents?: number | null;
  showDiscountPercent?: boolean | null;
};

type Media = {
  id: string;
  url: string; // absolutny lub względny
  kind?: "image" | "video" | "spin360";
  position?: number;
};

type AdminProduct = {
  id: string;
  slug: string;
  name: string;
  brand?: string | null;
  description?: string | null;

  // U niektórych endpointów masz „price” (zł) jako number — zostawiamy:
  price?: number | null;

  // Najczęściej jednak cena jest w wariantach:
  variants?: Variant[];

  // Kategoria jako id…
  categoryId?: string | null;

  // …lub relacja:
  category?: { id: string; name: string; slug: string } | null;

  // Media (jeśli API je zwraca)
  media?: Media[];

  createdAt?: string;
  updatedAt?: string;
};

/* ===============================================
   Pomocnicze
================================================= */
function getCookie(name: string) {
  return (
    document.cookie.split("; ").find((row) => row.startsWith(name + "="))?.split("=")[1] || ""
  );
}

async function readError(res: Response) {
  try {
    const txt = await res.text();
    try {
      const json = JSON.parse(txt);
      return json?.error || json?.message || txt || `HTTP ${res.status}`;
    } catch {
      return txt || `HTTP ${res.status}`;
    }
  } catch {
    return `HTTP ${res.status}`;
  }
}

function asPlDateTime(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pl-PL");
}

// ✅ helper: efektywna cena wariantu (z rabatem)
function effectiveCents(v?: Variant | null): number | null {
  if (!v) return null;
  const hasSale = !!v.discountActive && typeof v.salePriceCents === "number";
  if (hasSale) return v.salePriceCents as number;
  return typeof v.priceCents === "number" ? (v.priceCents as number) : null;
}

// ✅ poprawione: używamy efektywnej ceny (rabat > zwykła)
function computeMinPriceZl(product?: AdminProduct): string {
  // 1) Jeśli backend daje price (w zł) i nie masz wariantów — pokaż:
  if (
    typeof product?.price === "number" &&
    Number.isFinite(product.price) &&
    (!product?.variants || product.variants.length === 0)
  ) {
    return `${product.price.toFixed(2)} zł`;
  }

  // 2) Minimalna cena z wariantów — liczymy efektywną (sale jeśli aktywne)
  const eff = (product?.variants || [])
    .map((v) => effectiveCents(v))
    .filter((n): n is number => typeof n === "number");

  if (eff.length) {
    const min = Math.min(...eff);
    return `${(min / 100).toFixed(2)} zł`;
  }

  return "—";
}

function imgSrc(url: string) {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  return `${API_BASE}${url.startsWith("/") ? url : `/${url}`}`;
}

/* ===============================================
   API (lokalne, oparte na fetch) z CSRF & cookies
================================================= */
function useAdminApi() {
  const categories = useCallback(async (): Promise<Category[]> => {
    const r = await fetch(`${API_BASE}/api/admin/categories`, {
      credentials: "include",
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
    return Array.isArray(data) ? data : (data?.items ?? []); // dopuszczamy oba kształty
  }, []);

  const product = useCallback(async (id: string): Promise<AdminProduct> => {
    const r = await fetch(`${API_BASE}/api/admin/products/${encodeURIComponent(id)}`, {
      credentials: "include",
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error || "Nie znaleziono produktu");

    // Obsłuż różne „shape” odpowiedzi (product / data.product / surowy obiekt)
    if (data?.product && typeof data.product === "object") return data.product as AdminProduct;
    if (data?.data?.product && typeof data.data.product === "object") {
      return data.data.product as AdminProduct;
    }
    if (data && typeof data === "object" && "id" in data && "slug" in data && "name" in data) {
      return data as AdminProduct;
    }
    throw new Error("Nieprawidłowy format odpowiedzi API (product).");
  }, []);

  // istniejący endpoint „reassign” (masowy); tutaj używamy z 1 id
  const reassign = useCallback(async (categoryId: string, productIds: string[]) => {
    await ensureCsrf();
    const csrf = getCookie("csrf") || getCookie("XSRF-TOKEN");
    const r = await fetch(
      `${API_BASE}/api/admin/categories/${encodeURIComponent(categoryId)}/reassign`,
      {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf,
        },
        body: JSON.stringify({ productIds }),
      }
    );
    if (!r.ok) throw new Error(await readError(r));
    const data = await r.json().catch(() => ({}));
    return data;
  }, []);

  return { categories, product, reassign };
}

/* ===============================================
   Strona
================================================= */
export default function AdminProductDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const apiLocal = useAdminApi();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [product, setProduct] = useState<AdminProduct | null>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [targetCat, setTargetCat] = useState<string>("");

  const created = useMemo(() => asPlDateTime(product?.createdAt), [product?.createdAt]);
  const updated = useMemo(() => asPlDateTime(product?.updatedAt), [product?.updatedAt]);
  const minPriceLabel = useMemo(() => computeMinPriceZl(product || undefined), [product]);

  const currentCategoryLabel = useMemo(() => {
    if (product?.category?.name) {
      return `${product.category.name} (${product.category.slug})`;
    }
    if (product?.categoryId) {
      const c = cats.find((x) => x.id === product.categoryId);
      return c ? `${c.name} (${c.slug})` : "— brak —";
    }
    return "— brak —";
  }, [product?.category, product?.categoryId, cats]);

  useEffect(() => {
    if (!id) {
      navigate("/admin");
      return;
    }
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const [p, c] = await Promise.all([apiLocal.product(id), apiLocal.categories()]);
        if (!mounted) return;
        setProduct(p);
        setCats(c);
        setTargetCat(p.categoryId || p.category?.id || ""); // domyślnie: aktualna kategoria
      } catch (e: any) {
        alert(e?.message || "Błąd wczytywania produktu");
        navigate("/admin");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleSaveCategory = async () => {
    if (!product?.id || !targetCat) return;
    setSaving(true);
    try {
      await apiLocal.reassign(targetCat, [product.id]);
      // odśwież produkt po przypięciu
      const fresh = await apiLocal.product(product.id);
      setProduct(fresh);
      alert("Zapisano kategorię.");
    } catch (e: any) {
      alert(e?.message || "Nie udało się zapisać kategorii.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Szczegóły produktu</h1>
          <Link
            to="/admin"
            className="rounded-lg border px-3 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/10"
          >
            ← Powrót do panelu
          </Link>
        </div>
        <div className="rounded-2xl border p-4 shadow-sm dark:border-white/10">Ładowanie…</div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Szczegóły produktu</h1>
          <Link
            to="/admin"
            className="rounded-lg border px-3 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/10"
          >
            ← Powrót do panelu
          </Link>
        </div>
        <div className="rounded-2xl border p-4 shadow-sm dark:border-white/10">
          Nie znaleziono produktu.
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Szczegóły produktu</h1>
        <Link
          to="/admin"
          className="rounded-lg border px-3 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/10"
        >
          ← Powrót do panelu
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {/* LEFT: karta info */}
        <section className="md:col-span-2 rounded-2xl border p-4 shadow-sm dark:border-white/10">
          <h2 className="mb-3 text-lg font-semibold">Informacje podstawowe</h2>

          <div className="space-y-3">
            <div>
              <div className="text-xs uppercase text-neutral-500">Nazwa</div>
              <div className="text-base font-medium">{product.name || "—"}</div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <div className="text-xs uppercase text-neutral-500">Slug</div>
                <div className="text-sm text-neutral-800 dark:text-neutral-200">
                  {product.slug || "—"}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase text-neutral-500">Marka</div>
                <div className="text-sm text-neutral-800 dark:text-neutral-200">
                  {product.brand || "—"}
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <div className="text-xs uppercase text-neutral-500">Cena (min)</div>
                <div className="text-sm text-neutral-800 dark:text-neutral-200">
                  {minPriceLabel}
                </div>
              </div>

              <div>
                <div className="text-xs uppercase text-neutral-500">ID produktu</div>
                <div className="text-sm text-neutral-800 dark:text-neutral-200">
                  {product.id}
                </div>
              </div>
            </div>

            <div>
              <div className="text-xs uppercase text-neutral-500">Opis</div>
              <div className="whitespace-pre-wrap text-sm text-neutral-800 dark:text-neutral-200">
                {product.description?.trim() || "—"}
              </div>
            </div>

            {/* Media (jeśli są) */}
            {Array.isArray(product.media) && product.media.length > 0 && (
              <div>
                <div className="mb-2 text-xs uppercase text-neutral-500">Obrazki</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {product.media.map((m) => (
                    <div key={m.id} className="rounded-lg overflow-hidden border dark:border-white/10">
                      <img
                        src={imgSrc(m.url)}
                        alt=""
                        className="w-full aspect-square object-cover"
                        loading="lazy"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* RIGHT: kategoria + akcje */}
        <section className="rounded-2xl border p-4 shadow-sm dark:border-white/10">
          <h2 className="mb-3 text-lg font-semibold">Kategoria</h2>

          <div className="mb-3">
            <div className="text-xs uppercase text-neutral-500">Aktualna</div>
            <div className="text-sm">{currentCategoryLabel}</div>
          </div>

          <label className="mb-1 block text-sm font-medium">Ustaw kategorię</label>
          <select
            className="mb-3 w-full rounded-lg border px-3 py-2 text-sm dark:border-white/15 dark:bg-white/5"
            value={targetCat}
            onChange={(e) => setTargetCat(e.target.value)}
          >
            <option value="">— wybierz kategorię —</option>
            {cats
              .slice()
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>

          <button
            onClick={handleSaveCategory}
            disabled={!targetCat || saving}
            className="w-full rounded-lg bg-black px-4 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50 dark:bg-mainRed"
          >
            {saving ? "Zapisuję…" : "Zapisz kategorię"}
          </button>

          <div className="mt-4 text-xs text-neutral-600 dark:text-neutral-400">
            <div>Utworzono: {created}</div>
            <div>Aktualizacja: {updated}</div>
          </div>

          <div className="mt-4">
            <Link
              to={`/product/${product.slug}`}
              className="inline-flex items-center rounded-lg border px-3 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/10"
              target="_blank"
              rel="noreferrer"
            >
              Podgląd na sklepie ↗
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
