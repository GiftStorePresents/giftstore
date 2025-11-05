// src/pages/AdminBlogPage.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMde from "react-mde";
import "react-mde/lib/styles/css/react-mde-all.css";
import Showdown from "showdown";

/** Pomocnik: fetch + ładne błędy (zbiera JSON.reason lub body) */
async function fetchJsonWithReason(url, init) {
  const r = await fetch(url, {
    credentials: "include",
    headers: { Accept: "application/json", ...(init && init.headers ? init.headers : {}) },
    ...(init || {}),
  });
  let bodyText = "";
  let json = null;
  try {
    json = await r.clone().json();
  } catch {
    try {
      bodyText = await r.clone().text();
    } catch {
      /* no-op */
    }
  }
  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    if (json?.reason) msg += ` – ${json.reason}`;
    else if (bodyText) msg += ` – ${String(bodyText).slice(0, 160)}`;
    const err = new Error(msg);
    err.status = r.status;
    err.payload = json || bodyText;
    throw err;
  }
  return json ?? bodyText;
}

export default function AdminBlogPage() {
  const [list, setList] = useState([]);
  const [form, setForm] = useState({
    title: "",
    slug: "",
    excerpt: "",
    content: "",
    image: "",
    tags: "",
    published: false,
  });
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [tab, setTab] = useState("write"); // 'write' | 'preview'
  const [importBusy, setImportBusy] = useState(false);
  const fileInputRef = useRef(null);
  const coverPickerRef = useRef(null);

  // ----- Markdown converter -----
  const converter = useMemo(
    () =>
      new Showdown.Converter({
        tables: true,
        simplifiedAutoLink: true,
        strikethrough: true,
        tasklists: true,
        ghCodeBlocks: true,
        openLinksInNewWindow: true,
      }),
    []
  );

  // ----- STYLOWANIE ZAKŁADEK: WRITE / PREVIEW (CZARNE) -----
  const TabsStyle = () => (
    <style>{`
      .mde-header .mde-tabs { padding: 6px 8px; }
      .mde-header .mde-tabs button {
        background: #ffffff !important;
        color: #000000 !important;
        border: 1px solid rgba(0,0,0,0.12) !important;
        border-radius: 8px !important;
        padding: 6px 10px !important;
        margin-right: 8px !important;
        opacity: 1 !important;
        box-shadow: 0 1px 0 rgba(0,0,0,0.06);
      }
      .mde-header .mde-tabs button:hover { background: #f4f6f8 !important; }
      .mde-header .mde-tabs .selected {
        background: #e9ecf1 !important;
        border-color: rgba(0,0,0,0.2) !important;
        color: #000 !important;
      }
      .mde-header .mde-tabs button * {
        color: #000 !important;
        fill: #000 !important;
        stroke: #000 !important;
        opacity: 1 !important;
      }
    `}</style>
  );

  // ----- Helpers -----
  function update(k, v) {
    setForm((f) => ({ ...f, [k]: typeof v === "function" ? v(f[k], f) : v }));
  }

  async function load() {
    const data = await fetchJsonWithReason("/api/admin/blog", {});
    setList(Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    (async () => {
      try {
        await load();
      } catch (e) {
        setMsg(
          "Błąd ładowania: " +
            String(e.message || e) +
            (e?.status === 401
              ? " (niezalogowany?)"
              : e?.status === 403
              ? " (brak uprawnień – zaloguj się jako ADMIN)"
              : "")
        );
      }
    })();
  }, []);

  // Upload pojedynczego pliku do /api/admin/upload
  async function uploadImage(file) {
    const fd = new FormData();
    fd.append("file", file);
    const j = await fetchJsonWithReason("/api/admin/upload?folder=blog", {
      method: "POST",
      body: fd,
    });
    if (!j?.url) throw new Error("Upload failed (brak url w odpowiedzi)");
    return j.url; // np. /uploads/blog/plik.jpg
  }

  // react-mde 11+: paste/drop.saveImage(ArrayBuffer, mime?) => Promise<string(url)>
  async function saveImageFromArrayBuffer(data, mime = "image/png") {
    const blob = new Blob([data], { type: mime });
    const ext = (mime.split("/")[1] || "png").replace("+xml", "");
    const file = new File([blob], `pasted-${Date.now()}.${ext}`, { type: mime });
    return uploadImage(file);
  }

  // ----- Actions: import z mocków -----
  async function importFake() {
    if (
      !confirm(
        "Zaimportować mocki z src/data/blog.ts?\nIstniejące slugi zostaną zaktualizowane."
      )
    ) {
      return;
    }
    setImportBusy(true);
    setMsg("");
    try {
      const res = await fetchJsonWithReason("/api/admin/blog/import?source=fake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publish: true, overwrite: true }),
      });
      setMsg(
        `Import zakończony: utworzono ${res?.created ?? 0}, zaktualizowano ${
          res?.updated ?? 0
        }.`
      );
      await load();
    } catch (e) {
      setMsg(
        "Błąd importu: " +
          String(e.message || e) +
          (e?.status === 401
            ? " (niezalogowany?)"
            : e?.status === 403
            ? " (brak uprawnień – zaloguj się jako ADMIN)"
            : "")
      );
    } finally {
      setImportBusy(false);
    }
  }

  // ----- Actions: CRUD -----
  async function save(e) {
    e.preventDefault();
    setLoading(true);
    setMsg("");
    try {
      const method = editing ? "PATCH" : "POST";
      const url = editing ? `/api/admin/blog/${editing}` : "/api/admin/blog";
      const payload = {
        ...form,
        tags: form.tags
          ? form.tags
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean)
          : [],
      };
      await fetchJsonWithReason(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      await load();
      setMsg(editing ? "Zapisano zmiany ✅" : "Dodano wpis ✅");
      setEditing(null);
      setForm({
        title: "",
        slug: "",
        excerpt: "",
        content: "",
        image: "",
        tags: "",
        published: false,
      });
      setTab("write");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e2) {
      setMsg(
        "Błąd zapisu: " +
          String(e2.message || e2) +
          (e2?.status === 401
            ? " (niezalogowany?)"
            : e2?.status === 403
            ? " (brak uprawnień – zaloguj się jako ADMIN)"
            : "")
      );
    } finally {
      setLoading(false);
    }
  }

  async function edit(id) {
    try {
      const a = await fetchJsonWithReason(`/api/admin/blog/${id}`, {});
      setEditing(id);
      setForm({
        title: a.title || "",
        slug: a.slug || "",
        excerpt: a.excerpt || "",
        content: a.content || "",
        image: a.image || "",
        tags: Array.isArray(a.tags) ? a.tags.join(", ") : "",
        published: !!a.published,
      });
      setTab("write");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setMsg(
        "Nie udało się pobrać wpisu: " +
          String(e.message || e) +
          (e?.status === 401
            ? " (niezalogowany?)"
            : e?.status === 403
            ? " (brak uprawnień – zaloguj się jako ADMIN)"
            : "")
      );
    }
  }

  async function del(id) {
    if (!confirm("Usunąć wpis?")) return;
    try {
      await fetchJsonWithReason(`/api/admin/blog/${id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setMsg(
        "Błąd usuwania: " +
          String(e.message || e) +
          (e?.status === 401
            ? " (niezalogowany?)"
            : e?.status === 403
            ? " (brak uprawnień – zaloguj się jako ADMIN)"
            : "")
      );
    }
  }

  // ----- Okładka – dodawanie/usuwanie -----
  async function onPickMainImage(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMsg("Wysyłam obrazek okładki…");
    try {
      const url = await uploadImage(file);
      update("image", url);
      setMsg("Obrazek okładki zapisany ✅");
    } catch (err) {
      setMsg("Błąd uploadu okładki: " + String(err.message || err));
    } finally {
      e.target.value = "";
    }
  }

  function removeMainImage() {
    if (!form.image) return;
    if (!confirm("Usunąć obrazek główny z tego wpisu?")) return;
    update("image", "");
    setMsg(
      "Usunięto obrazek główny z formularza. (Plik na serwerze pozostaje bez zmian)"
    );
  }

  // ----- Treść – obrazki -----
  function openHiddenPicker() {
    fileInputRef.current?.click();
  }

  async function onHiddenFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMsg("Wysyłam obrazek…");
    try {
      const url = await uploadImage(file);
      update("content", (prev) => (prev || "") + `\n\n![alt text](${url})\n\n`);
      setMsg("Wstawiono obrazek do treści ✅");
    } catch (err) {
      setMsg("Błąd uploadu: " + String(err.message || err));
    } finally {
      e.target.value = "";
    }
  }

  function removeLastContentImage() {
    const re = /!\[[^\]]*]\([^)]+\)/g;
    const matches = [...(form.content || "").matchAll(re)];
    if (matches.length === 0) {
      setMsg("W treści nie znaleziono obrazka do usunięcia.");
      return;
    }
    const last = matches[matches.length - 1];
    const start = last.index ?? 0;
    const end = start + last[0].length;
    update("content", (prev) => (prev || "").slice(0, start) + (prev || "").slice(end));
    setMsg("Usunięto ostatni obraz z treści.");
  }

  // ----- Render -----
  return (
    <section className="admin-skin admin-page max-w-6xl mx-auto p-6">
      <TabsStyle />

      {/* Nagłówek */}
      <div className="mb-4 flex items-center gap-3 justify-between">
        <h1 className="text-2xl font-bold">Blog – admin</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={importFake}
            disabled={importBusy}
            className="admin-btn"
            title="Zaimportuj wpisy z src/data/blog.ts"
          >
            {importBusy ? "Importuję…" : "Importuj mocki"}
          </button>

          {msg && (
            <span
              className="admin-badge"
              style={{
                background: msg.toLowerCase().includes("błąd") ? "#3a1f24" : "#1f2d44",
                color: msg.toLowerCase().includes("błąd") ? "#ffdfe1" : "#bcd9ff",
              }}
              title="Komunikat"
            >
              {msg}
            </span>
          )}
        </div>
      </div>

      {/* Formularz */}
      <form onSubmit={save} className="grid gap-3 mb-8 admin-card rounded-lg p-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--adm-muted)]">Tytuł</label>
            <input
              className="admin-input w-full"
              placeholder="Tytuł"
              value={form.title}
              onChange={(e) => update("title", e.target.value)}
              required
            />
          </div>
          <div>
            <label className="text-xs text-[var(--adm-muted)]">Slug (opcjonalnie)</label>
            <input
              className="admin-input w-full"
              placeholder="np. poradnik-prezentowy"
              value={form.slug}
              onChange={(e) => update("slug", e.target.value)}
            />
          </div>
        </div>

        <div className="grid sm:grid-cols-[1fr_auto_auto] gap-3 items-end">
          <div>
            <label className="text-xs text-[var(--adm-muted)]">Obrazek główny – URL</label>
            <input
              className="admin-input w-full"
              placeholder="https://… /uploads/blog/…"
              value={form.image}
              onChange={(e) => update("image", e.target.value)}
            />
          </div>

          {/* Picker pliku (okładka) */}
          <input
            ref={coverPickerRef}
            type="file"
            accept="image/*"
            onChange={onPickMainImage}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => coverPickerRef.current?.click()}
            className="admin-btn"
            title="Wgraj obrazek okładki"
          >
            Wgraj…
          </button>
          <button
            type="button"
            onClick={removeMainImage}
            className="admin-btn danger"
            title="Usuń obrazek główny z formularza"
          >
            Usuń obrazek
          </button>
        </div>

        {form.image ? (
          <div className="flex items-start gap-3">
            <img
              src={form.image}
              alt="podgląd okładki"
              className="max-h-40 rounded border object-contain"
            />
            <button
              type="button"
              onClick={removeMainImage}
              className="admin-btn danger"
              title="Usuń ten obraz z formularza"
            >
              Usuń ten obraz
            </button>
          </div>
        ) : null}

        <div>
          <label className="text-xs text-[var(--adm-muted)]">Tagi (po przecinku)</label>
          <input
            className="admin-input w-full"
            placeholder="np. prezenty, dla-niej"
            value={form.tags}
            onChange={(e) => update("tags", e.target.value)}
          />
        </div>

        <div>
          <label className="text-xs text-[var(--adm-muted)]">Lead / excerpt</label>
          <textarea
            className="admin-input w-full"
            placeholder="Krótki wstęp do wpisu…"
            rows={3}
            value={form.excerpt}
            onChange={(e) => update("excerpt", e.target.value)}
          />
        </div>

        {/* -------- Editor Markdown -------- */}
        <div className="rounded border border-[rgba(255,255,255,0.08)] overflow-hidden">
          <div className="flex items-center justify-between p-2 border-b border-[rgba(255,255,255,0.08)]">
            <span className="font-semibold">Treść (Markdown)</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={openHiddenPicker}
                className="admin-btn px-3 py-1"
                title="Wstaw obrazek do treści"
              >
                + Obraz do treści
              </button>
              <button
                type="button"
                onClick={removeLastContentImage}
                className="admin-btn danger px-3 py-1"
                title="Usuń ostatni obrazek (![...](...)) z treści"
              >
                Usuń ostatni obraz
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onHiddenFileChange}
              />
            </div>
          </div>

          <ReactMde
            value={form.content}
            onChange={(v) => update("content", v)}
            selectedTab={tab}
            onTabChange={setTab}
            generateMarkdownPreview={(md) => Promise.resolve(converter.makeHtml(md || ""))}
            minEditorHeight={240}
            maxEditorHeight={520}
            childProps={{
              textArea: {
                placeholder:
                  "Treść w Markdown. Wklejaj screeny (Ctrl+V) lub przeciągnij obraz – zapisze się automatycznie.",
              },
            }}
            paste={{
              saveImage: async (arrayBuffer, mimeType) =>
                saveImageFromArrayBuffer(arrayBuffer, mimeType || "image/png"),
            }}
            drop={{
              saveImage: async (arrayBuffer, mimeType) =>
                saveImageFromArrayBuffer(arrayBuffer, mimeType || "image/png"),
            }}
          />
        </div>

        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.published}
            onChange={(e) => update("published", e.target.checked)}
          />
          Opublikowany
        </label>

        <div className="flex gap-2">
          <button disabled={loading} className="admin-btn primary">
            {editing ? "Zapisz" : "Dodaj"}
          </button>
          {editing && (
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setForm({
                  title: "",
                  slug: "",
                  excerpt: "",
                  content: "",
                  image: "",
                  tags: "",
                  published: false,
                });
                setTab("write");
              }}
              className="admin-btn"
            >
              Anuluj
            </button>
          )}
        </div>
      </form>

      {/* Lista wpisów */}
      <div className="admin-table-wrap">
        <table className="admin-table text-sm">
          <thead>
            <tr>
              <th className="text-left">Tytuł</th>
              <th className="text-left">Slug</th>
              <th className="text-left">Status</th>
              <th className="text-left">Akcje</th>
            </tr>
          </thead>
          <tbody>
            {list.map((a) => (
              <tr key={a.id}>
                <td className="font-medium">{a.title}</td>
                <td>{a.slug}</td>
                <td>{a.published ? "opublikowany" : "draft"}</td>
                <td>
                  <div className="flex flex-wrap gap-2">
                    <button className="admin-btn px-2 py-1" onClick={() => edit(a.id)}>
                      Edytuj
                    </button>
                    <button className="admin-btn danger px-2 py-1" onClick={() => del(a.id)}>
                      Usuń
                    </button>
                    {a.slug && (
                      <a
                        className="admin-btn px-2 py-1"
                        href={`/blog/${a.slug}`}
                        target="_blank"
                        rel="noreferrer"
                        title="Podejrzyj publicznie"
                      >
                        Podgląd
                      </a>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-[var(--adm-muted)]">
                Brak wpisów.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
