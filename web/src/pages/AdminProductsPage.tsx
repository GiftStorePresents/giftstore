// src/pages/AdminProductsPage.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, API_BASE, ensureCsrf } from "../api";

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
type ProductRow = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  brand?: string | null;
  category?: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  variants: VariantRow[];
  media?: MediaRow[];
  featured?: boolean;
};

function computeMinPrice(variants: VariantRow[] | undefined | null): number | null {
  if (!Array.isArray(variants) || variants.length === 0) return null;
  const vals = variants.map((v) => v?.priceCents).filter((n): n is number => typeof n === "number");
  if (!vals.length) return null;
  return Math.min(...vals);
}

// cookies
function getCookie(name: string) {
  return (
    document.cookie
      .split("; ")
      .find((row) => row.startsWith(name + "="))
      ?.split("=")[1] || ""
  );
}

// czytelne błędy z fetch
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

// upload z fallbackami (primary: /upload-image, alias: /images; pole: file->image)
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

  // 1) /upload-image z polem "file"
  let res = await sendOnce("/upload-image", "file");

  // 404/405 → alias /images
  if (res.status === 404 || res.status === 405) {
    res = await sendOnce("/images", "file");
  }

  // 400/415 → spróbuj to samo z polem "image"
  if (res.status === 400 || res.status === 415) {
    const usedImages = res.url.includes("/images");
    res = await sendOnce(usedImages ? "/images" : "/upload-image", "image");
  }

  if (!res.ok) throw new Error(await readError(res));
  const data = await res.json().catch(() => ({}));
  return data;
}

// Natywny picker (Chrome/Edge). Zwraca File albo null (gdy anulowano/nieobsługiwane).
async function pickImageViaNativePicker(): Promise<File | null> {
  const anyWin = window as any;
  try {
    if (!anyWin.showOpenFilePicker) return null;
    anyWin.__suppressFocusRefresh = true;

    const [handle] = await anyWin.showOpenFilePicker({
      multiple: false,
      types: [
        {
          description: "Obrazy",
          accept: { "image/*": [".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"] },
        },
      ],
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

export default function AdminProductsPage() {
  const [items, setItems] = useState<ProductRow[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [q, setQ] = useState("");
  const [withDeleted, setWithDeleted] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const [bulkBusy, setBulkBusy] = useState<null | string>(null);
  const [uploadBusyProductId, setUploadBusyProductId] = useState<string | null>(null);

  // globalny ukryty input – fallback dla przeglądarek bez showOpenFilePicker
  const hiddenInputRef = useRef<HTMLInputElement | null>(null);
  const [hiddenTargetId, setHiddenTargetId] = useState<string | null>(null);

  const isDev = import.meta.env.DEV;

  async function load() {
    try {
      const res = await api.admin.products(page, 20, q, withDeleted);
      setItems(res.items);
      setPages(res.pages);
    } catch (err: any) {
      console.error("[AdminProductsPage] load() failed:", err);
      alert(err?.message || "Nie udało się pobrać listy produktów.");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, withDeleted]);

  const firstProductId = useMemo(() => items[0]?.id || "", [items]);

  // ====== AKCJE MASOWE ======
  async function bulkSoftDeleteAll() {
    if (!confirm("Na pewno USUNĄĆ (soft) WSZYSTKIE produkty?")) return;
    setBulkBusy("soft-all");
    try {
      await ensureCsrf();
      const csrf = getCookie("csrf");
      let res = await fetch(`${API_BASE}/api/admin/products/all`, {
        method: "DELETE",
        credentials: "include",
        headers: { "X-CSRF-Token": csrf },
      });
      if (res.status === 404) {
        res = await fetch(`${API_BASE}/api/admin/products`, {
          method: "DELETE",
          credentials: "include",
          headers: { "X-CSRF-Token": csrf, "Content-Type": "application/json" },
          body: JSON.stringify({ all: true }),
        });
      }
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
      const csrf = getCookie("csrf");
      let res = await fetch(`${API_BASE}/api/admin/products/all?hard=1`, {
        method: "DELETE",
        credentials: "include",
        headers: { "X-CSRF-Token": csrf },
      });
      if (res.status === 404) {
        res = await fetch(`${API_BASE}/api/admin/products`, {
          method: "DELETE",
          credentials: "include",
          headers: { "X-CSRF-Token": csrf, "Content-Type": "application/json" },
          body: JSON.stringify({ all: true, force: true }),
        });
      }
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

  async function hardDeleteOne(id: string) {
    if (!confirm("Na pewno TRWALE usunąć ten produkt?")) return;
    try {
      await ensureCsrf();
      const csrf = getCookie("csrf");
      let res = await fetch(`${API_BASE}/api/admin/products/${encodeURIComponent(id)}?hard=1`, {
        method: "DELETE",
        credentials: "include",
        headers: { "X-CSRF-Token": csrf },
      });
      if (res.status === 404) {
        res = await fetch(`${API_BASE}/api/admin/products`, {
          method: "DELETE",
          credentials: "include",
          headers: { "X-CSRF-Token": csrf, "Content-Type": "application/json" },
          body: JSON.stringify({ ids: [id], force: true }),
        });
      }
      if (!res.ok) throw new Error(await readError(res));
      await load();
    } catch (e: any) {
      console.error("[hardDeleteOne]", e);
      alert(e?.message || "Nie udało się trwale usunąć produktu.");
    }
  }

  async function importUpsertPopular() {
    if (!confirm("Uruchomić REIMPORT/UPSERT PopularGifts?")) return;
    setBulkBusy("upsert");
    try {
      await ensureCsrf();
      const csrf = getCookie("csrf");
      const res = await fetch(`${API_BASE}/api/admin/seed/popular`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
        body: JSON.stringify({ mode: "upsert" }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const data = await res.json().catch(() => ({}));
      alert(`Zakończono upsert. Dodano/Zaktualizowano: ${data?.createdCount ?? "?"}.`);
      setPage(1);
      await load();
    } catch (e: any) {
      console.error("[importUpsertPopular]", e);
      alert(e?.message || "Nie udało się wykonać reimportu/upsert.");
    } finally {
      setBulkBusy(null);
    }
  }

  // ====== POMOCNICZE: domyślny wybór zdjęcia (native picker + fallback)
  async function chooseAndUpload(productId: string) {
    try {
      // 1) spróbuj natywny picker
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
      // 2) fallback – otwórz ukryty input
      setHiddenTargetId(productId);
      hiddenInputRef.current?.click();
    } catch (err: any) {
      console.error("[chooseAndUpload] error", err);
      alert(err?.message || "Nie udało się dodać obrazka.");
    }
  }

  // ====== RENDER ======
  return (
    <div className="p-6 max-w-6xl mx-auto relative">
      {/* Pasek szybkiej nawigacji po panelu admina */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-sm text-gray-600 mr-2">Moduły:</span>
        <Link to="/admin" className="px-2 py-1 border rounded hover:bg-gray-50">Dashboard</Link>
        <Link to="/admin/products" className="px-2 py-1 border rounded bg-gray-100">Produkty</Link>
        <Link to="/admin/orders" className="px-2 py-1 border rounded hover:bg-gray-50">Zamówienia</Link>
        <Link to="/admin/users" className="px-2 py-1 border rounded hover:bg-gray-50">Użytkownicy</Link>
        <Link to="/admin/logs" className="px-2 py-1 border rounded hover:bg-gray-50">Logi</Link>
      </div>

      {/* Ukryty globalny input (fallback dla wszystkich przycisków Dodaj zdjęcie) */}
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

      <div className="flex flex-wrap gap-2 mb-3 items-center">
        <input
          className="border rounded px-3 py-2"
          placeholder="Szukaj po nazwie/slug…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              setPage(1);
              load();
            }
          }}
        />
        <button
          type="button"
          className="px-3 py-2 bg-mainRed text-white rounded"
          onClick={() => {
            setPage(1);
            load();
          }}
        >
          Szukaj
        </button>

        <label className="flex items-center gap-2 ml-auto">
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
              className="px-3 py-2 border rounded"
              onClick={() => setImportOpen(true)}
              disabled={!!bulkBusy}
            >
              Importuj PopularGifts
            </button>
          )}
          {isDev && (
            <button
              type="button"
              className="px-3 py-2 border rounded"
              onClick={importUpsertPopular}
              disabled={!!bulkBusy}
            >
              Reimport/Upsert PopularGifts
            </button>
          )}
          <button
            type="button"
            className="px-3 py-2 border rounded text-red-700 disabled:opacity-50"
            onClick={bulkSoftDeleteAll}
            disabled={!!bulkBusy}
          >
            Usuń WSZYSTKIE (soft)
          </button>
          <button
            type="button"
            className="px-3 py-2 border rounded text-white bg-red-600 disabled:opacity-50"
            onClick={bulkHardDeleteAll}
            disabled={!!bulkBusy}
          >
            Usuń WSZYSTKIE trwale
          </button>
          <button
            type="button"
            className="px-3 py-2 bg-gold text-mainRed rounded font-bold"
            onClick={() => setCreateOpen(true)}
            disabled={!!bulkBusy}
          >
            + Nowy produkt
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-2 border">Nazwa</th>
              <th className="p-2 border">Slug</th>
              <th className="p-2 border">Cena min</th>
              <th className="p-2 border">Popularny</th>
              <th className="p-2 border">Status</th>
              <th className="p-2 border">Akcje</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => {
              const minPrice = computeMinPrice(p.variants);

              return (
                <tr key={p.id}>
                  <td className="p-2 border font-semibold">{p.name}</td>
                  <td className="p-2 border">{p.slug}</td>
                  <td className="p-2 border">
                    {minPrice !== null ? (minPrice / 100).toFixed(2) + " zł" : "-"}
                  </td>
                  <td className="p-2 border text-center">{p.featured ? "★" : "–"}</td>
                  <td className="p-2 border">
                    {p.deletedAt ? <span className="text-red-600 font-bold">USUNIĘTY</span> : "Aktywny"}
                  </td>
                  <td className="p-2 border">
                    <div className="flex flex-wrap gap-2 items-center">
                      <button
                        type="button"
                        className="px-2 py-1 border rounded"
                        onClick={() => setEditId(p.id)}
                      >
                        Edytuj
                      </button>

                      {/* DOMYŚLNIE: natywny picker + fallback */}
                      <button
                        type="button"
                        className="px-2 py-1 border rounded"
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
                            className="px-2 py-1 border rounded text-red-700"
                            onClick={async () => {
                              try {
                                await api.admin.deleteProduct(p.id);
                                load();
                              } catch (err: any) {
                                alert(err?.message || "Nie udało się usunąć produktu.");
                              }
                            }}
                          >
                            Usuń
                          </button>
                          <button
                            type="button"
                            className="px-2 py-1 border rounded text-white bg-red-600"
                            onClick={() => hardDeleteOne(p.id)}
                          >
                            Usuń trwale
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="px-2 py-1 border rounded"
                            onClick={async () => {
                              try {
                                await api.admin.updateProduct(p.id, { undelete: true });
                                load();
                              } catch (err: any) {
                                alert(err?.message || "Nie udało się przywrócić produktu.");
                              }
                            }}
                          >
                            Przywróć
                          </button>
                          <button
                            type="button"
                            className="px-2 py-1 border rounded text-white bg-red-600"
                            onClick={() => hardDeleteOne(p.id)}
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
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={page <= 1}
          className="px-3 py-1 border rounded"
          onClick={() => setPage((p) => p - 1)}
        >
          ←
        </button>
        <span>
          Strona {page}/{pages}
        </span>
        <button
          type="button"
          disabled={page >= pages}
          className="px-3 py-1 border rounded"
          onClick={() => setPage((p) => p + 1)}
        >
          →
        </button>
      </div>

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
    </div>
  );
}

/* ===========================
   CreateProductModal
=========================== */

function CreateProductModal({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  // przechowujemy cenę w polu tekstowym w zł, a zapisujemy jako cents
  const [form, setForm] = useState({
    name: "",
    slug: "",
    description: "",
    brand: "",
    category: "",
    sku: "",
    priceZl: "", // zł jako string (np. "99.99")
    stock: 0,
    color: "",
    size: "",
    personalize: false,
    featured: false,
  });
  const [file, setFile] = useState<File | null>(null);
  const [creating, setCreating] = useState(false);

  // lokalny fallback input
  const hiddenCreateRef = useRef<HTMLInputElement | null>(null);

  async function pickForCreate() {
    const f = await pickImageViaNativePicker();
    if (f) return setFile(f);
    hiddenCreateRef.current?.click();
  }

  // helper: parse zł->cents
  const parseZlToCents = (s: string): number => {
    const n = Number(String(s).replace(",", ".").trim());
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-5 w-full max-w-xl">
        <h2 className="text-lg font-bold mb-3">Nowy produkt</h2>

        <div className="grid grid-cols-2 gap-3">
          <label className="col-span-2 text-sm text-gray-600">Nazwa</label>
          <input
            className="border px-3 py-2 col-span-2"
            placeholder="Np. Kubek z nadrukiem"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />

          <label className="col-span-2 text-sm text-gray-600">Slug</label>
          <input
            className="border px-3 py-2 col-span-2"
            placeholder="np. kubek-z-nadrukiem"
            value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value })}
          />

          <label className="col-span-2 text-sm text-gray-600">Opis</label>
          <textarea
            className="border px-3 py-2 col-span-2"
            placeholder="Krótki opis produktu…"
            rows={3}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />

          <div className="grid grid-cols-2 gap-3 col-span-2">
            <div>
              <label className="text-sm text-gray-600">Marka</label>
              <input
                className="border px-3 py-2 w-full"
                placeholder="np. GiftStore"
                value={form.brand}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
              />
            </div>

            <div>
              <label className="text-sm text-gray-600">Kategoria</label>
              <input
                className="border px-3 py-2 w-full"
                placeholder="np. dla-niej / na-urodziny"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 col-span-2">
            <div>
              <label className="text-sm text-gray-600">SKU</label>
              <input
                className="border px-3 py-2 w-full"
                placeholder="np. KUBEK-RED-M"
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
              />
            </div>

            <div>
              <label className="text-sm text-gray-600">Cena (zł)</label>
              <input
                className="border px-3 py-2 w-full"
                inputMode="decimal"
                placeholder="np. 49.99"
                value={form.priceZl}
                onChange={(e) => setForm({ ...form, priceZl: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 col-span-2">
            <div>
              <label className="text-sm text-gray-600">Stan (szt.)</label>
              <input
                type="number"
                className="border px-3 py-2 w-full"
                placeholder="np. 25"
                value={form.stock}
                onChange={(e) => setForm({ ...form, stock: Number(e.target.value) || 0 })}
              />
            </div>
            <div>
              <label className="text-sm text-gray-600">Kolor</label>
              <input
                className="border px-3 py-2 w-full"
                placeholder="np. czerwony"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm text-gray-600">Rozmiar</label>
              <input
                className="border px-3 py-2 w-full"
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

          {/* Zdjęcie (opcjonalnie) */}
          <div className="col-span-2">
            <label className="block text-sm text-gray-600 mb-1">Zdjęcie (opcjonalnie)</label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="px-2 py-1 border rounded"
                onClick={pickForCreate}
              >
                Wybierz zdjęcie
              </button>
              {file && <span className="text-xs text-gray-600 truncate max-w-[220px]">{file.name}</span>}
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
          <button type="button" className="px-3 py-1 border rounded" onClick={onClose} disabled={creating}>
            Anuluj
          </button>
          <button
            type="button"
            className="px-3 py-1 bg-gold text-mainRed rounded font-bold"
            disabled={creating}
            onClick={async () => {
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
                  category: form.category,
                  variant: {
                    sku: form.sku || form.slug.toUpperCase(),
                    priceCents,
                    stock: form.stock,
                    // ⬇ ważne: undefined zamiast null (żeby zgadzało się z typami api.ts)
                    color: form.color || undefined,
                    size: form.size || undefined,
                    personalize: !!form.personalize,
                  },
                });

                const productId = created?.product?.id;
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
            }}
          >
            Zapisz
          </button>
        </div>
      </div>
    </div>
  );
}

/* ===========================
   EditProductModal
=========================== */

function EditProductModal({
  id,
  onClose,
  onDone,
}: {
  id: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [product, setProduct] = useState<ProductRow | null>(null);

  // product fields
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [brand, setBrand] = useState<string>("");
  const [category, setCategory] = useState<string>("");
  const [featured, setFeatured] = useState(false);

  // first variant fields
  const [variantId, setVariantId] = useState<string | undefined>(undefined);
  const [variantSku, setVariantSku] = useState<string>("");
  const [variantZl, setVariantZl] = useState<string>(""); // zł string
  const [variantStock, setVariantStock] = useState<number>(0);
  const [variantColor, setVariantColor] = useState<string>("");
  const [variantSize, setVariantSize] = useState<string>("");
  const [variantPersonalize, setVariantPersonalize] = useState<boolean>(false);

  const [uploading, setUploading] = useState(false);
  const hiddenEditRef = useRef<HTMLInputElement | null>(null);

  const parseZlToCents = (s: string): number => {
    const n = Number(String(s).replace(",", ".").trim());
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
  };

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

  async function saveVariant(variantId: string, payload: {
    sku?: string | null;
    priceCents?: number;
    stock?: number;
    color?: string | undefined;
    size?: string | undefined;
    personalize?: boolean;
  }) {
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
      const p = res.product as ProductRow;
      setProduct(p);
      setName(p.name || "");
      setSlug(p.slug || "");
      setDescription((p?.description as string) || "");
      setBrand((p?.brand as string) || "");
      setCategory((p?.category as string) || "");
      setFeatured(!!p?.featured);

      const v = p.variants?.[0];
      setVariantId(v?.id);
      setVariantSku((v?.sku as string) || "");
      setVariantZl(typeof v?.priceCents === "number" ? (v.priceCents / 100).toFixed(2) : "");
      setVariantStock(typeof v?.stock === "number" ? v.stock : 0);
      setVariantColor((v?.color as string) || "");
      setVariantSize((v?.size as string) || "");
      setVariantPersonalize(!!v?.personalize);
    } catch (err: any) {
      console.error("[EditProduct] load() failed:", err);
      alert(err?.message || "Nie udało się pobrać produktu.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl p-4 w-full max-w-lg">Ładowanie…</div>
      </div>
    );
  }
  if (!product) return null;

  const imgSrc = (url: string) => {
    if (!url) return "";
    if (/^https?:\/\//i.test(url)) return url;
    return `${API_BASE}${url.startsWith("/") ? url : `/${url}`}`;
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-5 w-full max-w-3xl">
        <h2 className="text-lg font-bold mb-3">Edytuj: {product.name}</h2>

        {/* Podstawowe dane */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="text-sm text-gray-600">Nazwa</label>
            <input
              className="border px-3 py-2 w-full"
              placeholder="Np. Kubek z nadrukiem"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm text-gray-600">Slug</label>
            <input
              className="border px-3 py-2 w-full"
              placeholder="np. kubek-z-nadrukiem"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
            />
          </div>
          <div className="col-span-2">
            <label className="text-sm text-gray-600">Opis</label>
            <textarea
              className="border px-3 py-2 w-full"
              rows={3}
              placeholder="Krótki opis produktu…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm text-gray-600">Marka</label>
            <input
              className="border px-3 py-2 w-full"
              placeholder="np. GiftStore"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm text-gray-600">Kategoria</label>
            <input
              className="border px-3 py-2 w-full"
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
              <label className="text-sm text-gray-600">SKU</label>
              <input
                className="border px-3 py-2 w-full"
                placeholder="np. KUBEK-RED-M"
                value={variantSku}
                onChange={(e) => setVariantSku(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm text-gray-600">Cena (zł)</label>
              <input
                className="border px-3 py-2 w-full"
                inputMode="decimal"
                placeholder="np. 49.99"
                value={variantZl}
                onChange={(e) => setVariantZl(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm text-gray-600">Stan (szt.)</label>
              <input
                type="number"
                className="border px-3 py-2 w-full"
                placeholder="np. 25"
                value={variantStock}
                onChange={(e) => setVariantStock(Number(e.target.value) || 0)}
              />
            </div>
            <div>
              <label className="text-sm text-gray-600">Kolor</label>
              <input
                className="border px-3 py-2 w-full"
                placeholder="np. czerwony"
                value={variantColor}
                onChange={(e) => setVariantColor(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm text-gray-600">Rozmiar</label>
              <input
                className="border px-3 py-2 w-full"
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
                className="px-2 py-1 border rounded"
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

          {product.media?.length ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {product.media.map((m) => (
                <div key={m.id} className="border rounded-lg p-2 flex flex-col items-center">
                  {/* eslint-disable-next-line jsx-a11y/alt-text */}
                  <img src={imgSrc(m.url)} className="w-full aspect-square object-cover rounded" />
                  <button
                    type="button"
                    className="mt-2 text-sm px-2 py-1 border rounded hover:bg-gray-50"
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
            <div className="text-sm text-gray-500">Brak obrazków.</div>
          )}
        </div>

        {/* Akcje */}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="px-3 py-1 border rounded" onClick={onClose}>
            Zamknij
          </button>
          <button
            type="button"
            className="px-3 py-1 bg-mainRed text-white rounded"
            onClick={async () => {
              try {
                // 1) zapis produktu
                await api.admin.updateProduct(product.id, {
                  name,
                  slug,
                  description,
                  brand,
                  category,
                  featured,
                });

                // 2) zapis pierwszego wariantu (wszystkie pola na raz) przez PATCH /variants/:id
                if (variantId) {
                  const payload = {
                    sku: variantSku || null,
                    priceCents: parseZlToCents(variantZl),
                    stock: variantStock,
                    // ⬇ zgodne z typami: undefined gdy pole puste
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
            }}
          >
            Zapisz
          </button>
        </div>
      </div>
    </div>
  );
}

/* ===========================
   ImportPopularGiftsModal
=========================== */

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

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-4 w-full max-w-2xl">
        <h2 className="text-lg font-bold mb-3">Import PopularGifts (seed z backendu)</h2>
        <p className="text-sm text-gray-700 mb-2">
          Ten import wywołuje endpoint <code>/api/admin/seed/popular</code> po stronie backendu. Zaznacz „upsert”, aby
          aktualizować już istniejące pozycje.
        </p>

        <label className="flex items-center gap-2 mb-3">
          <input type="checkbox" checked={upsert} onChange={(e) => setUpsert(e.target.checked)} />
          Tryb upsert (aktualizuj jeśli istnieje)
        </label>

        <div className="border rounded p-2 h-48 overflow-auto text-xs bg-gray-50 mb-3">
          {log.length ? (
            log.map((l, i) => (
              <div key={i} className="whitespace-pre-wrap">
                {l}
              </div>
            ))
          ) : (
            <div className="text-gray-500">Log…</div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" className="px-3 py-1 border rounded" onClick={onClose} disabled={running}>
            Zamknij
          </button>
          <button
            type="button"
            className="px-3 py-1 bg-mainRed text-white rounded disabled:opacity-60"
            disabled={running}
            onClick={async () => {
              setRunning(true);
              setLog([]);
              try {
                push("Start importu…");
                await ensureCsrf();

                const csrf = getCookie("csrf");
                const res = await fetch(`${API_BASE}/api/admin/seed/popular`, {
                  method: "POST",
                  credentials: "include",
                  headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
                  body: JSON.stringify({ mode: upsert ? "upsert" : "insert" }),
                });
                if (!res.ok) throw new Error(await readError(res));
                const data = await res.json();

                push(`Utworzono/zaktualizowano: ${data.createdCount ?? 0} produktów.`);
                if (Array.isArray(data.created) && data.created.length) {
                  for (const row of data.created) push(`  • ${row.slug} (${row.id})`);
                }
                alert(`Import zakończony. Utworzono/zaktualizowano: ${data.createdCount ?? 0}`);
                onDone();
              } catch (err: any) {
                console.error("[ImportPopularGifts] error", err);
                push(`❌ Błąd: ${err?.message || String(err)}`);
                alert(err?.message || "Import nie powiódł się.");
              } finally {
                setRunning(false);
              }
            }}
          >
            Start importu
          </button>
        </div>
      </div>
    </div>
  );
}
