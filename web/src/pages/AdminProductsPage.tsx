// src/pages/AdminProductsPage.tsx
// =================================================================================================
//  AdminProductsPage — produkcyjny panel zarządzania produktami
//  Build: 2025-10-30 (prod)  |  Patch: 2025-11-02
//  Zmiany (patch):
//   • Modale mają max-h i wewnętrzny scroll (max-h-[90vh]/[85vh] + overflow-y-auto + shadow)
//   • Naprawa podglądu obrazka (bez podwójnego buildImageUrl)
// =================================================================================================

import { useEffect, useRef, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { api, API_BASE, ensureCsrf } from "../api";
import { createPortal } from "react-dom";

/* ================================================================================================
   Typy
================================================================================================ */
type VariantRow = {
  id: string;
  priceCents: number;
  stock: number;
  sku?: string | null;
  color?: string | null;
  size?: string | null;
  personalize?: boolean | null;
};

type MediaRow = {
  id: string;
  url: string;
  kind: "image" | "video" | "spin360";
  position: number;
};

type CategoryRel = { id: string; name: string; slug: string };
type CategoryField = CategoryRel | string | null | undefined;

type ProductRow = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  brand?: string | null;
  category?: CategoryField;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  variants: VariantRow[];
  media?: MediaRow[];
  featured?: boolean;
  // Fallbacki obrazu (np. z seeda lub starszego API)
  imageUrl?: string;
  image?: string;
};

/* ================================================================================================
   Utils
================================================================================================ */

function computeMinPrice(variants: VariantRow[] | undefined | null): number | null {
  if (!Array.isArray(variants) || variants.length === 0) return null;
  const vals = variants.map((v) => v?.priceCents).filter((n): n is number => typeof n === "number");
  if (!vals.length) return null;
  return Math.min(...vals);
}

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

function coerceCategorySlug(category: CategoryField): string {
  if (!category) return "";
  if (typeof category === "string") return category;
  if (typeof category === "object" && (category as any)?.slug) return (category as any).slug;
  return "";
}

function pickProductShape(res: any, wantedId?: string): ProductRow | null {
  if (res?.product && typeof res.product === "object") return res.product as ProductRow;
  if (res?.data?.product && typeof res.data.product === "object") return res.data.product as ProductRow;
  if (res && typeof res === "object" && "id" in res && "name" in res && "slug" in res) {
    return res as ProductRow;
  }
  if (Array.isArray(res?.items)) {
    if (wantedId) {
      const found = res.items.find((x: any) => x?.id === wantedId);
      if (found) return found as ProductRow;
    }
    if (res.items.length) return res.items[0] as ProductRow;
  }
  return null;
}

// Buduje pełny URL dla miniatur (API_BASE dla ścieżek względnych)
function buildImageUrl(u?: string): string {
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  return `${API_BASE}${u.startsWith("/") ? u : `/${u}`}`;
}

/* ================================================================================================
   Upload obrazków — fallback końcówek i nazw pól
================================================================================================ */
async function uploadProductImageDirect(productId: string, file: File) {
  await ensureCsrf();
  const csrf = getCookie("csrf") || getCookie("XSRF-TOKEN");

  const sendOnce = async (suffix: "/upload-image" | "/images", field: "file" | "image") => {
    const fd = new FormData();
    fd.append(field, file);
    const url = `${API_BASE}/api/admin/products/${encodeURIComponent(productId)}${suffix}`;
    return fetch(url, {
      method: "POST",
      credentials: "include",
      headers: { "X-CSRF-Token": csrf },
      body: fd,
    });
  };

  let lastSuffix: "/upload-image" | "/images" = "/upload-image";
  let res = await sendOnce(lastSuffix, "file");

  if (res.status === 404 || res.status === 405) {
    lastSuffix = "/images";
    res = await sendOnce(lastSuffix, "file");
  }
  if (res.status === 400 || res.status === 415) {
    res = await sendOnce(lastSuffix, "image");
  }

  if (!res.ok) throw new Error(await readError(res));
  const data = await res.json().catch(() => ({}));
  return data;
}

/* ================================================================================================
   Natywny file picker (z bezpiecznym powrotem focusu)
================================================================================================ */
async function pickImageViaNativePicker(): Promise<File | null> {
  const anyWin = window as any;
  try {
    if (!anyWin.showOpenFilePicker) return null;
    anyWin.__suppressFocusRefresh = true;

    const [handle] = await anyWin.showOpenFilePicker({
      multiple: false,
      types: [{ description: "Obrazy", accept: { "image/*": [".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"] } }],
      excludeAcceptAllOption: false,
    });
    const file: File = await handle.getFile();
    return file || null;
  } catch {
    return null;
  } finally {
    setTimeout(() => {
      (window as any).__suppressFocusRefresh = false;
    }, 300);
  }
}

/* ================================================================================================
   Strona
================================================================================================ */
export default function AdminProductsPage() {
  const [items, setItems] = useState<ProductRow[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [q, setQ] = useState("");
  const [withDeleted, setWithDeleted] = useState(false);
  const [category, setCategory] = useState<string>("");
  const [onlyFeatured, setOnlyFeatured] = useState<boolean>(false);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const allSelected = items.length > 0 && selectedIds.size === items.length;

  const [createOpen, setCreateOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const [bulkBusy, setBulkBusy] = useState<null | string>(null);
  const [uploadBusyProductId, setUploadBusyProductId] = useState<string | null>(null);

  const hiddenInputRef = useRef<HTMLInputElement | null>(null);
  const [hiddenTargetId, setHiddenTargetId] = useState<string | null>(null);

  const isDev = import.meta.env.DEV;

  // lokalny toast
  const [toast, setToast] = useState<string | null>(null);
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 4000);
  }, []);

  // ładowanie listy
  const load = useCallback(async () => {
    try {
      const res = await api.admin.products(
        page,
        20,
        q,
        withDeleted,
        {
          category: category.trim() || undefined,
          featured: !!onlyFeatured,
        }
      );
      setItems(res.items || []);
      setPages(res.pages || 1);
      setSelectedIds(new Set());
    } catch (err: any) {
      console.error("[AdminProductsPage] load() failed:", err);
      alert(err?.message || "Nie udało się pobrać listy produktów.");
    }
  }, [page, q, withDeleted, category, onlyFeatured]);

  useEffect(() => {
    load();
  }, [load]);

  const reloadProducts = load;

  // seed popular (SAFE → helper → fetch fallback)
  const runSeed = useCallback(async () => {
    try {
      const safe = (api as any)?.admin?.seedPopularSafe as
        | ((mode?: "insert" | "upsert") => Promise<{ ok: boolean; status?: number; message?: string; data: any }>)
        | undefined;

      const toastFrom = (data: any) => {
        const added   = Number(data?.added   ?? data?.createdCount ?? (Array.isArray(data?.created) ? data.created.length : 0) ?? 0);
        const updated = Number(data?.updated ?? data?.updatedCount ?? 0);
        const restored= Number(data?.restored?? data?.restoredCount?? 0);
        const skipped = Number(data?.skipped ?? data?.skippedCount ?? 0);
        return `✅ Seed OK: dodano=${added}, zaktualizowano=${updated}, przywrócono=${restored}, pominięto=${skipped}`;
      };

      if (typeof safe === "function") {
        const r = await safe("upsert");
        if (!r.ok) {
          const msg = `❌ Seed failed${r.status ? ` [${r.status}]` : ""}: ${r.message || "Unknown error"}`;
          console.error("seedPopularSafe error:", r);
          showToast(msg);
          return;
        }
        showToast(toastFrom(r.data));
        setPage(1);
        await reloadProducts();
        return;
      }

      const viaHelper = api?.admin?.seedPopular;
      if (typeof viaHelper === "function") {
        const data: any = await viaHelper("upsert");
        showToast(toastFrom(data));
        setPage(1);
        await reloadProducts();
        return;
      }

      await ensureCsrf();
      const csrf = getCookie("csrf") || getCookie("XSRF-TOKEN");
      const res = await fetch(`${API_BASE}/api/admin/seed/popular`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
        body: JSON.stringify({ mode: "upsert" }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const data = await res.json().catch(() => ({}));
      showToast(toastFrom(data));
      setPage(1);
      await reloadProducts();
    } catch (e: any) {
      console.error("[runSeed SAFE] error:", e);
      showToast(e?.message || "Seed nie powiódł się.");
    }
  }, [reloadProducts, showToast]);

  /* ---------------------------------------------------------------------------------------------
     Akcje masowe: WSZYSTKIE
  --------------------------------------------------------------------------------------------- */
  async function bulkSoftDeleteAll() {
    if (!confirm("Na pewno USUNĄĆ (soft) WSZYSTKIE produkty?")) return;
    setBulkBusy("soft-all");
    try {
      await ensureCsrf();
      const csrf = getCookie("csrf") || getCookie("XSRF-TOKEN");
      const res = await fetch(`${API_BASE}/api/admin/products`, {
        method: "DELETE",
        credentials: "include",
        headers: { "X-CSRF-Token": csrf, "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      if (!res.ok) throw new Error(await readError(res));
      alert("Wykonano soft-delete wszystkich produktów.");
      setPage(1);
      await load();
    } catch (e: any) {
      console.error("[bulkSoftDeleteAll]", e);
      alert(e?.message || "Nie udało się wykonać soft-delete wszystkich produktów.");
    } finally {
      setBulkBusy(null);
    }
  }

  async function bulkHardDeleteAll() {
    if (!confirm("⚠️ Na pewno TRWALE usunąć WSZYSTKIE produkty?")) return;
    setBulkBusy("hard-all");
    try {
      await ensureCsrf();
      const csrf = getCookie("csrf") || getCookie("XSRF-TOKEN");
      const res = await fetch(`${API_BASE}/api/admin/products`, {
        method: "DELETE",
        credentials: "include",
        headers: { "X-CSRF-Token": csrf, "Content-Type": "application/json" },
        body: JSON.stringify({ all: true, force: true }),
      });
      if (!res.ok) throw new Error(await readError(res));
      alert("Wykonano TRWAŁE usunięcie wszystkich produktów.");
      setPage(1);
      await load();
    } catch (e: any) {
      console.error("[bulkHardDeleteAll]", e);
      alert(e?.message || "Nie udało się trwale usunąć wszystkich produktów.");
    } finally {
      setBulkBusy(null);
    }
  }

  /* ---------------------------------------------------------------------------------------------
     Akcje masowe na zaznaczonych wierszach
  --------------------------------------------------------------------------------------------- */
  async function bulkSoftDeleteSelected() {
    if (selectedIds.size === 0) return;
    if (!confirm(`Usunąć (soft) zaznaczone ${selectedIds.size} produktów?`)) return;
    try {
      await api.admin.deleteProductsBulk([...selectedIds]);
      setSelectedIds(new Set());
      await load();
    } catch (err: any) {
      console.error("[bulkSoftDeleteSelected]", err);
      alert(err?.message || "Nie udało się usunąć (soft) zaznaczonych.");
    }
  }

  async function bulkHardDeleteSelected() {
    if (selectedIds.size === 0) return;
    if (!confirm(`⚠️ TRWALE usunąć zaznaczone ${selectedIds.size} produktów?`)) return;
    try {
      await api.admin.deleteProductsBulk([...selectedIds], { hard: true });
      setSelectedIds(new Set());
      await load();
    } catch (err: any) {
      console.error("[bulkHardDeleteSelected]", err);
      alert(err?.message || "Nie udało się trwale usunąć zaznaczonych.");
    }
  }

  /* ---------------------------------------------------------------------------------------------
     Pojedynczy hard delete (fallback 404 -> bulk z ids)
  --------------------------------------------------------------------------------------------- */
  async function hardDeleteOne(id: string) {
    if (!confirm("Na pewno TRWALE usunąć ten produkt?")) return;
    try {
      await api.admin.deleteProduct(id, { hard: true });
      await load();
    } catch (e: any) {
      try {
        await api.admin.deleteProductsBulk([id], { hard: true });
        await load();
      } catch (e2: any) {
        console.error("[hardDeleteOne]", e2);
        alert(e2?.message || "Nie udało się trwale usunąć produktu.");
      }
    }
  }

  async function importUpsertPopular() {
    if (!confirm("Uruchomić REIMPORT/UPSERT PopularGifts?")) return;
    setBulkBusy("upsert");
    try {
      const viaHelper = api?.admin?.seedPopular;
      const toastFrom = (data: any) => {
        const added   = Number(data?.added   ?? data?.createdCount ?? (Array.isArray(data?.created) ? data.created.length : 0) ?? 0);
        const updated = Number(data?.updated ?? data?.updatedCount ?? 0);
        const restored= Number(data?.restored?? data?.restoredCount?? 0);
        const skipped = Number(data?.skipped ?? data?.skippedCount ?? 0);
        return `Zakończono upsert. Dodano: ${added}, zaktualizowano: ${updated}, przywrócono: ${restored}, pominięto: ${skipped}.`;
      };

      if (typeof viaHelper === "function") {
        const data: any = await viaHelper("upsert"); // "insert" | "upsert"
        alert(toastFrom(data));
        setPage(1);
        await load();
        return;
      }
      await ensureCsrf();
      const csrf = getCookie("csrf") || getCookie("XSRF-TOKEN");
      const res = await fetch(`${API_BASE}/api/admin/seed/popular`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
        body: JSON.stringify({ mode: "upsert" }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const data = await res.json().catch(() => ({}));
      alert(toastFrom(data));
      setPage(1);
      await load();
    } catch (e: any) {
      console.error("[importUpsertPopular]", e);
      alert(e?.message || "Nie udało się wykonać reimportu/upsert.");
    } finally {
      setBulkBusy(null);
    }
  }

  /* ---------------------------------------------------------------------------------------------
     Upload — wybór zdjęcia (native → fallback)
  --------------------------------------------------------------------------------------------- */
  async function chooseAndUpload(productId: string) {
    try {
      const nativeFile = await pickImageViaNativePicker();
      if (nativeFile) {
        if (!nativeFile.type.startsWith("image/")) return alert("Wybierz obrazek (image/*).");
        if (nativeFile.size > 10 * 1024 * 1024) return alert("Plik jest zbyt duży (max 10 MB).");
        setUploadBusyProductId(productId);
        try {
          await uploadProductImageDirect(productId, nativeFile);
          await load();
        } finally {
          setUploadBusyProductId(null);
        }
        return;
      }
      setHiddenTargetId(productId);
      hiddenInputRef.current?.click();
    } catch (err: any) {
      console.error("[chooseAndUpload] error", err);
      alert(err?.message || "Nie udało się dodać obrazka.");
    }
  }

  /* ---------------------------------------------------------------------------------------------
     Render
  --------------------------------------------------------------------------------------------- */
  return (
    <div className="admin-skin admin-page p-6 max-w-6xl mx-auto relative">
      {/* Pasek szybki */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-sm text-[var(--adm-muted)] mr-2">Moduły:</span>
        <Link to="/admin" className="admin-btn px-2 py-1" title="Dashboard">Dashboard</Link>
        <Link to="/admin/products" className="admin-btn px-2 py-1 primary" title="Produkty">Produkty</Link>
        <Link to="/admin/orders" className="admin-btn px-2 py-1" title="Zamówienia">Zamówienia</Link>
        <Link to="/admin/users" className="admin-btn px-2 py-1" title="Użytkownicy">Użytkownicy</Link>
        <Link to="/admin/logs" className="admin-btn px-2 py-1" title="Logi">Logi</Link>
      </div>

      {/* Ukryty input dla uploadu */}
      <input
        ref={hiddenInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          try {
            const f = e.currentTarget.files?.[0] ?? null;
            e.currentTarget.value = "";
            const pid = hiddenTargetId;
            setHiddenTargetId(null);
            if (!pid || !f) return;
            if (!f.type.startsWith("image/")) return alert("Wybierz obrazek (image/*).");
            if (f.size > 10 * 1024 * 1024) return alert("Plik jest zbyt duży (max 10 MB).");
            setUploadBusyProductId(pid);
            try {
              await uploadProductImageDirect(pid, f);
              await load();
            } finally {
              setUploadBusyProductId(null);
            }
          } catch (err: any) {
            console.error("[hidden-input] error", err);
            alert(err?.message || "Upload nie powiódł się.");
          }
        }}
      />

      <h1 className="text-2xl font-bold mb-4">Produkty</h1>

      {/* Filtry i akcje */}
      <div className="flex flex-wrap gap-2 mb-3 items-center">
        <input
          className="admin-input"
          placeholder="Szukaj po nazwie/slug…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              setPage(1);
              load();
            }
          }}
          aria-label="Szukaj produktów"
        />
        <button
          type="button"
          className="admin-btn primary"
          onClick={() => {
            setPage(1);
            load();
          }}
          title="Wyszukaj"
        >
          Szukaj
        </button>

        <input
          className="admin-input"
          placeholder="Kategoria (slug) – np. dla-niej"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label="Filtr: kategoria (slug)"
        />

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={onlyFeatured}
            onChange={(e) => setOnlyFeatured(e.target.checked)}
          />
          Tylko popularne (featured)
        </label>

        <label className="flex items-center gap-2 ml-auto text-sm">
          <input
            type="checkbox"
            checked={withDeleted}
            onChange={(e) => setWithDeleted(e.target.checked)}
          />
          Pokaż usunięte
        </label>

        <div className="flex flex-wrap gap-2">
          {isDev && (
            <button
              type="button"
              className="admin-btn"
              onClick={() => setImportOpen(true)}
              disabled={!!bulkBusy}
              title="Importuj popularne produkty (seed)"
            >
              Importuj PopularGifts
            </button>
          )}
          {isDev && (
            <button
              type="button"
              className="admin-btn"
              onClick={importUpsertPopular}
              disabled={!!bulkBusy}
              title="Reimport/Upsert popularnych produktów"
            >
              Reimport/Upsert PopularGifts
            </button>
          )}
          {isDev && (
            <button
              type="button"
              className="admin-btn"
              onClick={runSeed}
              disabled={!!bulkBusy}
              title="Seed popularnych (wariant SAFE)"
            >
              Seed (SAFE)
            </button>
          )}

          <button
            type="button"
            className="admin-btn"
            onClick={bulkSoftDeleteAll}
            disabled={!!bulkBusy}
            title="Soft-delete wszystkich"
          >
            Usuń WSZYSTKIE (soft)
          </button>
          <button
            type="button"
            className="admin-btn danger"
            onClick={bulkHardDeleteAll}
            disabled={!!bulkBusy}
            title="TRWAŁE usunięcie wszystkich"
          >
            Usuń WSZYSTKIE trwale
          </button>

          <button
            type="button"
            className="admin-btn"
            disabled={selectedIds.size === 0}
            onClick={bulkSoftDeleteSelected}
            title="Soft-delete zaznaczonych"
          >
            Usuń zaznaczone (soft)
          </button>

          <button
            type="button"
            className="admin-btn danger"
            disabled={selectedIds.size === 0}
            onClick={bulkHardDeleteSelected}
            title="TRWAŁE usunięcie zaznaczonych"
          >
            Usuń zaznaczone trwale
          </button>

          <button
            type="button"
            className="admin-btn px-3 py-2"
            style={{ background: "var(--adm-head)", borderColor: "#FFD70033", fontWeight: 700 }}
            onClick={() => setCreateOpen(true)}
            disabled={!!bulkBusy}
            title="Utwórz nowy produkt"
          >
            + Nowy produkt
          </button>
        </div>
      </div>

      {/* Tabela */}
      <div className="admin-table-wrap">
        <table className="admin-table text-sm">
          <thead>
            <tr>
              <th className="text-left">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedIds(new Set(items.map(i => i.id)));
                    } else {
                      setSelectedIds(new Set());
                    }
                  }}
                  aria-label="Zaznacz wszystkie"
                />
              </th>
              <th className="text-left">Obrazek</th>
              <th className="text-left">Nazwa</th>
              <th className="text-left">Slug</th>
              <th className="text-left">Cena min</th>
              <th className="text-left">Popularny</th>
              <th className="text-left">Status</th>
              <th className="text-left">Akcje</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => {
              const minPrice = computeMinPrice(p.variants);
              const checked = selectedIds.has(p.id);
              const thumb =
                p.media?.[0]?.url
                  ? buildImageUrl(p.media[0].url)
                  : (p.imageUrl || p.image || "");

              return (
                <tr key={p.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        setSelectedIds(prev => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(p.id);
                          else next.delete(p.id);
                          return next;
                        });
                      }}
                      aria-label={`Zaznacz ${p.name}`}
                    />
                  </td>

                  <td>
                    {thumb ? (
                      <img
                        src={thumb}
                        alt=""
                        className="w-12 h-12 object-cover rounded"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded bg-[rgba(255,255,255,0.06)] grid place-items-center text-[var(--adm-muted)]">
                        —
                      </div>
                    )}
                  </td>

                  <td className="font-semibold">{p.name}</td>
                  <td>{p.slug}</td>
                  <td>{minPrice !== null ? (minPrice / 100).toFixed(2) + " zł" : "-"}</td>
                  <td className="text-center" title={p.featured ? "Produkt wyróżniony" : "Zwykły"}>
                    {p.featured ? "★" : "–"}
                  </td>
                  <td>
                    {p.deletedAt ? (
                      <span
                        className="admin-badge"
                        style={{ background: "#3a1f24", color: "#ffdfe1" }}
                        title="Produkt jest soft-deleted"
                      >
                        USUNIĘTY
                      </span>
                    ) : (
                      "Aktywny"
                    )}
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-2 items-center">
                      <button
                        type="button"
                        className="admin-btn px-2 py-1"
                        onClick={() => setEditId(p.id)}
                        title="Edytuj produkt"
                      >
                        Edytuj
                      </button>

                      <button
                        type="button"
                        className="admin-btn px-2 py-1"
                        onClick={() => chooseAndUpload(p.id)}
                        disabled={uploadBusyProductId === p.id}
                        title="Dodaj zdjęcie (natywny picker lub z dysku)"
                      >
                        {uploadBusyProductId === p.id ? "Wgrywam…" : "Dodaj zdjęcie"}
                      </button>

                      {!p.deletedAt ? (
                        <>
                          <button
                            type="button"
                            className="admin-btn px-2 py-1"
                            onClick={async () => {
                              try {
                                await api.admin.deleteProduct(p.id); // SOFT
                                load();
                              } catch (err: any) {
                                alert(err?.message || "Nie udało się usunąć produktu.");
                              }
                            }}
                            title="Soft-delete produktu"
                          >
                            Usuń
                          </button>
                          <button
                            type="button"
                            className="admin-btn danger px-2 py-1"
                            onClick={() => hardDeleteOne(p.id)} // HARD
                            title="TRWAŁE usunięcie"
                          >
                            Usuń trwale
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="admin-btn px-2 py-1"
                            onClick={async () => {
                              try {
                                await api.admin.updateProduct(p.id, { undelete: true });
                                load();
                              } catch (err: any) {
                                alert(err?.message || "Nie udało się przywrócić produktu.");
                              }
                            }}
                            title="Przywróć produkt"
                          >
                            Przywróć
                          </button>
                          <button
                            type="button"
                            className="admin-btn danger px-2 py-1"
                            onClick={() => hardDeleteOne(p.id)} // HARD
                            title="TRWAŁE usunięcie"
                          >
                            Usuń trwale
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-4 text-center text-[var(--adm-muted)]">
                  Brak wyników.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Paginacja */}
      <div className="flex gap-2 items-center mt-3">
        <button
          type="button"
          disabled={page <= 1}
          className={`admin-btn ${page <= 1 ? "opacity-50 cursor-not-allowed" : ""}`}
          onClick={() => setPage((p) => p - 1)}
          title="Poprzednia strona"
        >
          ← Poprzednia
        </button>
        <span className="text-sm text-[var(--adm-muted)]">
          Strona {page}/{pages}
        </span>
        <button
          type="button"
          disabled={page >= pages}
          className={`admin-btn ${page >= pages ? "opacity-50 cursor-not-allowed" : ""}`}
          onClick={() => setPage((p) => p + 1)}
          title="Następna strona"
        >
          Następna →
        </button>
      </div>

      {/* Modale */}
      {createOpen && (
        <CreateProductModal
          onClose={() => setCreateOpen(false)}
          onDone={() => {
            setCreateOpen(false);
            load();
          }}
        />
      )}

      {editId && (
        <EditProductModal
          id={editId}
          initialProduct={items.find((x) => x.id === editId) || null}
          onClose={() => setEditId(null)}
          onDone={() => {
            setEditId(null);
            load();
          }}
        />
      )}

      {importOpen && isDev && (
        <ImportPopularGiftsModal
          onClose={() => setImportOpen(false)}
          onDone={() => {
            setImportOpen(false);
            load();
          }}
        />
      )}

      {/* TOAST */}
      {toast && (
        <div
          className="fixed bottom-4 right-4 z-[99999] px-3 py-2 rounded-lg shadow-lg"
          style={{ background: "rgba(15,21,34,0.95)", color: "#e9eef7", border: "1px solid rgba(255,255,255,0.12)" }}
          role="status"
          aria-live="polite"
        >
          {toast}
        </div>
      )}
    </div>
  );
}

/* ================================================================================================
   CreateProductModal
================================================================================================ */
function CreateProductModal({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  const [form, setForm] = useState({
    name: "",
    slug: "",
    description: "",
    brand: "",
    category: "",
    sku: "",
    priceZl: "",
    stock: 0,
    color: "",
    size: "",
    personalize: false,
    featured: false,
  });
  const [file, setFile] = useState<File | null>(null);
  const [creating, setCreating] = useState(false);

  const hiddenCreateRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        void handleSave();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, file, creating]);

  async function pickForCreate() {
    const f = await pickImageViaNativePicker();
    if (f) return setFile(f);
    hiddenCreateRef.current?.click();
  }

  const parseZlToCents = (s: string): number => {
    const n = Number(String(s).replace(",", ".").trim());
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
  };

  const handleSave = async () => {
    try {
      if (!form.name || !form.slug || !form.category) {
        alert("Wypełnij minimum: Nazwa, Slug, Kategoria.");
        return;
      }
      const priceCents = parseZlToCents(form.priceZl);
      if (priceCents <= 0) {
        alert("Podaj poprawną cenę (zł).");
        return;
      }
      setCreating(true);

      const created = await api.admin.createProduct({
        name: form.name,
        slug: form.slug,
        description: form.description,
        brand: form.brand,
        category: coerceCategorySlug(form.category),
        variant: {
          sku: form.sku || form.slug.toUpperCase(),
          priceCents,
          stock: form.stock,
          color: form.color || undefined,
          size: form.size || undefined,
          personalize: !!form.personalize,
        },
      });

      const productId = (created as any)?.product?.id;
      if (!productId) {
        alert("Produkt się utworzył, ale nie dostałem ID. Sprawdź backend logi.");
        return onDone();
      }

      if (form.featured) {
        await api.admin.updateProduct(productId, { featured: true });
      }

      if (file) {
        try {
          await uploadProductImageDirect(productId, file);
        } catch (err: any) {
          console.error("[Upload podczas tworzenia] error", err);
          alert("Produkt zapisany, ale obrazek nie został dodany: " + (err?.message || ""));
        }
      }

      onDone();
    } catch (err: any) {
      console.error("[CreateProduct] failed]", err);
      alert(err?.message || "Nie udało się utworzyć produktu.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.7)" }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="rounded-xl p-5 w-full max-w-xl max-h-[85vh] overflow-y-auto shadow-2xl"
        style={{
          background: "var(--adm-surface-solid, #0f1522)",
          border: "1px solid rgba(255,255,255,0.08)",
          color: "var(--adm-fore,#e9eef7)",
        }}
      >
        <h2 className="text-lg font-bold mb-3">Nowy produkt</h2>

        <div className="grid grid-cols-2 gap-3">
          <label className="col-span-2 text-sm text-[var(--adm-muted)]">Nazwa</label>
          <input
            className="admin-input col-span-2"
            placeholder="Np. Kubek z nadrukiem"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />

          <label className="col-span-2 text-sm text-[var(--adm-muted)]">Slug</label>
          <input
            className="admin-input col-span-2"
            placeholder="np. kubek-z-nadrukiem"
            value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                void handleSave();
              }
            }}
          />

          <label className="col-span-2 text-sm text-[var(--adm-muted)]">Opis</label>
          <textarea
            className="admin-input col-span-2"
            placeholder="Krótki opis produktu…"
            rows={3}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />

          <div className="grid grid-cols-2 gap-3 col-span-2">
            <div>
              <label className="text-sm text-[var(--adm-muted)]">Marka</label>
              <input
                className="admin-input w-full"
                placeholder="np. GiftStore"
                value={form.brand}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
              />
            </div>

            <div>
              <label className="text-sm text-[var(--adm-muted)]">Kategoria</label>
              <input
                className="admin-input w-full"
                placeholder="np. dla-niej / na-urodziny"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 col-span-2">
            <div>
              <label className="text-sm text-[var(--adm-muted)]">SKU</label>
              <input
                className="admin-input w-full"
                placeholder="np. KUBEK-RED-M"
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
              />
            </div>

            <div>
              <label className="text-sm text-[var(--adm-muted)]">Cena (zł)</label>
              <input
                className="admin-input w-full"
                inputMode="decimal"
                placeholder="np. 49.99"
                value={form.priceZl}
                onChange={(e) => setForm({ ...form, priceZl: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 col-span-2">
            <div>
              <label className="text-sm text-[var(--adm-muted)]">Stan (szt.)</label>
              <input
                type="number"
                className="admin-input w-full"
                placeholder="np. 25"
                value={form.stock}
                onChange={(e) => setForm({ ...form, stock: Number(e.target.value) || 0 })}
              />
            </div>
            <div>
              <label className="text-sm text-[var(--adm-muted)]">Kolor</label>
              <input
                className="admin-input w-full"
                placeholder="np. czerwony"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm text-[var(--adm-muted)]">Rozmiar</label>
              <input
                className="admin-input w-full"
                placeholder="np. M"
                value={form.size}
                onChange={(e) => setForm({ ...form, size: e.target.value })}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 col-span-2">
            <input
              type="checkbox"
              checked={form.personalize}
              onChange={(e) => setForm({ ...form, personalize: e.target.checked })}
            />
            Personalizacja dostępna
          </label>

          <label className="flex items-center gap-2 col-span-2">
            <input
              type="checkbox"
              checked={form.featured}
              onChange={(e) => setForm({ ...form, featured: e.target.checked })}
            />
            Popularny (featured)
          </label>

          <div className="col-span-2">
            <label className="block text-sm text-[var(--adm-muted)] mb-1">Zdjęcie (opcjonalnie)</label>
            <div className="flex items-center gap-2">
              <button type="button" className="admin-btn px-2 py-1" onClick={pickForCreate}>
                Wybierz zdjęcie
              </button>
              {file && (
                <span className="text-xs text-[var(--adm-muted)] truncate max-w-[220px]">
                  {file.name}
                </span>
              )}
            </div>
            <input
              ref={hiddenCreateRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.currentTarget.files?.[0] ?? null;
                e.currentTarget.value = "";
                if (f) setFile(f);
              }}
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="admin-btn" onClick={onClose} disabled={creating}>
            Anuluj
          </button>
          <button
            type="button"
            className="admin-btn primary"
            disabled={creating}
            onClick={handleSave}
            title="Zapisz (Ctrl/Cmd+Enter)"
          >
            Zapisz
          </button>
        </div>
      </div>
    </div>
  );
}

/* ================================================================================================
   EditProductModal
================================================================================================ */
function EditProductModal({
  id,
  initialProduct,
  onClose,
  onDone,
}: {
  id: string;
  initialProduct?: ProductRow | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [product, setProduct] = useState<ProductRow | null>(null);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [brand, setBrand] = useState<string>("");
  const [category, setCategory] = useState<string>("");
  const [featured, setFeatured] = useState(false);

  const [variantId, setVariantId] = useState<string | undefined>(undefined);
  const [variantSku, setVariantSku] = useState<string>("");
  const [variantZl, setVariantZl] = useState<string>("");
  const [variantStock, setVariantStock] = useState<number>(0);
  const [variantColor, setVariantColor] = useState<string>("");
  const [variantSize, setVariantSize] = useState<string>("");
  const [variantPersonalize, setVariantPersonalize] = useState<boolean>(false);

  const [uploading, setUploading] = useState(false);
  const hiddenEditRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        void handleSave();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, slug, description, brand, category, featured, variantId, variantSku, variantZl, variantStock, variantColor, variantSize, variantPersonalize]);

  const parseZlToCents = (s: string): number => {
    const n = Number(String(s).replace(",", ".").trim());
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
  };

  function primeFromProduct(p: ProductRow) {
    setProduct(p);
    setName(p?.name ?? "");
    setSlug(p?.slug ?? "");
    setDescription(String(p?.description ?? ""));
    setBrand(String(p?.brand ?? ""));

    const catSlug = coerceCategorySlug(p?.category);
    setCategory(catSlug);

    setFeatured(!!p?.featured);

    const v = p?.variants?.[0];
    setVariantId(v?.id);
    setVariantSku(String(v?.sku ?? ""));
    setVariantZl(typeof v?.priceCents === "number" ? (v.priceCents / 100).toFixed(2) : "");
    setVariantStock(typeof v?.stock === "number" ? v.stock : 0);
    setVariantColor(String(v?.color ?? ""));
    setVariantSize(String(v?.size ?? ""));
    setVariantPersonalize(!!v?.personalize);
  }

  async function pickForEdit(productId: string) {
    try {
      const f = await pickImageViaNativePicker();
      if (f) {
        if (!f.type.startsWith("image/")) return alert("Wybierz obrazek (image/*).");
        if (f.size > 10 * 1024 * 1024) return alert("Plik jest zbyt duży (max 10 MB).");
        setUploading(true);
        try {
          await uploadProductImageDirect(productId, f);
          await load();
        } finally {
          setUploading(false);
        }
        return;
      }
      hiddenEditRef.current?.click();
    } catch (e: any) {
      alert(e?.message || "Nie udało się dodać obrazka.");
    }
  }

  async function saveVariant(
    variantId: string,
    payload: {
      sku?: string | null;
      priceCents?: number;
      stock?: number;
      color?: string | undefined;
      size?: string | undefined;
      personalize?: boolean;
    }
  ) {
    await ensureCsrf();
    const csrf = getCookie("csrf") || getCookie("XSRF-TOKEN");
    const res = await fetch(`${API_BASE}/api/admin/variants/${encodeURIComponent(variantId)}`, {
      method: "PATCH",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrf,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await readError(res));
    return res.json();
  }

  async function load() {
    setLoading(true);
    try {
      const res = await api.admin.productById(id);
      const p = pickProductShape(res, id);
      if (!p) throw new Error("Produkt nie znaleziony lub nieprawidłowy format odpowiedzi API.");
      primeFromProduct(p);
    } catch (err: any) {
      console.error("[EditProduct] load() failed:", err);
      alert(err?.message || "Nie udało się pobrać produktu.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (initialProduct) {
      try {
        primeFromProduct(initialProduct);
        setLoading(false);
      } catch {
        /* ignore */
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) {
    return (
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center"
        style={{ background: "rgba(0,0,0,0.7)" }}
        role="dialog"
        aria-modal="true"
        aria-label="Ładowanie produktu"
      >
        <div
          className="p-4 w-full max-w-lg rounded-xl"
          style={{
            background: "var(--adm-surface-solid, #0f1522)",
            border: "1px solid rgba(255,255,255,0.08)",
            color: "var(--adm-fore,#e9eef7)",
          }}
        >
          Ładowanie…
        </div>
      </div>
    );
  }
  if (!product) return null;

  const imgSrc = (url: string) => buildImageUrl(url);

  const handleSave = async () => {
    try {
      await api.admin.updateProduct(product.id, {
        name,
        slug,
        description,
        brand,
        category: coerceCategorySlug(category),
        featured,
      });

      if (variantId) {
        const payload = {
          sku: variantSku || null,
          priceCents: parseZlToCents(variantZl),
          stock: variantStock,
          color: variantColor ? variantColor : undefined,
          size: variantSize ? variantSize : undefined,
          personalize: !!variantPersonalize,
        };
        await saveVariant(variantId, payload);
      }

      onDone();
    } catch (err: any) {
      console.error("[EditProduct] save failed:", err);
      alert(err?.message || "Nie udało się zapisać zmian.");
    }
  };

  // Obraz główny podgląd: pierwszy z media albo fallback imageUrl/image
  const cover =
    product.media?.[0]?.url
      ? imgSrc(product.media[0].url)
      : (product.imageUrl || product.image || "");

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.7)" }}
      role="dialog"
      aria-modal="true"
      aria-label={`Edytuj produkt ${product?.name || ""}`}
    >
      <div
        className="rounded-xl p-5 w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl"
        style={{
          background: "var(--adm-surface-solid, #0f1522)",
          border: "1px solid rgba(255,255,255,0.08)",
          color: "var(--adm-fore,#e9eef7)",
        }}
      >
        <h2 className="text-lg font-bold mb-2">Edytuj: {product?.name || "—"}</h2>

        {cover ? (
          <div className="mb-3">
            {/* cover jest już pełnym URL-em – NIE wywołujemy ponownie buildImageUrl */}
            <img src={cover} alt="" className="w-full max-h-60 object-cover rounded" />
          </div>
        ) : null}

        {/* Podstawowe dane */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="text-sm text-[var(--adm-muted)]">Nazwa</label>
            <input
              className="admin-input w-full"
              placeholder="Np. Kubek z nadrukiem"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm text-[var(--adm-muted)]">Slug</label>
            <input
              className="admin-input w-full"
              placeholder="np. kubek-z-nadrukiem"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  void handleSave();
                }
              }}
            />
          </div>
          <div className="col-span-2">
            <label className="text-sm text-[var(--adm-muted)]">Opis</label>
            <textarea
              className="admin-input w-full"
              rows={3}
              placeholder="Krótki opis produktu…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm text-[var(--adm-muted)]">Marka</label>
            <input
              className="admin-input w-full"
              placeholder="np. GiftStore"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm text-[var(--adm-muted)]">Kategoria (slug)</label>
            <input
              className="admin-input w-full"
              placeholder="np. dla-niej / na-urodziny"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
          </div>

          <label className="flex items-center gap-2 col-span-2">
            <input
              type="checkbox"
              checked={featured}
              onChange={(e) => setFeatured(e.target.checked)}
            />
            Popularny (featured)
          </label>
        </div>

        {/* Pierwszy wariant */}
        <div className="mb-4">
          <h3 className="font-bold mb-2">Wariant (1)</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <label className="text-sm text-[var(--adm-muted)]">SKU</label>
              <input
                className="admin-input w-full"
                placeholder="np. KUBEK-RED-M"
                value={variantSku}
                onChange={(e) => setVariantSku(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm text-[var(--adm-muted)]">Cena (zł)</label>
              <input
                className="admin-input w-full"
                inputMode="decimal"
                placeholder="np. 49.99"
                value={variantZl}
                onChange={(e) => setVariantZl(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm text-[var(--adm-muted)]">Stan (szt.)</label>
              <input
                type="number"
                className="admin-input w-full"
                placeholder="np. 25"
                value={variantStock}
                onChange={(e) => setVariantStock(Number(e.target.value) || 0)}
              />
            </div>
            <div>
              <label className="text-sm text-[var(--adm-muted)]">Kolor</label>
              <input
                className="admin-input w-full"
                placeholder="np. czerwony"
                value={variantColor}
                onChange={(e) => setVariantColor(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm text-[var(--adm-muted)]">Rozmiar</label>
              <input
                className="admin-input w-full"
                placeholder="np. M"
                value={variantSize}
                onChange={(e) => setVariantSize(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={variantPersonalize}
                onChange={(e) => setVariantPersonalize(e.target.checked)}
              />
              Personalizacja dostępna
            </label>
          </div>
        </div>

        {/* Media */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold">Obrazki</h3>

            <div className="flex items-center gap-2">
              <button
                type="button"
                className="admin-btn px-2 py-1"
                onClick={() => pickForEdit(product.id)}
                disabled={uploading}
                title="Dodaj zdjęcie (natywny picker lub z dysku)"
              >
                {uploading ? "Wgrywam…" : "Dodaj zdjęcie"}
              </button>
              <input
                ref={hiddenEditRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const f = e.currentTarget.files?.[0] ?? null;
                  e.currentTarget.value = "";
                  if (!f) return;
                  if (!f.type.startsWith("image/")) return alert("Wybierz obrazek (image/*).");
                  if (f.size > 10 * 1024 * 1024) return alert("Plik jest zbyt duży (max 10 MB).");
                  setUploading(true);
                  try {
                    await uploadProductImageDirect(product.id, f);
                    await load();
                  } finally {
                    setUploading(false);
                  }
                }}
              />
            </div>
          </div>

          {product?.media?.length ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {product.media.map((m) => (
                <div key={m.id} className="admin-card p-2 rounded-lg flex flex-col items-center">
                  <img src={imgSrc(m.url)} className="w-full aspect-square object-cover rounded" alt="" />
                  <button
                    type="button"
                    className="admin-btn px-2 py-1 mt-2"
                    onClick={async () => {
                      try {
                        await api.admin.deleteProductImage(m.id);
                        await load();
                      } catch (err: any) {
                        console.error("[Delete image] error", err);
                        alert(err?.message || "Nie udało się usunąć obrazka");
                      }
                    }}
                  >
                    Usuń
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-[var(--adm-muted)]">Brak obrazków.</div>
          )}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="admin-btn" onClick={onClose}>
            Zamknij
          </button>
          <button
            type="button"
            className="admin-btn primary"
            onClick={handleSave}
            title="Zapisz (Ctrl/Cmd+Enter)"
          >
            Zapisz
          </button>
        </div>
      </div>
    </div>
  );
}

/* ================================================================================================
   ImportPopularGiftsModal (DEV only; portal)
================================================================================================ */
function ImportPopularGiftsModal({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [upsert, setUpsert] = useState(false);

  function push(msg: string) {
    setLog((l) => [...l, msg]);
  }

  function safeLogCreated(created: unknown) {
    const list = Array.isArray(created) ? created : [];
    for (const row of list) {
      if (typeof row === "string") {
        push(`  • ${row}`);
      } else if (row && typeof row === "object") {
        const id = (row as any)?.id ?? "";
        const slug = (row as any)?.slug ?? "";
        push(`  • ${slug || "(brak-slug)"}${id ? ` (${id})` : ""}`);
      }
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !running) {
        void startImport();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upsert, running]);

  const startImport = async () => {
    setRunning(true);
    setLog([]);
    try {
      push("Start importu…");
      const mode: "insert" | "upsert" = upsert ? "upsert" : "insert";

      const viaHelper = api?.admin?.seedPopular;
      const msgFrom = (data: any) => {
        const added   = Number(data?.added   ?? data?.createdCount ?? (Array.isArray(data?.created) ? data.created.length : 0) ?? 0);
        const updated = Number(data?.updated ?? data?.updatedCount ?? 0);
        const restored= Number(data?.restored?? data?.restoredCount?? 0);
        const skipped = Number(data?.skipped ?? data?.skippedCount ?? 0);
        return `Utworzono: ${added}, zaktualizowano: ${updated}, przywrócono: ${restored}, pominięto: ${skipped}.`;
      };

      if (typeof viaHelper === "function") {
        const data: any = await viaHelper(mode);
        push(msgFrom(data));
        safeLogCreated(data?.created);
        alert(`Import zakończony. ${msgFrom(data)}`);
        onDone();
        return;
      }

      await ensureCsrf();
      const csrf = getCookie("csrf") || getCookie("XSRF-TOKEN");
      const res = await fetch(`${API_BASE}/api/admin/seed/popular`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
        body: JSON.stringify({ mode }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const data = await res.json();

      push(msgFrom(data));
      safeLogCreated(data?.created);
      alert(`Import zakończony. ${msgFrom(data)}`);
      onDone();
    } catch (err: any) {
      console.error("[ImportPopularGifts] error", err);
      push(`❌ Błąd: ${err?.message || String(err)}`);
      alert(err?.message || "Import nie powiódł się.");
    } finally {
      setRunning(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.72)" }}
      role="dialog"
      aria-modal="true"
      aria-label="Import popularnych produktów"
    >
      <div
        className="rounded-xl p-4 w-full max-w-2xl max-h-[85vh] overflow-y-auto shadow-2xl"
        style={{
          background: "var(--adm-surface-solid, #0f1522)",
          border: "1px solid rgba(255,255,255,0.08)",
          color: "var(--adm-fore,#e9eef7)",
        }}
      >
        <h2 className="text-lg font-bold mb-3">Import PopularGifts (seed z backendu)</h2>
        <p className="text-sm text-[var(--adm-muted)] mb-2">
          Ten import wywołuje nowszy endpoint przez <code>api.admin.seedPopular</code> lub — jeśli
          helpera brak — klasyczny <code>/api/admin/seed/popular</code>.
        </p>

        <label className="flex items-center gap-2 mb-3">
          <input type="checkbox" checked={upsert} onChange={(e) => setUpsert(e.target.checked)} />
          Tryb upsert (aktualizuj jeśli istnieje)
        </label>

        <div className="admin-card p-2 h-48 overflow-auto text-xs mb-3">
          {log.length ? (
            log.map((l, i) => (
              <div key={i} className="whitespace-pre-wrap">
                {l}
              </div>
            ))
          ) : (
            <div className="text-[var(--adm-muted)]">Log…</div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" className="admin-btn" onClick={onClose} disabled={running}>
            Zamknij
          </button>
          <button
            type="button"
            className="admin-btn primary disabled:opacity-60"
            disabled={running}
            onClick={startImport}
            title="Start importu (Ctrl/Cmd+Enter)"
          >
            Start importu
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
