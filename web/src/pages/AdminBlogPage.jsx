// src/pages/AdminBlogPage.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMde from "react-mde";
import "react-mde/lib/styles/css/react-mde-all.css";
import Showdown from "showdown";

/** Pomocnik: fetch + ładne błędy (zbiera JSON.reason lub body) */
async function fetchJsonWithReason(url, init) {
  const r = await fetch(url, init);
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
    else if (bodyText) msg += ` – ${bodyText.slice(0, 160)}`;
    const err = new Error(msg);
    err.status = r.status;
    err.payload = json || bodyText;
    throw err;
  }
  return json;
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

  // ----- Helpers -----
  function update(k, v) {
    setForm((f) => ({ ...f, [k]: typeof v === "function" ? v(f[k], f) : v }));
  }

  async function load() {
    const data = await fetchJsonWithReason("/api/admin/blog", {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
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
      credentials: "include",
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
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
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
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      await load();
      setMsg(editing ? "Zapisano zmiany" : "Dodano wpis");
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
      const a = await fetchJsonWithReason(`/api/admin/blog/${id}`, {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
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
      await fetchJsonWithReason(`/api/admin/blog/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
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
    setMsg("Usunięto obrazek główny z formularza. (Plik na serwerze pozostaje bez zmian)");
  }

  // ----- Treść – dodawanie/usuwanie obrazków -----
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
    const re = /!\[[^\]]*]\([^)]+\)/g; // dopasowuje ![alt](url)
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
    <section className="max-w-5xl mx-auto p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Blog – admin</h1>
        <button
          type="button"
          onClick={importFake}
          disabled={importBusy}
          className={`px-3 py-2 rounded border-2 ${
            importBusy
              ? "opacity-60 cursor-not-allowed border-gray-300"
              : "border-gold hover:bg-gold"
          } text-mainRed font-semibold`}
          title="Zaimportuj wpisy z src/data/blog.ts"
        >
          {importBusy ? "Importuję…" : "Importuj mocki"}
        </button>
      </div>

      {msg && <div className="mb-3 text-sm">{msg}</div>}

      <form onSubmit={save} className="grid gap-3 mb-8">
        <div className="grid sm:grid-cols-2 gap-3">
          <input
            className="border p-2 rounded"
            placeholder="Tytuł"
            value={form.title}
            onChange={(e) => update("title", e.target.value)}
            required
          />
          <input
            className="border p-2 rounded"
            placeholder="Slug (opcjonalnie)"
            value={form.slug}
            onChange={(e) => update("slug", e.target.value)}
          />
        </div>

        <div className="grid sm:grid-cols-[1fr_auto_auto] gap-3 items-end">
          <input
            className="border p-2 rounded"
            placeholder="Obrazek główny – URL"
            value={form.image}
            onChange={(e) => update("image", e.target.value)}
          />
          <label className="inline-flex items-center gap-2">
            <input
              type="file"
              accept="image/*"
              onChange={onPickMainImage}
              className="hidden"
              id="pick-main-image"
            />
            <span
              role="button"
              onClick={() => document.getElementById("pick-main-image")?.click()}
              className="px-3 py-2 rounded bg-mainRed text-white cursor-pointer"
            >
              Wgraj…
            </span>
          </label>
          <button
            type="button"
            onClick={removeMainImage}
            className="px-3 py-2 rounded border text-red-600 border-red-300 hover:bg-red-50"
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
              className="h-9 px-3 rounded border text-red-600 border-red-300 hover:bg-red-50"
            >
              Usuń ten obraz
            </button>
          </div>
        ) : null}

        <input
          className="border p-2 rounded"
          placeholder="Tagi (po przecinku) – np. prezenty, dla-niej"
          value={form.tags}
          onChange={(e) => update("tags", e.target.value)}
        />

        <textarea
          className="border p-2 rounded"
          placeholder="Lead / excerpt"
          rows={3}
          value={form.excerpt}
          onChange={(e) => update("excerpt", e.target.value)}
        />

        {/* -------- Editor Markdown -------- */}
        <div className="rounded border">
          <div className="flex items-center justify-between p-2 border-b">
            <span className="font-semibold">Treść (Markdown)</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={openHiddenPicker}
                className="px-3 py-1 rounded border"
                title="Wstaw obrazek do treści"
              >
                + Obraz do treści
              </button>
              <button
                type="button"
                onClick={removeLastContentImage}
                className="px-3 py-1 rounded border text-red-600 border-red-300 hover:bg-red-50"
                title="Usuń ostatni obrazek (![...](...)) z treści"
              >
                Usuń ostatni obraz z treści
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
            generateMarkdownPreview={(md) =>
              Promise.resolve(converter.makeHtml(md || ""))
            }
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
          <button disabled={loading} className="px-4 py-2 rounded bg-mainRed text-white">
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
              className="px-4 py-2 rounded border"
            >
              Anuluj
            </button>
          )}
        </div>
      </form>

      <table className="w-full text-sm border">
        <thead>
          <tr className="bg-gray-50">
            <th className="p-2 text-left">Tytuł</th>
            <th className="p-2">Slug</th>
            <th className="p-2">Status</th>
            <th className="p-2">Akcje</th>
          </tr>
        </thead>
        <tbody>
          {list.map((a) => (
            <tr key={a.id} className="border-t">
              <td className="p-2">{a.title}</td>
              <td className="p-2">{a.slug}</td>
              <td className="p-2">{a.published ? "opublikowany" : "draft"}</td>
              <td className="p-2 flex gap-2 justify-center">
                <button className="px-3 py-1 border rounded" onClick={() => edit(a.id)}>
                  Edytuj
                </button>
                <button className="px-3 py-1 border rounded" onClick={() => del(a.id)}>
                  Usuń
                </button>
              </td>
            </tr>
          ))}
          {list.length === 0 && (
            <tr>
              <td colSpan={4} className="p-4 text-center text-gray-500">
                Brak wpisów.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
