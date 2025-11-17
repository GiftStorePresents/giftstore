// =======================================================================
// src/pages/AdminInspirationsPage.tsx — Gift Store (Admin)
// - CRUD inspiracji (lewa kolumna)
// - Prawa kolumna: szybkie przypinanie produktów z listy wszystkich
//   + podgląd produktów już przypiętych do wybranej inspiracji
// - Edytor domyślnych ikon inspiracji (SiteSetting: inspiration_defaults)
// =======================================================================

import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

/* =========================
 * Typy
 * ========================= */
type Inspiration = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  imageUrl?: string | null;
  active?: boolean;
  position?: number;
  createdAt?: string;
  updatedAt?: string;
};

type ProductBasic = {
  id: string;
  slug: string;
  name: string;
};

type Paged<T> = { items: T[]; total: number; skip: number; take: number };

/* =========================
 * Konfiguracja endpointów
 * ========================= */
const API_BASE = "/api";
const ADMIN_BASE = `${API_BASE}/admin`;
const SEED_URL = `${ADMIN_BASE}/seed/inspirations`;

/* =========================
 * Pomocnicze
 * ========================= */
function slugify(s: string) {
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

// cichy fetch – zawsze zwraca { ok, status, data }
async function fetchMaybeJson(
  url: string,
  init?: RequestInit
): Promise<{ ok: boolean; status: number; data: any }> {
  try {
    const r = await fetch(url, {
      credentials: "include",
      cache: "no-store",
      ...init,
      headers: {
        ...(init?.headers || {}),
      },
    });
    const text = await r.text();
    let json: any = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = {};
    }
    return { ok: r.ok, status: r.status, data: json };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

const PAGE = 25;

/* =========================
 * Opcje ikon (po slug)
 * ========================= */
const ICON_OPTIONS = [
  { value: "heart", label: "Serce" },
  { value: "cake", label: "Tort" },
  { value: "child", label: "Dziecko" },
  { value: "coffee", label: "Kawa" },
  { value: "gift", label: "Prezent" },
  { value: "star", label: "Gwiazda" },
];

/* =========================
 * API hook
 * ========================= */
function useAdminInspirations() {
  return {
    importFromSeed: async () => {
      const res = await fetchMaybeJson(SEED_URL, { method: "POST" });
      if (res.ok) return { ok: true };
      return { ok: false, error: res.data?.error || `HTTP ${res.status}` };
    },

    // Inspiracje
    listInspirations: async (): Promise<Inspiration[]> => {
      const r = await fetchMaybeJson(`${ADMIN_BASE}/inspirations`);
      if (r.ok) return Array.isArray(r.data) ? r.data : r.data?.items || [];
      return [];
    },
    createInspiration: async (
      payload: Partial<Inspiration>
    ): Promise<Inspiration> => {
      const r = await fetchMaybeJson(`${ADMIN_BASE}/inspirations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(r.data?.error || `HTTP ${r.status}`);
      return r.data;
    },
    updateInspiration: async (id: string, payload: Partial<Inspiration>) => {
      const r = await fetchMaybeJson(`${ADMIN_BASE}/inspirations/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(r.data?.error || `HTTP ${r.status}`);
      return r.data;
    },
    deleteInspiration: async (id: string) => {
      const r = await fetchMaybeJson(`${ADMIN_BASE}/inspirations/${id}`, {
        method: "DELETE",
      });
      if (!r.ok) throw new Error(r.data?.error || `HTTP ${r.status}`);
      return r.data;
    },
    uploadInspirationImage: async (id: string, file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetchMaybeJson(`${ADMIN_BASE}/inspirations/${id}/image`, {
        method: "POST",
        body: fd,
      });
      if (!r.ok) throw new Error(r.data?.error || `HTTP ${r.status}`);
      return r.data;
    },

    // Produkty – źródło: /api/admin/products
    listProducts: async (
      skip = 0,
      take = 25,
      q?: string
    ): Promise<Paged<ProductBasic>> => {
      const page = Math.floor(skip / take) + 1;
      const url = `${ADMIN_BASE}/products?limit=${take}&page=${page}${
        q?.trim() ? `&q=${encodeURIComponent(q.trim())}` : ""
      }`;
      const r = await fetchMaybeJson(url);
      if (r.ok) {
        const items: ProductBasic[] = (r.data?.items || []).map((p: any) => ({
          id: p.id,
          slug: p.slug,
          name: p.name,
        }));
        return {
          items,
          total: Number(r.data?.total ?? items.length),
          skip,
          take,
        };
      }
      // fallback: pusto
      return { items: [], total: 0, skip, take };
    },

    // Produkty przypięte
    listAssigned: async (
      inspirationId: string,
      skip = 0,
      take = 25,
      q?: string
    ): Promise<Paged<ProductBasic>> => {
      const u = new URL(
        `${ADMIN_BASE}/inspirations/${inspirationId}/products`,
        window.location.origin
      );
      u.searchParams.set("skip", String(skip));
      u.searchParams.set("take", String(take));
      if (q?.trim()) u.searchParams.set("q", q.trim());
      const r = await fetchMaybeJson(
        u.toString().replace(window.location.origin, "")
      );
      if (r.ok) {
        return {
          items: Array.isArray(r.data?.items) ? r.data.items : [],
          total: Number(r.data?.total ?? 0),
          skip,
          take,
        };
      }
      return { items: [], total: 0, skip, take };
    },

    // Przypinanie / odpinanie
    assign: async (inspirationId: string, productIds: string[]) => {
      const r = await fetchMaybeJson(
        `${ADMIN_BASE}/inspirations/${inspirationId}/assign`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productIds }),
        }
      );
      return r.ok;
    },
    unassign: async (inspirationId: string, productIds: string[]) => {
      const r = await fetchMaybeJson(
        `${ADMIN_BASE}/inspirations/${inspirationId}/unassign`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productIds }),
        }
      );
      return r.ok;
    },
  };
}

/* =========================
 * Strona
 * ========================= */

export default function AdminInspirationsPage() {
  const api = useAdminInspirations();

  // inspiracje (lewa kolumna)
  const [inspirations, setInspirations] = useState<Inspiration[]>([]);
  const [loadingInsp, setLoadingInsp] = useState(false);
  const [currentId, setCurrentId] = useState<string>("");

  // formularz nowej
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newActive, setNewActive] = useState(true);
  const [newFile, setNewFile] = useState<File | null>(null);

  // edycja
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editActive, setEditActive] = useState(true);

  // prawa: wszystkie produkty
  const [qAll, setQAll] = useState("");
  const [all, setAll] = useState<Paged<ProductBasic>>({
    items: [],
    total: 0,
    skip: 0,
    take: PAGE,
  });
  const [targetForRow, setTargetForRow] = useState<Record<string, string>>(
    {}
  ); // productId -> inspirationId
  const [adding, setAdding] = useState<Record<string, boolean>>({}); // productId -> loading

  // prawa: przypięte do currentId
  const [qPinned, setQPinned] = useState("");
  const [pinned, setPinned] = useState<Paged<ProductBasic>>({
    items: [],
    total: 0,
    skip: 0,
    take: PAGE,
  });
  const [removing, setRemoving] = useState<Record<string, boolean>>({}); // productId -> loading

  // domyślne ikony (SiteSetting: inspiration_defaults)
  const [defaults, setDefaults] = useState<Record<string, string>>({});

  useEffect(() => {
    setNewSlug(slugify(newName));
  }, [newName]);

  /* ====== LOADERS ====== */
  async function loadInspirations() {
    setLoadingInsp(true);
    try {
      const list = await api.listInspirations();
      list.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
      setInspirations(list);
      if (!currentId && list[0]) setCurrentId(list[0].id);
    } finally {
      setLoadingInsp(false);
    }
  }

  async function loadAll(skip = 0) {
    const r = await api.listProducts(skip, PAGE, qAll);
    setAll(r);
  }

  async function loadPinned(skip = 0) {
    if (!currentId) {
      setPinned({ items: [], total: 0, skip: 0, take: PAGE });
      return;
    }
    const r = await api.listAssigned(currentId, skip, PAGE, qPinned);
    setPinned(r);
  }

  // ładowanie inspiracji
  useEffect(() => {
    loadInspirations();
  }, []);

  // ładowanie produktów (wszystkie)
  useEffect(() => {
    loadAll(0);
  }, [qAll]);

  // ładowanie przypiętych
  useEffect(() => {
    loadPinned(0);
  }, [currentId, qPinned]);

  // ładowanie domyślnych ikon z admina
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${ADMIN_BASE}/inspirations/defaults`, {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) return;
        const json = await res.json();
        if (json && typeof json === "object") {
          setDefaults(json);
        }
      } catch {
        // ignorujemy błąd – brak domyślnych = pusty obiekt
      }
    })();
  }, []);

  /* ====== CRUD ====== */
  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim() || !newSlug.trim()) return;
    const created = await api.createInspiration({
      name: newName.trim(),
      slug: newSlug.trim(),
      description: newDesc.trim() || null,
      active: newActive,
    });
    if (newFile) {
      try {
        await api.uploadInspirationImage(created.id, newFile);
      } catch {}
    }
    setNewName("");
    setNewSlug("");
    setNewDesc("");
    setNewActive(true);
    setNewFile(null);
    await loadInspirations();
  }

  function startEdit(i: Inspiration) {
    setEditId(i.id);
    setEditName(i.name);
    setEditSlug(i.slug);
    setEditDesc(i.description || "");
    setEditActive(!!i.active);
  }

  async function saveEdit() {
    if (!editId) return;
    await api.updateInspiration(editId, {
      name: editName.trim(),
      slug: editSlug.trim(),
      description: editDesc.trim(),
      active: editActive,
    });
    setEditId(null);
    await loadInspirations();
  }

  async function removeInspiration(id: string) {
    if (!confirm("Usunąć inspirację? (produkty zostaną tylko odpięte)")) return;
    await api.deleteInspiration(id);
    if (currentId === id) setCurrentId("");
    await loadInspirations();
  }

  /* ====== ASSIGN / UNASSIGN ====== */
  async function assignSingle(productId: string, inspirationId?: string) {
    const target = inspirationId || targetForRow[productId] || currentId;
    if (!target) {
      alert("Wybierz inspirację w selektorze lub po lewej na liście.");
      return;
    }
    setAdding((m) => ({ ...m, [productId]: true }));
    const ok = await api.assign(target, [productId]);
    setAdding((m) => ({ ...m, [productId]: false }));
    if (!ok) {
      alert("❌ Nie udało się przypiąć produktu.");
      return;
    }
    if (target === currentId) await loadPinned(pinned.skip);
  }

  async function unassignSingle(productId: string) {
    if (!currentId) return;
    setRemoving((m) => ({ ...m, [productId]: true }));
    const ok = await api.unassign(currentId, [productId]);
    setRemoving((m) => ({ ...m, [productId]: false }));
    if (!ok) {
      alert("❌ Nie udało się odpiąć produktu.");
      return;
    }
    await loadPinned(pinned.skip);
  }

  /* ====== Import z seeda ====== */
  async function importSeed() {
    if (!confirm("Zaimportować inspiracje z seeda?")) return;
    const r = await api.importFromSeed();
    if (!r.ok) {
      alert(`❌ Błąd importu: ${r.error || "unknown"}`);
      return;
    }
    alert("✅ Zaimportowano.");
    await loadInspirations();
  }

  /* ====== ZAPIS DOMYŚLNYCH IKON ====== */
  const saveDefaults = async () => {
    try {
      const res = await fetch(`${ADMIN_BASE}/inspirations/defaults`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(defaults),
      });
      if (!res.ok) {
        alert("❌ Błąd zapisu domyślnych ikon.");
        return;
      }
      alert("✅ Zapisano domyślne ikony.");
    } catch {
      alert("❌ Błąd sieci przy zapisie domyślnych ikon.");
    }
  };

  /* ====== RENDER ====== */
  const current = inspirations.find((i) => i.id === currentId) || null;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Inspiracje — panel admina</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={importSeed}
            className="rounded-lg border px-3 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/10"
          >
            ⬇ Importuj z seeda
          </button>
          <Link
            to="/admin"
            className="rounded-lg border px-3 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/10"
          >
            ← Powrót do panelu
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* LEFT: CRUD inspiracji */}
        <div className="space-y-6">
          <section className="rounded-2xl border p-4 shadow-sm dark:border-white/10">
            <h2 className="mb-3 text-lg font-semibold">Nowa inspiracja</h2>
            <form onSubmit={onCreate} className="grid gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium">Nazwa</label>
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="mt-1 w-full rounded-lg border px-3 py-2 dark:border-white/15 dark:bg-white/5"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium">Slug</label>
                  <input
                    value={newSlug}
                    onChange={(e) => setNewSlug(slugify(e.target.value))}
                    className="mt-1 w-full rounded-lg border px-3 py-2 dark:border-white/15 dark:bg-white/5"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium">
                  Opis (opcjonalnie)
                </label>
                <textarea
                  rows={2}
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  className="mt-1 w-full rounded-lg border px-3 py-2 dark:border-white/15 dark:bg-white/5"
                />
              </div>
              <div className="flex items-center gap-3">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={newActive}
                    onChange={(e) => setNewActive(e.target.checked)}
                  />
                  Aktywna
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) =>
                    setNewFile(e.target.files?.[0] ?? null)
                  }
                  className="text-sm"
                />
              </div>
              <button
                type="submit"
                className="inline-flex items-center rounded-lg bg-mainRed px-4 py-2 text-white hover:opacity-90"
                disabled={!newName.trim() || !newSlug.trim()}
              >
                ➕ Dodaj inspirację
              </button>
            </form>
          </section>

          <section className="rounded-2xl border p-4 shadow-sm dark:border-white/10">
            <div className="mb-3 flex items-center justify_between">
              <h2 className="text-lg font-semibold">Lista inspiracji</h2>
              <button
                onClick={loadInspirations}
                className="rounded-lg border px-3 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/10"
              >
                Odśwież
              </button>
            </div>

            <div className="space-y-3">
              {loadingInsp ? (
                <div>Ładowanie…</div>
              ) : inspirations.length === 0 ? (
                <div className="text-sm">Brak inspiracji.</div>
              ) : (
                inspirations.map((i) => {
                  const editing = editId === i.id;
                  const isCurrent = currentId === i.id;
                  return (
                    <div
                      key={i.id}
                      className={`rounded-xl p-3 border dark:border-white/10 ${
                        isCurrent ? "ring-2 ring-gold" : ""
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setCurrentId(i.id)}
                          title="Pracuj na tej inspiracji"
                          className="shrink-0 w-12 h-12 rounded overflow-hidden bg-black/5 dark:bg-white/10"
                        >
                          {i.imageUrl ? (
                            <img
                              src={i.imageUrl}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : null}
                        </button>

                        <div className="flex-1 min-w-0">
                          {editing ? (
                            <>
                              <input
                                value={editName}
                                onChange={(e) =>
                                  setEditName(e.target.value)
                                }
                                className="mb-2 w-full rounded-lg border px-3 py-2 text-sm dark:border-white/15 dark:bg-white/5"
                              />
                              <div className="grid gap-2 sm:grid-cols-2">
                                <input
                                  value={editSlug}
                                  onChange={(e) =>
                                    setEditSlug(
                                      slugify(e.target.value)
                                    )
                                  }
                                  className="w-full rounded-lg border px-3 py-2 text-sm dark:border-white/15 dark:bg-white/5"
                                />
                                <label className="inline-flex items-center gap-2 text-sm">
                                  <input
                                    type="checkbox"
                                    checked={editActive}
                                    onChange={(e) =>
                                      setEditActive(
                                        e.target.checked
                                      )
                                    }
                                  />
                                  Aktywna
                                </label>
                              </div>
                              <textarea
                                rows={2}
                                value={editDesc}
                                onChange={(e) =>
                                  setEditDesc(e.target.value)
                                }
                                className="mt-2 w-full rounded-lg border px-3 py-2 text-sm dark:border-white/15 dark:bg-white/5"
                              />
                            </>
                          ) : (
                            <>
                              <div className="font-semibold">
                                {i.name}{" "}
                                {i.active === false && (
                                  <span className="text-xs text-neutral-500">
                                    (wyłączona)
                                  </span>
                                )}
                              </div>
                              <div className="text-sm text-neutral-600 dark:text-neutral-300 truncate">
                                {i.description}
                              </div>
                            </>
                          )}
                        </div>

                        {!editing ? (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                const input =
                                  document.createElement("input");
                                input.type = "file";
                                input.accept = "image/*";
                                input.onchange = async (e) => {
                                  const f = (
                                    e.target as HTMLInputElement
                                  ).files?.[0];
                                  if (!f) return;
                                  await api.uploadInspirationImage(
                                    i.id,
                                    f
                                  );
                                  await loadInspirations();
                                };
                                input.click();
                              }}
                              className="rounded-lg border px-3 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/10"
                            >
                              📸 Obraz
                            </button>
                            <button
                              onClick={() => startEdit(i)}
                              className="rounded-lg border px-3 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/10"
                            >
                              Edytuj
                            </button>
                            <button
                              onClick={() => removeInspiration(i.id)}
                              className="rounded-lg bg-red-600 px-3 py-1.5 text-sm text-white hover:opacity-90"
                            >
                              Usuń
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={saveEdit}
                              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm text-white hover:opacity-90"
                            >
                              Zapisz
                            </button>
                            <button
                              onClick={() => setEditId(null)}
                              className="rounded-lg border px-3 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/10"
                            >
                              Anuluj
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>

        {/* RIGHT: szybkie przypinanie + podgląd przypiętych */}
        <div className="space-y-6">
          {/* ====== SZYBKIE PRZYPINANIE Z LISTY WSZYSTKICH PRODUKTÓW ====== */}
          <section className="rounded-2xl border p-4 shadow-sm dark:border-white/10">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                Wszystkie produkty — szybkie przypinanie
              </h2>
              <div className="text-xs text-neutral-500">
                Źródło: /api/admin/products
              </div>
            </div>

            <div className="mb-3 flex items-center gap-2">
              <input
                value={qAll}
                onChange={(e) => setQAll(e.target.value)}
                placeholder="Szukaj produktów…"
                className="w-full rounded-lg border px-3 py-2 text-sm dark:border-white/15 dark:bg-white/5"
              />
              <button
                onClick={() => loadAll(0)}
                className="rounded-lg border px-3 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/10"
              >
                Szukaj
              </button>
            </div>

            <div className="max-h-[420px] overflow-auto rounded-md border dark:border-white/10">
              <table className="min-w-full">
                <thead>
                  <tr className="text-left text-xs uppercase text-neutral-500">
                    <th className="px-3 py-2">Produkt</th>
                    <th className="px-3 py-2 w-[320px]">Dodaj do</th>
                    <th className="px-2 py-2 w-[96px]"></th>
                  </tr>
                </thead>
                <tbody>
                  {all.items.map((p) => (
                    <tr
                      key={p.id}
                      className="align-middle odd:bg-black/5 dark:odd:bg-white/5"
                    >
                      <td className="px-3 py-2">
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-neutral-500">
                          {p.slug}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <select
                          className="w-full rounded-lg border px-3 py-2 text-sm dark:border-white/15 dark:bg-white/5"
                          value={
                            targetForRow[p.id] || currentId || ""
                          }
                          onChange={(e) =>
                            setTargetForRow((m) => ({
                              ...m,
                              [p.id]: e.target.value,
                            }))
                          }
                        >
                          <option value="" disabled>
                            — wybierz inspirację —
                          </option>
                          {inspirations.map((i) => (
                            <option key={i.id} value={i.id}>
                              {i.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-2">
                        <button
                          disabled={adding[p.id]}
                          onClick={() => assignSingle(p.id)}
                          className="rounded-lg bg-mainRed px-3 py-1.5 text-sm text-white hover:opacity-90 disabled:opacity-50"
                        >
                          {adding[p.id] ? "…" : "Dodaj"}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {all.items.length === 0 && (
                    <tr>
                      <td
                        className="px-3 py-6 text-sm text-neutral-500"
                        colSpan={3}
                      >
                        Brak wyników.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-neutral-500">
                Stron: {Math.max(1, Math.ceil(all.total / PAGE))}
              </span>
              <div className="flex gap-2">
                <button
                  disabled={all.skip <= 0}
                  onClick={() =>
                    loadAll(Math.max(0, all.skip - PAGE))
                  }
                  className="rounded-lg border px-2 py-1 text-xs hover:bg-black/5 dark:hover:bg-white/10"
                >
                  ←
                </button>
                <button
                  disabled={all.skip + PAGE >= all.total}
                  onClick={() => loadAll(all.skip + PAGE)}
                  className="rounded-lg border px-2 py-1 text-xs hover:bg-black/5 dark:hover:bg-white/10"
                >
                  →
                </button>
              </div>
            </div>
          </section>

          {/* ====== PRODUKTY W WYBRANEJ INSPIRACJI ====== */}
          <section className="rounded-2xl border p-4 shadow-sm dark:border-white/10">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                Produkty w inspiracji: {current?.name || "—"}
              </h2>
              <select
                className="rounded-lg border px-3 py-2 text-sm dark:border-white/15 dark:bg-white/5"
                value={currentId}
                onChange={(e) => setCurrentId(e.target.value)}
              >
                {inspirations.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="mb-3 flex items-center gap-2">
              <input
                value={qPinned}
                onChange={(e) => setQPinned(e.target.value)}
                placeholder="Szukaj w przypiętych…"
                className="w-full rounded-lg border px-3 py-2 text-sm dark:border-white/15 dark:bg-white/5"
              />
              <button
                onClick={() => loadPinned(0)}
                className="rounded-lg border px-3 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/10"
              >
                Szukaj
              </button>
            </div>

            <div className="max-h-[360px] overflow-auto rounded-md border dark:border-white/10">
              <table className="min-w-full">
                <tbody>
                  {pinned.items.map((p) => (
                    <tr
                      key={p.id}
                      className="align-middle odd:bg-black/5 dark:odd:bg-white/5"
                    >
                      <td className="px-3 py-2">
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-neutral-500">
                          {p.slug}
                        </div>
                      </td>
                      <td className="px-2 py-2 w-[120px] text-right">
                        <button
                          disabled={removing[p.id]}
                          onClick={() => unassignSingle(p.id)}
                          className="rounded-lg border px-3 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50"
                        >
                          {removing[p.id] ? "…" : "Odepnij"}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {pinned.items.length === 0 && (
                    <tr>
                      <td className="px-3 py-6 text-sm text-neutral-500">
                        Brak przypiętych.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-neutral-500">
                Stron: {Math.max(1, Math.ceil(pinned.total / PAGE))}
              </span>
              <div className="flex gap-2">
                <button
                  disabled={pinned.skip <= 0}
                  onClick={() =>
                    loadPinned(Math.max(0, pinned.skip - PAGE))
                  }
                  className="rounded-lg border px-2 py-1 text-xs hover:bg-black/5 dark:hover:bg-white/10"
                >
                  ←
                </button>
                <button
                  disabled={pinned.skip + PAGE >= pinned.total}
                  onClick={() => loadPinned(pinned.skip + PAGE)}
                  className="rounded-lg border px-2 py-1 text-xs hover:bg-black/5 dark:hover:bg-white/10"
                >
                  →
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* ====== PANEL: DOMYŚLNE IKONY (PO SLUG) ====== */}
      <div className="mt-10 rounded-2xl border p-4 shadow-sm dark:border-white/10">
        <h3 className="mb-3 font-bold text-mainRed">
          Domyślne ikony inspiracji (po slug)
        </h3>
        <p className="mb-3 text-xs text-neutral-500">
          Jeśli dana inspiracja nie ma własnego <code>iconKey</code> w
          bazie, użyta będzie domyślna ikona z tej tabeli. Gdy tutaj jest
          pusto, front użyje swojego kodowego fallbacku.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {inspirations.map((i) => (
            <div
              key={i.id}
              className="flex items-center gap-2 rounded-lg bg-black/5 px-2 py-1.5 text-sm dark:bg-white/5"
            >
              <code className="rounded bg-black/10 px-2 py-1 text-xs dark:bg-white/10">
                {i.slug}
              </code>
              <select
                className="flex-1 rounded border px-2 py-1 text-xs dark:border-white/20 dark:bg-white/5"
                value={defaults[i.slug] || ""}
                onChange={(e) => {
                  const val = e.target.value;
                  setDefaults((prev) => {
                    const next = { ...prev };
                    if (val) next[i.slug] = val;
                    else delete next[i.slug];
                    return next;
                  });
                }}
              >
                <option value="">(brak — użyj fallbacku)</option>
                {ICON_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          ))}
          {inspirations.length === 0 && (
            <div className="text-sm text-neutral-500">
              Brak inspiracji — dodaj je wyżej, aby móc ustawić domyślne
              ikony.
            </div>
          )}
        </div>
        <div className="mt-3">
          <button
            onClick={saveDefaults}
            className="btn !rounded-xl bg-mainRed px-4 py-2 text-white hover:opacity-90"
          >
            Zapisz domyślne ikony
          </button>
        </div>
      </div>
    </div>
  );
}
