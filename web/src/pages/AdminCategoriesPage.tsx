// src/pages/AdminCategoriesPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AUTO_PAYLOAD } from "@shared/categories.seed";

/* =========================
 * Stałe / rezerwacje
 * ========================= */
const SOURCE_UNCAT = "__uncat__";
const SOURCE_UNCAT_SLUG = "bez-kategorii"; // zarezerwowane, nie tworzymy/nie edytujemy

/* =========================
 * Typy
 * ========================= */
type Category = {
  id: string;
  name: string;
  slug: string;
  imageUrl?: string | null;
  showInHeader?: boolean;
  showInTiles?: boolean;
  showInHero?: boolean;          // ⬅️ NOWE
  _count?: { products: number };
  createdAt?: string;
  updatedAt?: string;
};

type Product = {
  id: string;
  slug: string;
  name: string;
  brand?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type PagedProducts = {
  items: Product[];
  total: number;
  skip: number;
  take: number;
};

type UncatResponse = PagedProducts;

/* =========================
 * Utils
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

function human(s: string) {
  const t = s.trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/* =========================
 * Bezpieczne fetchowanie JSON
 * ========================= */
async function safeFetchJson(url: string, init?: RequestInit) {
  const r = await fetch(url, init);
  const text = await r.text();
  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {}
  if (!r.ok) {
    const msg = json?.error || json?.message || text || `HTTP ${r.status}`;
    throw new Error(msg);
  }
  return json;
}

/* =========================
 * Upload obrazka kategorii
 * ========================= */
async function uploadCategoryImage(categoryId: string, file: File) {
  const send = async (suffix: string, field: "file" | "image") => {
    const fd = new FormData();
    fd.append(field, file);
    return fetch(`/api/admin/categories/${encodeURIComponent(categoryId)}${suffix}`, {
      method: "POST",
      credentials: "include",
      body: fd,
    });
  };

  // próbujemy kilka wariantów backendu
  let res = await send("/image", "file");
  if (res.status === 404 || res.status === 405) res = await send("/upload-image", "file");
  if (res.status === 404 || res.status === 405) res = await send("/images", "file");
  if (res.status === 400 || res.status === 415) res = await send("/image", "image");

  const txt = await res.text();
  let json: any = {};
  try {
    json = txt ? JSON.parse(txt) : {};
  } catch {}
  if (!res.ok) throw new Error(json?.error || json?.message || txt || `HTTP ${res.status}`);
  return json;
}

/* =========================
 * API Hook
 * ========================= */
function useAdminCategories() {
  return {
    list: async (): Promise<Category[]> => {
      return safeFetchJson("/api/admin/categories", { credentials: "include" }).then((data) => {
        const arr = Array.isArray(data) ? data : data?.items ?? [];
        return Array.isArray(arr) ? arr : [];
      });
    },

    create: async (data: {
      name: string;
      slug: string;
      showInHeader?: boolean;
      showInTiles?: boolean;
      showInHero?: boolean;     // ⬅️ dopuszczamy flagę
    }) =>
      safeFetchJson("/api/admin/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      }),

    update: async (
      id: string,
      data: Partial<{
        name: string;
        slug: string;
        showInHeader: boolean;
        showInTiles: boolean;
        showInHero: boolean;    // ⬅️ dopuszczamy flagę
        imageUrl?: string | null;
      }>
    ) =>
      safeFetchJson(`/api/admin/categories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      }),

    remove: async (id: string, params: { mode: "orphan" | "move"; targetId?: string | null }) => {
      const q =
        params.mode === "move" && params.targetId
          ? `?mode=move&targetId=${encodeURIComponent(params.targetId)}`
          : "?mode=orphan";
      return safeFetchJson(`/api/admin/categories/${id}${q}`, {
        method: "DELETE",
        credentials: "include",
      });
    },

    reassign: async (id: string, productIds: string[]) =>
      safeFetchJson(`/api/admin/categories/${id}/reassign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ productIds }),
      }),

    // UNCATEGORIZED
    loadUncategorized: async (skip = 0, take = 50, q?: string): Promise<UncatResponse> => {
      const url = new URL("/api/admin/categories/uncategorized", window.location.origin);
      url.searchParams.set("skip", String(skip));
      url.searchParams.set("take", String(take));
      if (q?.trim()) url.searchParams.set("q", q.trim());
      return safeFetchJson(url.toString().replace(window.location.origin, ""), {
        credentials: "include",
      });
    },

    // Produkty w kategorii
    loadCategoryProducts: async (categoryId: string, skip = 0, take = 50, q?: string): Promise<PagedProducts> => {
      const url = new URL(`/api/admin/categories/${encodeURIComponent(categoryId)}/products`, window.location.origin);
      url.searchParams.set("skip", String(skip));
      url.searchParams.set("take", String(take));
      if (q?.trim()) url.searchParams.set("q", q.trim());
      return safeFetchJson(url.toString().replace(window.location.origin, ""), {
        credentials: "include",
      });
    },

    // Import / migracje
    importMap: async (payload: any) =>
      safeFetchJson("/api/admin/categories/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      }),

    migrateOldField: async (payload: any) =>
      safeFetchJson("/api/admin/categories/migrate-old-field", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      }),

    basicProducts: async (onlyUncategorized = true) =>
      safeFetchJson(`/api/admin/products/basic?onlyUncategorized=${onlyUncategorized}`, {
        credentials: "include",
      }),

    importExisting: async () =>
      safeFetchJson("/api/admin/categories/import-existing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      }),
  };
}

/* =========================
 * Komponent strony
 * ========================= */
const PAGE_SIZE = 25;

export default function AdminCategoriesPage() {
  const api = useAdminCategories();

  // KATEGORIE
  const [cats, setCats] = useState<Category[]>([]);
  const [loadingCats, setLoadingCats] = useState(false);

  // NOWA KATEGORIA
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [newFile, setNewFile] = useState<File | null>(null);
  const [showInHeader, setShowInHeader] = useState(true);
  const [showInTiles, setShowInTiles] = useState(true);
  const [showInHeroNew, setShowInHeroNew] = useState(false); // ⬅️ NOWE

  // PRAWA KOLUMNA
  const [sourceCatId, setSourceCatId] = useState<string>(SOURCE_UNCAT);
  const [list, setList] = useState<PagedProducts>({ items: [], total: 0, skip: 0, take: PAGE_SIZE });
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [loadingRight, setLoadingRight] = useState(false);

  // ZAZNACZENIA + PRZENOSZENIE
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [assignTarget, setAssignTarget] = useState<string>("");

  // EDYCJA INLINE
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editSlug, setEditSlug] = useState("");

  // DELETE MODAL
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteMode, setDeleteMode] = useState<"orphan" | "move">("orphan");
  const [deleteTargetId, setDeleteTargetId] = useState<string>("");

  // IMPORT / MIGRACJA
  const [csvText, setCsvText] = useState("");
  const [previewRows, setPreviewRows] = useState<Array<{ productSlug: string; category: string }>>([]);
  const [importBusy, setImportBusy] = useState(false);
  const [migrateBusy, setMigrateBusy] = useState(false);
  const [migrateReport, setMigrateReport] = useState<any | null>(null);
  const [dryRun, setDryRun] = useState(true);
  const [nameMapText, setNameMapText] = useState<string>(`Dla Niej => Dla niej|dla-niej
Dla Niego => Dla niego|dla-niego`);

  /* ===== Loaders ===== */
  const loadCategories = async () => {
    setLoadingCats(true);
    try {
      const data = await api.list();
      const filtered = (Array.isArray(data) ? data : []).filter(
        (c) => c.slug?.toLowerCase() !== SOURCE_UNCAT_SLUG
      );
      setCats(filtered);
    } finally {
      setLoadingCats(false);
    }
  };

  const loadRightPane = async () => {
    setLoadingRight(true);
    try {
      const skip = (page - 1) * PAGE_SIZE;
      let resp: PagedProducts | null = null;
      if (sourceCatId === SOURCE_UNCAT) {
        resp = await api.loadUncategorized(skip, PAGE_SIZE, query);
      } else {
        resp = await api.loadCategoryProducts(sourceCatId, skip, PAGE_SIZE, query);
      }
      setList({
        items: Array.isArray(resp?.items) ? resp!.items : [],
        total: Number(resp?.total ?? 0),
        skip: Number(resp?.skip ?? skip),
        take: Number(resp?.take ?? PAGE_SIZE),
      });
      setSelected({});
    } catch {
      setList({ items: [], total: 0, skip: 0, take: PAGE_SIZE });
    } finally {
      setLoadingRight(false);
    }
  };

  useEffect(() => {
    loadCategories();
    loadRightPane();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadRightPane();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, sourceCatId]);

  useEffect(() => {
    setNewSlug(slugify(newName));
  }, [newName]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(list.total / PAGE_SIZE)), [list.total]);
  const anySelected = useMemo(() => Object.values(selected).some(Boolean), [selected]);
  const selectedIds = useMemo(
    () => Object.entries(selected).filter(([, v]) => v).map(([id]) => id),
    [selected]
  );

  /* ===== Walidacje ===== */
  function checkCreateGuard(name: string, slug: string) {
    const n = name.trim();
    const s = slug.trim().toLowerCase();

    if (n.length < 2) throw new Error("Nazwa jest za krótka.");
    if (!s) throw new Error("Slug nie może być pusty.");
    if (s === SOURCE_UNCAT_SLUG) throw new Error(`Slug "${SOURCE_UNCAT_SLUG}" jest zarezerwowany.`);

    // duplikaty (case-insensitive)
    const dup = cats.some(
      (c) => c.name.trim().toLowerCase() === n.toLowerCase() || c.slug.trim().toLowerCase() === s
    );
    if (dup) throw new Error("Kategoria o takiej nazwie lub slugu już istnieje.");
  }

  /* ===== CRUD kategorii ===== */
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      checkCreateGuard(newName, newSlug);

      const created = await api.create({
        name: human(newName),
        slug: newSlug.trim().toLowerCase(),
        showInHeader,
        showInTiles,
        showInHero: showInHeroNew, // ⬅️ NOWE
      });

      if (newFile && created?.id) {
        await uploadCategoryImage(created.id, newFile);
      }

      setNewName("");
      setNewSlug("");
      setNewFile(null);
      setShowInHeader(true);
      setShowInTiles(true);
      setShowInHeroNew(false); // ⬅️ reset

      await loadCategories();
      window.dispatchEvent(new Event("categories:refresh"));
    } catch (e: any) {
      alert(`Błąd: ${e.message}`);
    }
  };

  const startEdit = (cat: Category) => {
    setEditingId(cat.id);
    setEditName(cat.name);
    setEditSlug(cat.slug);
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
    setEditSlug("");
  };

  const handleUpdate = async (id: string) => {
    try {
      const nm = editName.trim();
      const sl = editSlug.trim().toLowerCase();
      if (!nm || nm.length < 2) throw new Error("Nazwa jest za krótka.");
      if (!sl) throw new Error("Slug nie może być pusty.");
      if (sl === SOURCE_UNCAT_SLUG) throw new Error(`Slug "${SOURCE_UNCAT_SLUG}" jest zarezerwowany.`);

      const dup = cats.some(
        (c) =>
          c.id !== id &&
          (c.name.trim().toLowerCase() === nm.toLowerCase() || c.slug.trim().toLowerCase() === sl)
      );
      if (dup) throw new Error("Kategoria o takiej nazwie/slug już istnieje.");

      await api.update(id, { name: human(nm), slug: sl });
      await loadCategories();
      cancelEdit();
      window.dispatchEvent(new Event("categories:refresh"));
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    if (deleteMode === "move" && !deleteTargetId) return;
    try {
      await api.remove(deleteId, {
        mode: deleteMode,
        targetId: deleteMode === "move" ? deleteTargetId : null,
      });
      setDeleteId(null);
      setDeleteTargetId("");
      await Promise.all([loadCategories(), loadRightPane()]);
      window.dispatchEvent(new Event("categories:refresh"));
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleAssign = async () => {
    if (!assignTarget || !anySelected) return;
    try {
      await api.reassign(assignTarget, selectedIds);
      await Promise.all([loadRightPane(), loadCategories()]);
    } catch (e: any) {
      alert(e.message);
    }
  };

  const toggleAll = (checked: boolean) => {
    const next: Record<string, boolean> = {};
    list.items.forEach((p) => (next[p.id] = checked));
    setSelected(next);
  };

  /* ===== MIGRACJA legacy ===== */
  function parseNameMap(txt: string): Record<string, { name: string; slug?: string }> {
    const map: Record<string, { name: string; slug?: string }> = {};
    txt
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .forEach((line) => {
        const [lhs, rhs] = line.split("=>").map((s) => s.trim());
        if (!lhs || !rhs) return;
        const [name, slugMaybe] = rhs.split("|").map((s) => s.trim());
        if (!name) return;
        map[lhs] = { name, ...(slugMaybe ? { slug: slugMaybe } : {}) };
      });
    return map;
  }

  async function runMigration(which: "dry" | "do") {
    setMigrateBusy(true);
    try {
      const res = await api.migrateOldField({
        dryRun: which === "dry",
        nameMap: parseNameMap(nameMapText),
      });
      setMigrateReport(res);
      if (which === "do") {
        await Promise.all([loadCategories(), loadRightPane()]);
      }
      alert(which === "dry" ? "Podgląd gotowy (dry-run)." : "Migracja wykonana.");
    } catch (e: any) {
      alert(e?.message || "Błąd migracji. Użyj importu CSV/JSON.");
      setMigrateReport(null);
    } finally {
      setMigrateBusy(false);
    }
  }

  /* ===== Import ===== */
  async function importExistingOneClick() {
    try {
      const data = await api.importExisting().catch(() => ({} as any));

      if (!data || data?.ok === false) {
        try {
          const res = await api.importMap(AUTO_PAYLOAD as any);
          alert(`✅ Zaimportowano z AUTO_PAYLOAD. Zaktualizowano produktów: ${res?.totalUpdated ?? 0}.`);
          await Promise.all([loadCategories(), loadRightPane()]);
          return;
        } catch { /* fallback niżej */ }
        const usedFallback = await importFromFrontendSeed();
        if (!usedFallback) alert(data?.message || "Brak danych do automatycznego importu. Użyj CSV/JSON.");
      } else {
        alert(`Gotowe. Źródło: ${data.source}. Przypięto produktów: ${data.totalUpdated || 0}.`);
      }
      await Promise.all([loadCategories(), loadRightPane()]);
    } catch (e: any) {
      alert(e?.message || "Błąd importu.");
    }
  }

  async function importFromFrontendSeed(): Promise<boolean> {
    try {
      const mod: any = await import("@shared/categories.seed");
      const groups = (mod?.CATEGORIES_GROUPS ?? mod?.default) as
        | { category: string; productSlugs: string[] }[]
        | undefined;
      if (!groups || !Array.isArray(groups) || groups.length === 0) return false;

      const res = await api.importMap({ groups });
      alert(`Import z FE (seed). Zaktualizowano produktów: ${res?.totalUpdated ?? 0}.`);
      return true;
    } catch {
      return false;
    }
  }

  function parseCsvToRows(raw: string) {
    const lines = raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) return [];
    let start = 0;
    const first = lines[0].toLowerCase();
    if (first.includes("product") && first.includes("category")) start = 1;

    const rows: Array<{ productSlug: string; category: string }> = [];
    for (let i = start; i < lines.length; i++) {
      const line = lines[i];
      const parts = line
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (parts.length < 2) continue;
      const [productSlug, category] = parts;
      if (productSlug && category) rows.push({ productSlug, category });
    }
    return rows;
  }

  function handleParseCsv() {
    setPreviewRows(parseCsvToRows(csvText));
  }

  async function handleImport() {
    if (previewRows.length === 0) return;
    setImportBusy(true);
    try {
      const res = await api.importMap({ rows: previewRows });
      const msg = `Zaimportowano produktów: ${res?.totalUpdated ?? 0}. Kategorie z raportu: ${res?.report?.length ?? 0}.`;
      alert(msg);
      await Promise.all([loadCategories(), loadRightPane()]);
    } catch (e: any) {
      alert(e?.message || "Import nieudany.");
    } finally {
      setImportBusy(false);
    }
  }

  /* ===== RENDER ===== */
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Kategorie — panel admina</h1>
        <Link
          to="/admin"
          className="rounded-lg border px-3 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/10"
        >
          ← Powrót do panelu
        </Link>
      </div>

      {/* Przyciski główne */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <button
          onClick={importExistingOneClick}
          className="px-4 py-2 rounded-xl bg-red-600 text-white font-bold hover:opacity-90"
          title="Najpierw backend, jeśli brak – seed FE."
        >
          Importuj istniejące (1 klik)
        </button>

        <button
          onClick={() => {
            setSourceCatId(SOURCE_UNCAT);
            setPage(1);
            setQuery("");
            loadRightPane();
          }}
          className="px-4 py-2 rounded-xl border-2 border-amber-400 text-amber-400 hover:bg-amber-400/10"
        >
          Pokaż „Bez kategorii”
        </button>

        <button
          onClick={loadCategories}
          className="px-4 py-2 rounded-xl border hover:bg-black/5 dark:hover:bg-white/10"
        >
          Odśwież kategorie
        </button>
      </div>

      {/* GRID */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* LEFT */}
        <div className="space-y-6">
          {/* New category */}
          <section className="rounded-2xl border p-4 shadow-sm dark:border-white/10">
            <h2 className="mb-3 text-lg font-semibold">Nowa kategoria</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium">Nazwa</label>
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="mt-1 w-full rounded-lg border px-3 py-2 dark:border-white/15 dark:bg-white/5"
                    placeholder="np. Dla niej"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium">Slug</label>
                  <input
                    value={newSlug}
                    onChange={(e) => setNewSlug(slugify(e.target.value))}
                    className="mt-1 w-full rounded-lg border px-3 py-2 dark:border-white/15 dark:bg-white/5"
                    placeholder="np. dla-niej"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={showInHeader}
                    onChange={(e) => setShowInHeader(e.target.checked)}
                  />
                  <span className="text-sm">Pokaż w headerze</span>
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={showInTiles}
                    onChange={(e) => setShowInTiles(e.target.checked)}
                  />
                  <span className="text-sm">Pokaż w kafelkach</span>
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={showInHeroNew}
                    onChange={(e) => setShowInHeroNew(e.target.checked)}
                  />
                  <span className="text-sm">Pokaż w HeroSection</span>
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setNewFile(e.target.files?.[0] ?? null)}
                  className="text-sm"
                />
              </div>

              <button
                type="submit"
                className="inline-flex items-center rounded-lg bg-mainRed px-4 py-2 text-white hover:opacity-90"
                disabled={!newName.trim() || !newSlug.trim() || newSlug.trim().toLowerCase() === SOURCE_UNCAT_SLUG}
                title={
                  newSlug.trim().toLowerCase() === SOURCE_UNCAT_SLUG
                    ? `Slug "${SOURCE_UNCAT_SLUG}" jest zarezerwowany`
                    : ""
                }
              >
                ➕ Dodaj kategorię
              </button>
            </form>
          </section>

          {/* Categories table */}
          <section className="rounded-2xl border p-4 shadow-sm dark:border-white/10">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Lista kategorii</h2>
              <button
                onClick={loadCategories}
                className="rounded-lg border px-3 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/10"
              >
                Odśwież
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-y-2">
                <thead>
                  <tr className="text-left text-sm text-neutral-600 dark:text-neutral-300">
                    <th className="px-3 py-2">Obrazek</th>
                    <th className="px-3 py-2">Nazwa</th>
                    <th className="px-3 py-2">Slug</th>
                    <th className="px-3 py-2">Produkty</th>
                    {/* brak kolumny „Akcje” – przyciski pod nazwą */}
                  </tr>
                </thead>
                <tbody>
                  {loadingCats ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-sm">
                        Ładowanie…
                      </td>
                    </tr>
                  ) : cats.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-sm">
                        Brak kategorii.
                      </td>
                    </tr>
                  ) : (
                    cats
                      .slice()
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((cat) => {
                        const isEditing = editingId === cat.id;
                        return (
                          <tr key={cat.id} className="rounded-xl bg-black/[0.02] dark:bg-white/[0.03]">
                            <td className="px-3 py-2 align-middle">
                              {cat.imageUrl ? (
                                <img
                                  src={cat.imageUrl}
                                  alt={cat.name}
                                  className="w-12 h-12 rounded object-cover"
                                />
                              ) : (
                                <span className="text-xs text-gray-400 italic">brak</span>
                              )}
                            </td>

                            {/* NAZWA + AKCJE POD NIĄ */}
                            <td className="px-3 py-2 align-middle">
                              {isEditing ? (
                                <>
                                  <input
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    className="mb-2 w-full rounded-lg border px-3 py-2 text-sm dark:border-white/15 dark:bg-white/5"
                                  />
                                  <div className="flex flex-wrap items-center gap-2">
                                    <button
                                      onClick={() => handleUpdate(cat.id)}
                                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm text-white hover:opacity-90"
                                    >
                                      Zapisz
                                    </button>
                                    <button
                                      onClick={cancelEdit}
                                      className="rounded-lg border px-3 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/10"
                                    >
                                      Anuluj
                                    </button>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <button
                                    className="rounded px-1 text-left font-medium hover:bg-black/5 dark:hover:bg-white/10"
                                    onClick={() => startEdit(cat)}
                                    title="Kliknij, aby edytować"
                                  >
                                    {cat.name}
                                  </button>

                                  {/* AKCJE + toggle Hero w jednej linii */}
                                  <div className="mt-2 flex flex-wrap items-center gap-2">
                                    <button
                                      onClick={() => startEdit(cat)}
                                      className="inline-flex items-center rounded-lg border px-3 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/10"
                                    >
                                      Edytuj
                                    </button>
                                    <button
                                      onClick={() => uploadCategoryImagePrompt(cat.id)}
                                      className="inline-flex items-center rounded-lg border px-3 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/10"
                                    >
                                      📸 Zmień obrazek
                                    </button>
                                    <button
                                      onClick={() => {
                                        setDeleteId(cat.id);
                                        setDeleteMode("orphan"); // → „Bez kategorii”
                                        setDeleteTargetId("");
                                      }}
                                      className="inline-flex items-center rounded-lg bg-red-600 px-3 py-1.5 text-sm text-white hover:opacity-90"
                                    >
                                      Usuń
                                    </button>

                                    {/* ⬇️ Mini–toggle Hero */}
                                    <label className="inline-flex items-center gap-2 ml-1 text-xs text-neutral-600 dark:text-neutral-300">
                                      <input
                                        type="checkbox"
                                        checked={!!cat.showInHero}
                                        onChange={async (e) => {
                                          try {
                                            await api.update(cat.id, { showInHero: e.target.checked });
                                            await loadCategories();
                                            window.dispatchEvent(new Event("categories:refresh"));
                                          } catch (err: any) {
                                            alert(err?.message || "Nie udało się zmienić ustawienia Hero.");
                                          }
                                        }}
                                      />
                                      <span>Pokaż w Hero</span>
                                    </label>
                                  </div>
                                </>
                              )}
                            </td>

                            {/* SLUG */}
                            <td className="px-3 py-2 align-middle">
                              {isEditing ? (
                                <input
                                  value={editSlug}
                                  onChange={(e) => setEditSlug(slugify(e.target.value))}
                                  className="w-full rounded-lg border px-3 py-2 text-sm dark:border-white/15 dark:bg-white/5"
                                />
                              ) : (
                                <span className="text-sm text-neutral-700 dark:text-neutral-300">{cat.slug}</span>
                              )}
                            </td>

                            {/* LICZNIK */}
                            <td className="px-3 py-2 align-middle">
                              <span className="inline-flex min-w-[3ch] justify-end text-sm">
                                {cat._count?.products ?? "—"}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* RIGHT */}
        <div className="space-y-4">
          <section className="rounded-2xl border p-4 shadow-sm dark:border-white/10">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold">Produkty</h2>

                <div className="relative z-50">
                  <select
                    value={sourceCatId}
                    onChange={(e) => {
                      setSourceCatId(e.target.value);
                      setPage(1);
                      setTimeout(() => loadRightPane(), 0);
                    }}
                    className="rounded-lg border px-3 py-2 text-sm dark:border-white/15 dark:bg-white/5"
                    title="Źródło produktów"
                  >
                    <option value={SOURCE_UNCAT}>— Bez kategorii —</option>
                    {cats
                      .slice()
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c._count?.products ?? 0})
                        </option>
                      ))}
                  </select>
                </div>

                <span className="text-sm text-neutral-500 dark:text-neutral-400">
                  łącznie: {list.total}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (setPage(1), loadRightPane())}
                  className="w-56 rounded-lg border px-3 py-2 text-sm dark:border-white/15 dark:bg-white/5"
                  placeholder="Szukaj po nazwie…"
                />
                <button
                  onClick={() => {
                    setPage(1);
                    loadRightPane();
                  }}
                  className="rounded-lg border px-3 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/10"
                >
                  Szukaj
                </button>
              </div>
            </div>

            {/* Bulk assign */}
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <div className="relative z-40">
                <select
                  value={assignTarget}
                  onChange={(e) => setAssignTarget(e.target.value)}
                  className="w-64 rounded-lg border px-3 py-2 text-sm dark:border-white/15 dark:bg-white/5"
                >
                  <option value="">— Wybierz kategorię docelową —</option>
                  {cats
                    .slice()
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c._count?.products ?? 0})
                      </option>
                    ))}
                </select>
              </div>
              <button
                onClick={handleAssign}
                disabled={!assignTarget || !anySelected}
                className="rounded-lg bg-mainRed px-4 py-2 text-sm text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Przenieś wybrane
              </button>
            </div>

            {/* Tabela produktów */}
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-y-2">
                <thead>
                  <tr className="text-left text-sm text-neutral-600 dark:text-neutral-300">
                    <th className="px-3 py-2">
                      <input
                        type="checkbox"
                        onChange={(e) => toggleAll(e.target.checked)}
                        checked={list.items.length > 0 && list.items.every((p) => selected[p.id])}
                        aria-label="Zaznacz wszystko"
                      />
                    </th>
                    <th className="px-3 py-2">Nazwa</th>
                    <th className="px-3 py-2">Slug</th>
                    <th className="px-3 py-2 text-right">Akcje</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingRight ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-sm">Ładowanie…</td>
                    </tr>
                  ) : list.items.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-sm">Brak produktów na tej stronie.</td>
                    </tr>
                  ) : (
                    list.items.map((p) => (
                      <tr key={p.id} className="rounded-xl bg-black/[0.02] dark:bg-white/[0.03]">
                        <td className="px-3 py-2 align-middle">
                          <input
                            type="checkbox"
                            checked={!!selected[p.id]}
                            onChange={(e) =>
                              setSelected((prev) => ({
                                ...prev,
                                [p.id]: e.target.checked,
                              }))
                            }
                            aria-label={`Zaznacz ${p.name}`}
                          />
                        </td>
                        <td className="px-3 py-2 align-middle">
                          <div className="max-w-[36ch] truncate font-medium">{p.name}</div>
                        </td>
                        <td className="px-3 py-2 align-middle">
                          <div className="text-sm text-neutral-700 dark:text-neutral-300">{p.slug}</div>
                        </td>
                        <td className="px-3 py-2 align-middle">
                          <div className="flex items-center justify-end">
                            <Link
                              to={`/admin/products/${p.id}`}
                              className="rounded-lg border px-3 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/10"
                            >
                              Podgląd
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Paginacja */}
            <div className="mt-3 flex items-center justify-between">
              <div className="text-sm text-neutral-600 dark:text-neutral-400">
                Strona {page} / {totalPages}
              </div>
              <div className="flex gap-2">
                <button
                  className="rounded-lg border px-3 py-1.5 text-sm hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/10"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  ← Poprzednia
                </button>
                <button
                  className="rounded-lg border px-3 py-1.5 text-sm hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/10"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                >
                  Następna →
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Delete modal */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl dark:bg-neutral-900">
            <h3 className="mb-2 text-lg font-semibold">Usunąć kategorię?</h3>
            <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-300">
              Wybierz, co zrobić z przypisanymi produktami:
            </p>

            <div className="mb-4 space-y-2">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="delmode"
                  checked={deleteMode === "orphan"}
                  onChange={() => setDeleteMode("orphan")}
                />
                <span>Oznacz produkty jako „bez kategorii”.</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="delmode"
                  checked={deleteMode === "move"}
                  onChange={() => setDeleteMode("move")}
                />
                <span>
                  Przenieś produkty do:
                  <select
                    disabled={deleteMode !== "move"}
                    value={deleteTargetId}
                    onChange={(e) => setDeleteTargetId(e.target.value)}
                    className="ml-2 rounded-lg border px-2 py-1 text-sm dark:border-white/15 dark:bg-white/5"
                  >
                    <option value="">— wybierz —</option>
                    {cats
                      .filter((c) => c.id !== deleteId)
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </span>
              </label>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setDeleteId(null);
                  setDeleteTargetId("");
                }}
                className="rounded-lg border px-3 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/10"
              >
                Anuluj
              </button>
              <button
                onClick={handleDelete}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-sm text-white hover:opacity-90 disabled:opacity-50"
                disabled={deleteMode === "move" && !deleteTargetId}
              >
                Usuń kategorię
              </button>
            </div>
          </div>
        </div>
      )}

      {/* IMPORT (CSV/JSON) */}
      <section className="mt-8 rounded-2xl border p-4 shadow-sm dark:border-white/10">
        <h2 className="mb-2 text-lg font-semibold">Import kategorii (CSV/JSON)</h2>
        <p className="mb-3 text-sm text-neutral-600 dark:text-neutral-300">
          Wklej CSV: <code className="px-1 rounded bg-black/5 dark:bg-white/10">product_slug,category_name</code> (nagłówek opcjonalny) lub wybierz plik JSON.
        </p>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input
            type="file"
            accept=".csv,.txt,.json"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const text = await file.text();
              try {
                const asJson = JSON.parse(text);
                if (Array.isArray(asJson?.rows) || Array.isArray(asJson?.groups)) {
                  if (Array.isArray(asJson.rows)) {
                    setPreviewRows(
                      asJson.rows
                        .filter((r: any) => r?.productSlug && r?.category)
                        .map((r: any) => ({ productSlug: String(r.productSlug), category: String(r.category) }))
                    );
                    setCsvText("");
                    return;
                  }
                  if (Array.isArray(asJson.groups)) {
                    const rowsFromGroups: Array<{ productSlug: string; category: string }> = [];
                    for (const g of asJson.groups) {
                      const cat = String(g.category);
                      const slugs: string[] = Array.isArray(g.productSlugs) ? g.productSlugs : [];
                      slugs.forEach((s) => rowsFromGroups.push({ productSlug: String(s), category: cat }));
                    }
                    setPreviewRows(rowsFromGroups);
                    setCsvText("");
                    return;
                  }
                }
              } catch {
                // nie-JSON → CSV
              }
              setCsvText(text);
            }}
            className="rounded-lg border px-3 py-2 text-sm dark:border-white/15 dark:bg-white/5"
          />
          <button
            onClick={handleParseCsv}
            className="rounded-lg border px-3 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/10"
          >
            Podgląd
          </button>
          <button
            onClick={() => {
              setCsvText("");
              setPreviewRows([]);
            }}
            className="rounded-lg border px-3 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/10"
          >
            Wyczyść
          </button>
        </div>

        <textarea
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
          rows={6}
          className="mb-3 w-full rounded-lg border px-3 py-2 font-mono text-sm dark:border-white/15 dark:bg-white/5"
          placeholder={`product_slug,category_name
zestaw-prezentowy-rose,Dla niej
kubek-z-nadrukiem,Dla niego`}
        />

        {previewRows.length > 0 && (
          <div className="mb-3 text-sm">
            Podgląd: {previewRows.length} wierszy • Kategorie wykryte:{" "}
            {Array.from(new Set(previewRows.map((r) => r.category))).length}
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={handleImport}
            disabled={previewRows.length === 0 || importBusy}
            className="rounded-lg bg-mainRed px-4 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50"
          >
            {importBusy ? "Importuję…" : "Importuj"}
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={async () => {
              try {
                const { items } = await api.basicProducts(true);
                const csv = ["product_slug,category_name", ...(items ?? []).map((p: any) => `${p.slug},`)].join("\n");
                setCsvText(csv);
                alert(
                  `Dodano ${items?.length ?? 0} wierszy do pola CSV. Uzupełnij kategorie i kliknij „Podgląd” → „Importuj”.`
                );
              } catch (err: any) {
                alert(`Nie mogę pobrać listy produktów: ${err?.message || "błąd sieci"}`);
              }
            }}
            className="rounded-lg border px-3 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/10"
            title="Pobierz listę produktów bez kategorii do uzupełnienia"
          >
            Wygeneruj szablon CSV (bez kategorii)
          </button>

          <button
            onClick={async () => {
              try {
                const { items } = await api.basicProducts(false);
                const csv = ["product_slug,category_name", ...(items ?? []).map((p: any) => `${p.slug},`)].join("\n");
                const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "products-template.csv";
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
              } catch (err: any) {
                alert(`Nie mogę pobrać CSV: ${err?.message || "błąd sieci"}`);
              }
            }}
            className="rounded-lg border px-3 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/10"
            title="Ściągnij CSV szablon dla wszystkich produktów"
          >
            Pobierz CSV (wszystkie produkty)
          </button>
        </div>
      </section>

      {/* MIGRACJA legacy */}
      <section className="mt-8 rounded-2xl border p-4 shadow-sm dark:border-white/10">
        <h2 className="mb-2 text-lg font-semibold">
          Migracja ze starego pola <code>products.category</code>
        </h2>
        <p className="mb-3 text-sm text-neutral-600 dark:text-neutral-300">
          Najpierw uruchom <b>Podgląd (dry-run)</b>, następnie właściwą migrację — tylko jeśli legacy kolumna istnieje.
        </p>

        <label className="mb-2 block text-sm font-medium">Mapa nazw (opcjonalnie)</label>
        <textarea
          rows={4}
          value={nameMapText}
          onChange={(e) => setNameMapText(e.target.value)}
          className="mb-3 w-full rounded-lg border px-3 py-2 font-mono text-sm dark:border-white/15 dark:bg-white/5"
          placeholder={`StaraNazwa => Nowa nazwa|nowy-slug
DLA-NIEGO => Dla niego|dla-niego`}
        />

        <div className="mb-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
            Tryb podglądu (dry-run)
          </label>

          <button
            onClick={() => runMigration("dry")}
            disabled={migrateBusy}
            className="rounded-lg border px-3 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/10"
          >
            Podgląd (dry-run)
          </button>
          <button
            onClick={() => runMigration("do")}
            disabled={migrateBusy || dryRun}
            className="rounded-lg bg-mainRed px-4 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50"
            title={dryRun ? "Odznacz dry-run, aby uruchomić migrację" : ""}
          >
            Wykonaj migrację
          </button>
        </div>

        {migrateReport && (
          <div className="mt-3 rounded-lg border p-3 text-sm dark:border-white/10">
            <div className="mb-2 font-semibold">Raport</div>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs">
{JSON.stringify(migrateReport, null, 2)}
            </pre>
          </div>
        )}
      </section>

      {/* ⬇️ Opcjonalny panel ustawień tekstów Hero */}
      <section className="mt-8 rounded-2xl border p-4 shadow-sm dark:border-white/10">
        <h2 className="mb-2 text-lg font-semibold">HeroSection — ustawienia tekstu</h2>
        <HeroTextSettings />
      </section>
    </div>
  );

  /* ===== Helpers (po JSX) ===== */
  async function uploadCategoryImagePrompt(categoryId: string) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        await uploadCategoryImage(categoryId, file);
        alert("Obrazek zaktualizowany.");
        await loadCategories();
        window.dispatchEvent(new Event("categories:refresh")); // 🔄 odśwież kafelki na FE
      } catch (err: any) {
        alert(`Błąd: ${err.message}`);
      }
    };
    input.click();
  }
}

/* =========================
 * Komponent pomocniczy: Ustawienia tekstu Hero
 * (backend: GET/PUT /api/admin/hero; fallback: localStorage)
 * ========================= */
function HeroTextSettings() {
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [ctaPrimaryLabel, setCtaPrimaryLabel] = useState("");
  const [ctaPrimaryTo, setCtaPrimaryTo] = useState("");
  const [ctaSecondaryLabel, setCtaSecondaryLabel] = useState("");
  const [ctaSecondaryTo, setCtaSecondaryTo] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let stop = false;
    (async () => {
      try {
        const data = await safeFetchJson("/api/admin/hero", { credentials: "include", cache: "no-store" });
        if (stop || !data) return;
        setTitle(data.title ?? "");
        setSubtitle(data.subtitle ?? "");
        setCtaPrimaryLabel(data.ctaPrimaryLabel ?? "");
        setCtaPrimaryTo(data.ctaPrimaryTo ?? "");
        setCtaSecondaryLabel(data.ctaSecondaryLabel ?? "");
        setCtaSecondaryTo(data.ctaSecondaryTo ?? "");
      } catch {
        try {
          const txt = localStorage.getItem("__hero_cfg__");
          if (!txt) return;
          const d = JSON.parse(txt);
          if (stop) return;
          setTitle(d.title ?? "");
          setSubtitle(d.subtitle ?? "");
          setCtaPrimaryLabel(d.ctaPrimaryLabel ?? "");
          setCtaPrimaryTo(d.ctaPrimaryTo ?? "");
          setCtaSecondaryLabel(d.ctaSecondaryLabel ?? "");
          setCtaSecondaryTo(d.ctaSecondaryTo ?? "");
        } catch {}
      }
    })();
    return () => { stop = true; };
  }, []);

  const save = async () => {
    setBusy(true);
    const payload = {
      title: title.trim(),
      subtitle: subtitle.trim(),
      ctaPrimaryLabel: ctaPrimaryLabel.trim(),
      ctaPrimaryTo: ctaPrimaryTo.trim(),
      ctaSecondaryLabel: ctaSecondaryLabel.trim(),
      ctaSecondaryTo: ctaSecondaryTo.trim(),
    };
    try {
      try {
        await safeFetchJson("/api/admin/hero", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        });
      } catch {
        localStorage.setItem("__hero_cfg__", JSON.stringify(payload));
      }
      alert("Zapisano ustawienia Hero.");
      window.dispatchEvent(new Event("categories:refresh")); // lekkie odświeżenie frontu
    } catch (e:any) {
      alert(e?.message || "Nie udało się zapisać.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="block text-sm font-medium">Tytuł</label>
        <input
          value={title}
          onChange={(e)=>setTitle(e.target.value)}
          className="mt-1 w-full rounded-lg border px-3 py-2 dark:border-white/15 dark:bg-white/5"
        />
      </div>
      <div className="sm:col-span-2">
        <label className="block text-sm font-medium">Podtytuł</label>
        <textarea
          rows={3}
          value={subtitle}
          onChange={(e)=>setSubtitle(e.target.value)}
          className="mt-1 w-full rounded-lg border px-3 py-2 dark:border-white/15 dark:bg-white/5"
        />
      </div>
      <div>
        <label className="block text-sm font-medium">CTA 1 — etykieta</label>
        <input
          value={ctaPrimaryLabel}
          onChange={(e)=>setCtaPrimaryLabel(e.target.value)}
          className="mt-1 w-full rounded-lg border px-3 py-2 dark:border-white/15 dark:bg-white/5"
        />
      </div>
      <div>
        <label className="block text-sm font-medium">CTA 1 — link (np. /categories/dla-niej)</label>
        <input
          value={ctaPrimaryTo}
          onChange={(e)=>setCtaPrimaryTo(e.target.value)}
          className="mt-1 w-full rounded-lg border px-3 py-2 dark:border-white/15 dark:bg-white/5"
        />
      </div>
      <div>
        <label className="block text-sm font-medium">CTA 2 — etykieta</label>
        <input
          value={ctaSecondaryLabel}
          onChange={(e)=>setCtaSecondaryLabel(e.target.value)}
          className="mt-1 w-full rounded-lg border px-3 py-2 dark:border-white/15 dark:bg-white/5"
        />
      </div>
      <div>
        <label className="block text-sm font-medium">CTA 2 — link</label>
        <input
          value={ctaSecondaryTo}
          onChange={(e)=>setCtaSecondaryTo(e.target.value)}
          className="mt-1 w-full rounded-lg border px-3 py-2 dark:border-white/15 dark:bg-white/5"
        />
      </div>
      <div className="sm:col-span-2">
        <button
          onClick={save}
          disabled={busy}
          className="rounded-lg bg-mainRed px-4 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Zapisuję…" : "Zapisz"}
        </button>
      </div>
    </div>
  );
}