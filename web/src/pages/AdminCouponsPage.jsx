// src/pages/AdminCouponsPage.jsx
import { useEffect, useMemo, useState } from "react";

/* ====== API base ====== */
const API = (import.meta?.env?.VITE_API_URL || "http://localhost:4000").replace(/\/+$/, "");
const ADMIN = `${API}/api/admin`;

/* ====== helpers (z oryginału + kosmetyka) ====== */
function toZl(cents) {
  if (cents == null) return "";
  return (Math.round(Number(cents)) / 100).toLocaleString("pl-PL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
function fromZl(val) {
  if (val === "" || val == null) return null;
  const n = Number(String(val).replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

// Znormalizuj tekst seedów zanim go rozbijemy:
// - new Date("...")  -> "..."
// - new Date(anything else) -> null
// - usuń BOM, standaryzuj CRLF
function normalizeSeedText(text) {
  return String(text || "")
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/new\s+Date\s*\(\s*(['"])(.*?)\1\s*\)/g, '"$2"')
    .replace(/new\s+Date\s*\([^)]*\)/g, "null");
}

// ---- fetch helper z ładnymi błędami ----
async function fetchJsonWithReason(url, init = {}) {
  const r = await fetch(url, {
    credentials: "include",
    headers: { Accept: "application/json", ...(init.headers || {}) },
    ...init,
  });
  let bodyText = "";
  let json = null;
  try {
    json = await r.clone().json();
  } catch {
    try {
      bodyText = await r.clone().text();
    } catch {}
  }
  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    if (json?.error) msg += ` – ${json.error}`;
    else if (json?.reason) msg += ` – ${json.reason}`;
    else if (bodyText) msg += ` – ${String(bodyText).slice(0, 200)}`;
    const err = new Error(msg);
    err.status = r.status;
    err.payload = json || bodyText;
    throw err;
  }
  return json ?? bodyText;
}

/* ====== komponent ====== */
export default function AdminCouponsPage() {
  // lista / filtry
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);

  // edycja
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    code: "",
    type: "PERCENT",
    percentage: 10,
    amountZl: "",
    minOrderZl: "",
    usageLimit: "",
    perUserLimit: "",
    validFrom: "",
    validTo: "",
    active: true,
  });

  // import
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [importPreview, setImportPreview] = useState([]);
  const [importMsg, setImportMsg] = useState("");
  const [importErrors, setImportErrors] = useState([]); // lista błędów z backendu

  // status
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  /* ======= API: lista ======= */
  async function fetchList() {
    setLoading(true);
    setError("");
    try {
      const data = await fetchJsonWithReason(`${ADMIN}/coupons?query=${encodeURIComponent(query)}`);
      setItems(data.items || []);
    } catch (e) {
      setError(
        String(e.message || e) +
          (e?.status === 401
            ? " (niezalogowany?)"
            : e?.status === 403
            ? " (brak uprawnień – zaloguj się jako ADMIN)"
            : "")
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ======= edycja ======= */
  function startCreate() {
    setEditing(null);
    setForm({
      code: "",
      type: "PERCENT",
      percentage: 10,
      amountZl: "",
      minOrderZl: "",
      usageLimit: "",
      perUserLimit: "",
      validFrom: "",
      validTo: "",
      active: true,
    });
    setError("");
    setMsg("");
  }

  function startEdit(c) {
    setEditing(c);
    setForm({
      code: c.code || "",
      type: c.type || "PERCENT",
      percentage: c.percentage ?? "",
      amountZl: c.amount != null ? (Number(c.amount) / 100).toString() : "",
      minOrderZl: c.minOrder != null ? (Number(c.minOrder) / 100).toString() : "",
      usageLimit: c.usageLimit ?? "",
      perUserLimit: c.perUserLimit ?? "",
      validFrom: c.validFrom ? String(c.validFrom).slice(0, 16) : "",
      validTo: c.validTo ? String(c.validTo).slice(0, 16) : "",
      active: !!c.active,
    });
    setError("");
    setMsg("");
  }

  async function save() {
    setError("");
    setMsg("");
    try {
      const payload = {
        code: String(form.code || "").trim().toUpperCase(),
        type: form.type,
        percentage: form.type === "PERCENT" ? Number(String(form.percentage || 0)) : undefined,
        amountZl: form.type === "FIXED" ? String(form.amountZl || "") : undefined,
        minOrderZl: form.minOrderZl || undefined,
        usageLimit: form.usageLimit === "" ? undefined : Number(form.usageLimit),
        perUserLimit: form.perUserLimit === "" ? undefined : Number(form.perUserLimit),
        validFrom: form.validFrom || null,
        validTo: form.validTo || null,
        active: !!form.active,
      };

      const url = editing ? `${ADMIN}/coupons/${editing.id}` : `${ADMIN}/coupons`;
      const method = editing ? "PATCH" : "POST";

      await fetchJsonWithReason(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      setMsg(editing ? "Zapisano zmiany ✅" : "Dodano kupon ✅");
      await fetchList();
      if (!editing) startCreate();
    } catch (e) {
      setError(
        String(e.message || e) +
          (e?.status === 401
            ? " (niezalogowany?)"
            : e?.status === 403
            ? " (brak uprawnień – zaloguj się jako ADMIN)"
            : "")
      );
    }
  }

  async function resetUsedCount(c) {
    setError("");
    setMsg("");
    try {
      await fetchJsonWithReason(`${ADMIN}/coupons/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resetUsedCount: true }),
      });
      setMsg("Zerowano licznik użyć");
      fetchList();
    } catch (e) {
      setError(String(e.message || e));
    }
  }

  async function toggle(c) {
    setError("");
    setMsg("");
    try {
      await fetchJsonWithReason(`${ADMIN}/coupons/${c.id}/toggle`, { method: "POST" });
      setMsg("Zmieniono status");
      fetchList();
    } catch (e) {
      setError(String(e.message || e));
    }
  }

  async function remove(c) {
    if (!window.confirm(`Usunąć kupon ${c.code}?`)) return;
    setError("");
    setMsg("");
    try {
      await fetchJsonWithReason(`${ADMIN}/coupons/${c.id}`, { method: "DELETE" });
      setMsg("Usunięto");
      fetchList();
    } catch (e) {
      setError(String(e.message || e));
    }
  }

  async function previewValidate(c) {
    setError("");
    setMsg("");
    const cartTotalZl = prompt("Kwota koszyka (zł):", "123.45");
    if (cartTotalZl == null) return;
    const cents = fromZl(cartTotalZl) ?? 0;
    try {
      const resp = await fetchJsonWithReason(`${ADMIN}/coupons/preview-validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: c.code, cartTotal: cents }),
      });
      alert(`Rabat: ${(Number(resp.discount || 0) / 100).toFixed(2)} zł`);
    } catch (e) {
      alert(String(e.message || e));
    }
  }

  /* ======= IMPORT ======= */
  function onPickFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setImportText(String(reader.result || ""));
    reader.readAsText(f, "utf-8");
  }

  function tryParseJson(text) {
    try {
      const data = JSON.parse(text);
      if (Array.isArray(data)) return data;
      if (data && typeof data === "object" && Array.isArray(data.items)) return data.items;
      return [data];
    } catch {
      return null;
    }
  }

  // --- Balanced-braces extractor: zwraca pełny obiekt "{ ... }" zaczynając od '{'
  function extractBracedObject(src, startIdx) {
    let i = startIdx;
    let depth = 0;
    let out = "";
    let str = null; // ' " `
    let esc = false;

    while (i < src.length) {
      const ch = src[i];

      if (str) {
        out += ch;
        if (esc) {
          esc = false;
        } else if (ch === "\\") {
          esc = true;
        } else if (ch === str) {
          str = null;
        }
        i++;
        continue;
      }

      if (ch === "'" || ch === '"' || ch === "`") {
        str = ch;
        out += ch;
        i++;
        continue;
      }

      if (ch === "{") {
        depth++;
        out += ch;
        i++;
        continue;
      }
      if (ch === "}") {
        depth--;
        out += ch;
        i++;
        if (depth === 0) break;
        continue;
      }

      out += ch;
      i++;
    }

    return out;
  }

  // --- Balanced-brackets extractor: zwraca pełną tablicę "[ ... ]" zaczynając od '['
  function extractBracketedArray(src, startIdx) {
    let i = startIdx;
    let depth = 0;
    let out = "";
    let str = null; // ' " `
    let esc = false;

    while (i < src.length) {
      const ch = src[i];

      if (str) {
        out += ch;
        if (esc) {
          esc = false;
        } else if (ch === "\\") {
          esc = true;
        } else if (ch === str) {
          str = null;
        }
        i++;
        continue;
      }

      if (ch === "'" || ch === '"' || ch === "`") {
        str = ch;
        out += ch;
        i++;
        continue;
      }

      if (ch === "[") {
        depth++;
        out += ch;
        i++;
        continue;
      }
      if (ch === "]") {
        depth--;
        out += ch;
        i++;
        if (depth === 0) break;
        continue;
      }

      out += ch;
      i++;
    }

    return out;
  }

  // Zamienia JS-owy literał obiektu na JSON i parsuje
  function stringObjectToJson(objLiteralWithBraces) {
    let s = String(objLiteralWithBraces);

    // usuń komentarze
    s = s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

    // new Date -> string/null (gdyby coś jeszcze zostało)
    s = s
      .replace(/new\s+Date\s*\(\s*(['"])(.*?)\1\s*\)/g, '"$2"')
      .replace(/new\s+Date\s*\([^)]*\)/g, "null");

    // usuń podkreślenia w liczbach: 1_000 -> 1000
    s = s.replace(/\b\d[\d_]*\b/g, (m) => m.replace(/_/g, ""));

    // ujednolić cudzysłowy + klucze bez cudzysłowów + trailing commas + undefined
    s = s
      .replace(/'/g, '"')
      .replace(/([{,]\s*)([A-Za-z_]\w*)\s*:/g, '$1"$2":')
      .replace(/,\s*}/g, "}")
      .replace(/,\s*]/g, "]")
      .replace(/:\s*undefined/g, ": null");

    try {
      return JSON.parse(s);
    } catch {
      try {
        return JSON.parse(`{${s}}`);
      } catch {
        return null;
      }
    }
  }

  // =========== bogatszy parser seedów (A–E) ===========
  function tryParseSeedLike(rawText) {
    const text = normalizeSeedText(rawText);
    const results = [];

    // A) create: { ... } (wycinki) – balanced
    {
      const reHead = /create\s*:\s*{/g;
      let m;
      while ((m = reHead.exec(text))) {
        const startBrace = m.index + m[0].length - 1;
        const objLiteral = extractBracedObject(text, startBrace);
        const obj = stringObjectToJson(objLiteral);
        if (obj) results.push(obj);
      }
    }

    // B) upsertCoupon("CODE", { ... }) – balanced
    {
      const reHead = /upsertCoupon\s*\(\s*(['"`])([\w\-]+)\1\s*,\s*{/g;
      let u;
      while ((u = reHead.exec(text))) {
        const code = u[2];
        const startBrace = u.index + u[0].length - 1;
        const objLiteral = extractBracedObject(text, startBrace);
        const body = stringObjectToJson(objLiteral);
        if (body) results.push({ code, ...body });
      }
    }

    // C) prisma.coupon.upsert({ where:{ code:'X' }, create:{...}, update:{...} }) – balanced
    {
      const reHead = /prisma\.coupon\.upsert\s*\(\s*{/g;
      let m;
      while ((m = reHead.exec(text))) {
        const outerStart = m.index + m[0].length - 1;
        const outerObj = extractBracedObject(text, outerStart);
        const codeMatch = outerObj.match(/code\s*:\s*(['"`])([\w\-]+)\1/);
        const createHead = /create\s*:\s*{/.exec(outerObj);
        if (createHead) {
          const start = (outerObj.indexOf(createHead[0]) ?? -1) + createHead[0].length - 1;
          const createBody = extractBracedObject(outerObj, start);
          const body = stringObjectToJson(createBody);
          if (body) {
            const code = codeMatch?.[2];
            results.push(code ? { code, ...body } : body);
          }
        }
      }
    }

    // D) prisma.coupon.create({ data:{ ... } }) – balanced
    {
      const reHead = /prisma\.coupon\.create\s*\(\s*{/g;
      let m;
      while ((m = reHead.exec(text))) {
        const outerStart = m.index + m[0].length - 1;
        const outerObj = extractBracedObject(text, outerStart);
        const dataHead = /data\s*:\s*{/.exec(outerObj);
        if (dataHead) {
          const start = (outerObj.indexOf(dataHead[0]) ?? -1) + dataHead[0].length - 1;
          const dataBody = extractBracedObject(outerObj, start);
          const body = stringObjectToJson(dataBody);
          if (body) results.push(body);
        }
      }
    }

    // E) prisma.coupon.createMany({ data:[ {...},{...} ] }) – balanced
    {
      const reHead = /prisma\.coupon\.createMany\s*\(\s*{/g;
      let m;
      while ((m = reHead.exec(text))) {
        const outerStart = m.index + m[0].length - 1;
        const outerObj = extractBracedObject(text, outerStart);
        const arrPos = outerObj.search(/data\s*:\s*\[/);
        if (arrPos >= 0) {
          const bracketIdx = outerObj.indexOf("[", arrPos);
          const arrLiteral = extractBracketedArray(outerObj, bracketIdx);
          let s =
            String(arrLiteral)
              .replace(/\/\*[\s\S]*?\*\//g, "")
              .replace(/\/\/.*$/gm, "")
              .replace(/new\s+Date\s*\(\s*(['"])(.*?)\1\s*\)/g, '"$2"')
              .replace(/new\s+Date\s*\([^)]*\)/g, "null")
              .replace(/:\s*undefined/g, ": null")
              .replace(/'/g, '"')
              .replace(/([{,]\s*)([A-Za-z_]\w*)\s*:/g, '$1"$2":')
              .replace(/,\s*}/g, "}")
              .replace(/,\s*]/g, "]");

          // usuń podkreślenia w liczbach
          s = s.replace(/\b\d[\d_]*\b/g, (mm) => mm.replace(/_/g, ""));

          try {
            const arr = JSON.parse(s);
            if (Array.isArray(arr)) results.push(...arr);
          } catch {
            // ignore
          }
        }
      }
    }

    return results;
  }

  function buildCreatePayload(obj) {
    const code = String((obj.code || "")).trim().toUpperCase();
    const type = String(obj.type || "PERCENT").toUpperCase();

    const out = {
      code,
      type,
      percentage: undefined,
      amountZl: undefined,
      minOrderZl: undefined,
      usageLimit: obj.usageLimit ?? undefined,
      perUserLimit: obj.perUserLimit ?? undefined,
      validFrom: obj.validFrom ? new Date(obj.validFrom).toISOString().slice(0, 16) : null,
      validTo: obj.validTo ? new Date(obj.validTo).toISOString().slice(0, 16) : null,
      active: typeof obj.active === "boolean" ? obj.active : true,
    };

    if (type === "PERCENT") {
      out.percentage = Number(obj.percentage || 0);
    } else if (type === "FIXED") {
      // w seedach amount/minOrder są w groszach – konwersja do zł dla API
      out.amountZl = obj.amount != null ? (Number(obj.amount) / 100).toFixed(2) : undefined;
    }
    if (obj.minOrder != null) out.minOrderZl = (Number(obj.minOrder) / 100).toFixed(2);

    return out;
  }

  function makeImportPreview(text) {
    setImportMsg("");

    // 1) JSON:
    const fromJson = tryParseJson(text);
    if (fromJson) {
      const mapped = fromJson.map(buildCreatePayload).filter((p) => p.code);
      setImportPreview(mapped);
      return;
    }

    // 2) Seed-like:
    const fromSeed = tryParseSeedLike(text);
    if (fromSeed && fromSeed.length) {
      const mapped = fromSeed.map(buildCreatePayload).filter((p) => p.code);
      setImportPreview(mapped);
      return;
    }

    setImportPreview([]);
  }

  useEffect(() => {
    makeImportPreview(importText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importText]);

  async function doImport(upsert = true) {
    if (!importPreview.length) {
      setImportMsg("Brak danych do importu.");
      return;
    }
    setError("");
    setMsg("");
    setImportMsg("");
    setImportErrors([]);
    try {
      const data = await fetchJsonWithReason(`${ADMIN}/coupons/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: importPreview, upsert }),
      });
      setImportMsg(
        `Zaimportowano: ${data?.imported ?? 0}, zaktualizowano: ${data?.updated ?? 0}${
          data?.errors?.length ? `, błędów: ${data.errors.length}` : ""
        }`
      );
      setImportErrors(Array.isArray(data?.errors) ? data.errors : []);
      setImportPreview([]);
      setImportText("");
      fetchList();
    } catch (e) {
      setError(String(e.message || e));
    }
  }

  async function importFromSeedFile() {
    setError("");
    setMsg("");
    setImportMsg("");
    try {
      const txt = await fetchJsonWithReason(`${ADMIN}/coupons/seed-file`, {
        headers: { Accept: "text/plain" },
      });
      const str = typeof txt === "string" ? txt : txt?.text || JSON.stringify(txt);
      setImportText(str);
      setImportMsg("Załadowano zawartość prisma/seed.ts (podgląd niżej).");
      setShowImport(true);
    } catch (e) {
      setError(
        String(e.message || e) +
          (e?.status === 401
            ? " (niezalogowany?)"
            : e?.status === 403
            ? " (brak uprawnień – zaloguj się jako ADMIN)"
            : e?.status === 404
            ? " (brak pliku prisma/seed.ts na serwerze – możesz wkleić ręcznie poniżej)"
            : "")
      );
      setShowImport(true);
    }
  }

  const valueLabel = useMemo(
    () => (form.type === "PERCENT" ? "Procent (%)" : "Kwota (zł)"),
    [form.type]
  );

  /* ======= render ======= */
  return (
    <div className="admin-skin admin-page p-6 max-w-6xl mx-auto">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Kupony</h1>
        <div className="flex items-center gap-2">
          {loading && <span className="text-sm text-[var(--adm-muted)]">Ładowanie…</span>}
          {msg && (
            <span
              className="admin-badge"
              style={{ background: "#1f2d44", color: "#bcd9ff" }}
              title="Powodzenie"
            >
              {msg}
            </span>
          )}
          {error && (
            <span
              className="admin-badge"
              style={{ background: "#3a1f24", color: "#ffdfe1" }}
              title="Błąd"
            >
              {error}
            </span>
          )}
        </div>
      </div>

      {/* Szukaj + akcje górne */}
      <div className="flex flex-wrap items-end gap-2 mb-4">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Szukaj (kod/typ)…"
          className="admin-input"
          onKeyDown={(e) => e.key === "Enter" && fetchList()}
        />
        <button onClick={fetchList} className="admin-btn primary">
          Szukaj
        </button>
        <button
          onClick={() => setShowImport((v) => !v)}
          className="admin-btn"
          title="Pokaż/ukryj sekcję importu"
        >
          {showImport ? "Ukryj import" : "Importuj…"}
        </button>
        <button
          onClick={importFromSeedFile}
          className="admin-btn"
          title="Wczytaj zawartość prisma/seed.ts (endpoint admin-only)"
        >
          Importuj z prisma/seed.ts
        </button>
      </div>

      {/* IMPORT */}
      {showImport && (
        <div className="admin-card rounded-lg p-4 mb-6">
          <div className="font-semibold mb-2">Import kuponów (JSON lub „seed-like”)</div>
          <p className="text-sm text-[var(--adm-muted)] mb-2">
            Wklej JSON (np.{" "}
            <code>[{"{ code, type, percentage/amount, minOrder, active }"}]</code>) albo fragment z{" "}
            <code>prisma/seed.ts</code>. Obsługiwane: bloki <code>create: {"{ ... }"}</code>, wywołania{" "}
            <code>upsertCoupon("KOD", {"{ ... }"})</code>, a także{" "}
            <code>prisma.coupon.upsert</code>, <code>prisma.coupon.create</code> i{" "}
            <code>prisma.coupon.createMany</code>.
          </p>
          <div className="flex items-center gap-3 mb-2">
            <input type="file" accept=".json,.txt,.ts" onChange={onPickFile} />
            {importMsg && (
              <span className="text-sm" style={{ color: "#bcd9ff" }}>
                {importMsg}
              </span>
            )}
          </div>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            rows={8}
            className="w-full admin-input font-mono text-xs"
            placeholder='Np. [{"code":"GIFT10","type":"PERCENT","percentage":10,"active":true}]'
          />
          <div className="mt-2 text-sm">
            Wykryto rekordów: <b>{importPreview.length}</b>
          </div>
          {importPreview.length > 0 && (
            <div className="mt-2 max-h-48 overflow-auto text-xs admin-card rounded p-2">
              <pre className="whitespace-pre-wrap break-words">
                {JSON.stringify(importPreview, null, 2)}
              </pre>
            </div>
          )}

          {/* Błędy importu */}
          {importErrors.length > 0 && (
            <div className="mt-3">
              <div className="font-semibold mb-1">Błędy importu:</div>
              <div
                className="max-h-48 overflow-auto text-xs rounded p-2"
                style={{ background: "#3a1f24", border: "1px solid rgba(255,223,225,.25)", color: "#ffdfe1" }}
              >
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="text-left border-b border-[rgba(255,223,225,.25)]">
                      <th className="py-1 pr-3">Kod</th>
                      <th className="py-1">Komunikat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importErrors.map((e, i) => (
                      <tr key={i} className="border-b border-[rgba(255,223,225,.12)]">
                        <td className="py-1 pr-3">{e.code || "—"}</td>
                        <td className="py-1">{e.error || "failed"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="mt-3 flex gap-2">
            <button
              onClick={() => doImport(true)}
              className="admin-btn"
              style={{ background: "var(--adm-head)", borderColor: "#FFD70033", fontWeight: 700 }}
            >
              Importuj (upsert)
            </button>
            <button
              onClick={() => doImport(false)}
              className="admin-btn"
              title="Błąd gdy kupon już istnieje"
            >
              Importuj (tylko nowe)
            </button>
          </div>
        </div>
      )}

      {/* FORMULARZ */}
      <div className="admin-card rounded-lg p-4 mb-6">
        <div className="font-semibold mb-2">
          {editing ? `Edytuj: ${editing.code}` : "Nowy kupon"}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--adm-muted)]">Kod</label>
            <input
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
              className="admin-input w-full"
              placeholder="np. ALL10"
            />
          </div>
          <div>
            <label className="text-xs text-[var(--adm-muted)]">Typ</label>
            <select
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              className="admin-input w-full"
            >
              <option value="PERCENT">PERCENT</option>
              <option value="FIXED">FIXED</option>
            </select>
          </div>

          {form.type === "PERCENT" ? (
            <div>
              <label className="text-xs text-[var(--adm-muted)]">{valueLabel}</label>
              <input
                type="number"
                min={1}
                max={100}
                value={form.percentage}
                onChange={(e) => setForm((f) => ({ ...f, percentage: e.target.value }))}
                className="admin-input w-full"
                placeholder="np. 10"
              />
            </div>
          ) : (
            <div>
              <label className="text-xs text-[var(--adm-muted)]">{valueLabel}</label>
              <input
                type="number"
                step="0.01"
                value={form.amountZl}
                onChange={(e) => setForm((f) => ({ ...f, amountZl: e.target.value }))}
                className="admin-input w-full"
                placeholder="np. 15.00"
              />
            </div>
          )}

          <div>
            <label className="text-xs text-[var(--adm-muted)]">Min. koszyk (zł)</label>
            <input
              type="number"
              step="0.01"
              value={form.minOrderZl}
              onChange={(e) => setForm((f) => ({ ...f, minOrderZl: e.target.value }))}
              className="admin-input w-full"
              placeholder="np. 200.00"
            />
          </div>

          <div>
            <label className="text-xs text-[var(--adm-muted)]">Limit globalny (opcjonalnie)</label>
            <input
              type="number"
              value={form.usageLimit}
              onChange={(e) => setForm((f) => ({ ...f, usageLimit: e.target.value }))}
              className="admin-input w-full"
            />
          </div>
          <div>
            <label className="text-xs text-[var(--adm-muted)]">Limit na użytkownika (opcjonalnie)</label>
            <input
              type="number"
              value={form.perUserLimit}
              onChange={(e) => setForm((f) => ({ ...f, perUserLimit: e.target.value }))}
              className="admin-input w-full"
            />
          </div>

          <div>
            <label className="text-xs text-[var(--adm-muted)]">Od (YYYY-MM-DD HH:MM)</label>
            <input
              type="datetime-local"
              value={form.validFrom}
              onChange={(e) => setForm((f) => ({ ...f, validFrom: e.target.value }))}
              className="admin-input w-full"
            />
          </div>
          <div>
            <label className="text-xs text-[var(--adm-muted)]">Do (YYYY-MM-DD HH:MM)</label>
            <input
              type="datetime-local"
              value={form.validTo}
              onChange={(e) => setForm((f) => ({ ...f, validTo: e.target.value }))}
              className="admin-input w-full"
            />
          </div>

          <label className="flex items-center gap-2 mt-1">
            <input
              type="checkbox"
              checked={!!form.active}
              onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
            />
            <span>Aktywny</span>
          </label>
        </div>

        <div className="mt-3 flex gap-2">
          <button
            onClick={save}
            className="admin-btn"
            style={{ background: "var(--adm-head)", borderColor: "#FFD70033", fontWeight: 700 }}
          >
            {editing ? "Zapisz zmiany" : "Dodaj kupon"}
          </button>
          <button onClick={startCreate} className="admin-btn">
            Wyczyść formularz
          </button>
        </div>
      </div>

      {/* LISTA */}
      <div className="admin-table-wrap">
        <table className="admin-table text-sm">
          <thead>
            <tr>
              <th className="text-left">Kod</th>
              <th className="text-left">Typ / Wartość</th>
              <th className="text-left">Min. koszyk</th>
              <th className="text-left">Aktywny</th>
              <th className="text-left">Użyto</th>
              <th className="text-left">Okres</th>
              <th className="text-left">Akcje</th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id}>
                <td className="font-semibold">{c.code}</td>
                <td>
                  {c.type === "PERCENT"
                    ? `PERCENT: ${c.percentage}%`
                    : `FIXED: ${toZl(c.amount)} zł`}
                </td>
                <td>{c.minOrder != null ? `${toZl(c.minOrder)} zł` : "—"}</td>
                <td className="text-center">{c.active ? "✓" : "—"}</td>
                <td className="text-center">{c.usedCount ?? 0}</td>
                <td className="whitespace-nowrap">
                  {(c.validFrom ? new Date(c.validFrom).toLocaleString("pl-PL") : "—") +
                    " → " +
                    (c.validTo ? new Date(c.validTo).toLocaleString("pl-PL") : "—")}
                </td>
                <td>
                  <div className="flex flex-wrap gap-2">
                    <button className="admin-btn px-2 py-1" onClick={() => startEdit(c)}>
                      Edytuj
                    </button>
                    <button className="admin-btn px-2 py-1" onClick={() => toggle(c)}>
                      {c.active ? "Wyłącz" : "Włącz"}
                    </button>
                    <button className="admin-btn px-2 py-1" onClick={() => resetUsedCount(c)}>
                      Resetuj licznik
                    </button>
                    <button className="admin-btn px-2 py-1" onClick={() => previewValidate(c)}>
                      Podgląd rabatu
                    </button>
                    <button
                      className="admin-btn danger px-2 py-1"
                      onClick={() => remove(c)}
                    >
                      Usuń
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!items.length && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-[var(--adm-muted)]">
                  Brak kuponów.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
