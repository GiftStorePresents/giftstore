// src/pages/AdminLogsPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

/* API origin */
const API_URL =
  (import.meta as any)?.env?.VITE_API_URL ||
  (typeof window !== "undefined" ? window.location.origin : "http://localhost:4000");

/* ===== Typy ===== */
type EntityType = "User" | "Product" | "Variant";

type AdminLog = {
  id: string;
  action: string;
  entityType: EntityType;
  entityId: string;
  before?: any | null;
  after?: any | null;
  meta?: any | null;
  createdAt: string;
  actor: { id: string; email: string | null };
};

type Paged<T> = {
  items: T[];
  total: number;
  page: number;
  pages: number;
};

/* ===== Helpery UI ===== */
function JsonBlock({ value }: { value: any }) {
  return (
    <pre
      className="rounded-lg border overflow-auto text-xs leading-5 font-mono admin-card"
      style={{ maxHeight: 260, padding: "10px 12px", whiteSpace: "pre-wrap", wordBreak: "break-word" }}
    >
      {JSON.stringify(value ?? null, null, 2)}
    </pre>
  );
}

function Badge({
  children,
  tone = "default",
  title,
}: {
  children: React.ReactNode;
  tone?: "default" | "info" | "warn" | "danger";
  title?: string;
}) {
  const tones: Record<string, { bg: string; color: string; border?: string }> = {
    default: { bg: "#252a3a", color: "#e9eef7", border: "rgba(255,255,255,.08)" },
    info: { bg: "#1f2d44", color: "#bcd9ff", border: "rgba(188,217,255,.25)" },
    warn: { bg: "#2d2e1f", color: "#efe7b5", border: "rgba(239,231,181,.25)" },
    danger: { bg: "#3a1f24", color: "#ffdfe1", border: "rgba(255,223,225,.25)" },
  };
  const t = tones[tone] || tones.default;
  return (
    <span
      className="admin-badge"
      title={title}
      style={{ background: t.bg, color: t.color, borderColor: t.border, display: "inline-flex", alignItems: "center", gap: 6 }}
    >
      {children}
    </span>
  );
}

/* ===== Hook: stan w URL, poprawne typowanie ===== */
function useQueryState<T extends string>(key: string, init: T) {
  const [sp, setSp] = useSearchParams();
  const value = ((sp.get(key) as T) ?? init) as T;
  const setValue = (v: T) => {
    const next = new URLSearchParams(sp);
    if (v === ("" as unknown as T)) next.delete(key);
    else next.set(key, v as string);
    setSp(next, { replace: true });
  };
  return [value, setValue] as const;
}

/* ===== Strona ===== */
export default function AdminLogsPage() {
  // Filtry (z podanym generykiem – żeby TS nie robił literali "1" / "")
  const [q, setQ] = useQueryState<string>("q", "");
  const [entity, setEntity] = useQueryState<"" | EntityType>("entity", "");
  const [action, setAction] = useQueryState<string>("action", "");
  const [page, setPage] = useQueryState<string>("page", "1");
  const [limit, setLimit] = useQueryState<string>("limit", "25");

  const pageNum = Math.max(1, parseInt(page || "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(10, parseInt(limit || "25", 10) || 25));

  const [data, setData] = useState<Paged<AdminLog> | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const qp = useMemo(() => {
    const p = new URLSearchParams();
    p.set("page", String(pageNum));
    p.set("limit", String(pageSize));
    if (q) p.set("q", q);
    if (entity) p.set("entityType", entity);
    if (action) p.set("action", action);
    return p.toString();
  }, [q, entity, action, pageNum, pageSize]);

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const r = await fetch(`${API_URL}/api/admin/logs?${qp}`, {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (!r.ok) throw new Error((await r.text().catch(() => "")) || `HTTP ${r.status}`);
      const json = (await r.json()) as Paged<AdminLog>;
      setData(json);
    } catch (e: any) {
      setErr(e?.message || "Nie udało się pobrać logów.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [qp]);

  return (
    <div className="admin-skin admin-page max-w-7xl mx-auto p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Logi administracyjne</h1>
        <button className="admin-btn px-3 py-1" onClick={load} disabled={loading}>
          {loading ? "Odświeżam…" : "Odśwież"}
        </button>
      </div>

      {/* Filtry */}
      <div className="admin-card p-3 mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <input
          className="admin-input"
          placeholder="Szukaj (action, entityId, actor email)…"
          value={q}
          onChange={(e) => { setQ(e.target.value as string); setPage("1"); }}
        />
        <select
          className="admin-select"
          value={entity}
          onChange={(e) => { setEntity(e.target.value as "" | EntityType); setPage("1"); }}
        >
          <option value="">Encja: wszystkie</option>
          <option value="User">User</option>
          <option value="Product">Product</option>
          <option value="Variant">Variant</option>
        </select>
        <input
          className="admin-input"
          placeholder="Akcja (np. LOGIN, PRODUCT_UPDATE)…"
          value={action}
          onChange={(e) => { setAction(e.target.value as string); setPage("1"); }}
        />
        <select
          className="admin-select"
          value={limit}
          onChange={(e) => { setLimit(e.target.value as string); setPage("1"); }}
        >
          {["25", "50", "75", "100"].map(n => <option key={n} value={n}>{n} / strona</option>)}
        </select>
      </div>

      {err && (
        <div className="mb-3 admin-card rounded-lg p-3 text-sm" style={{ color: "#ffdfe1", background: "#3a1f24" }}>
          {err}
        </div>
      )}

      <div className="admin-table-wrap">
        <table className="admin-table text-sm">
          <thead>
            <tr>
              <th className="text-left">Czas</th>
              <th className="text-left">Aktor</th>
              <th className="text-left">Akcja</th>
              <th className="text-left">Encja</th>
              <th className="text-left">Diff</th>
            </tr>
          </thead>
          <tbody>
            {loading && !data?.items?.length ? (
              <tr><td colSpan={5} className="text-center py-6">Ładowanie…</td></tr>
            ) : !data?.items?.length ? (
              <tr><td colSpan={5} className="text-center py-6">Brak wpisów.</td></tr>
            ) : (
              data.items.map((log) => (
                <tr key={log.id} className="align-top">
                  <td className="whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString("pl-PL")}
                  </td>
                  <td className="whitespace-nowrap">{log.actor?.email || "—"}</td>
                  <td className="font-mono"><Badge tone="info" title={log.action}>{log.action}</Badge></td>
                  <td className="whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <Badge tone="default">{log.entityType}</Badge>
                      <span className="text-[var(--adm-muted)]">#{log.entityId}</span>
                    </div>
                  </td>
                  <td>
                    <details>
                      <summary className="cursor-pointer admin-btn px-2 py-1 inline-flex">Pokaż</summary>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                        <div>
                          <div className="text-xs text-[var(--adm-muted)] mb-1">before</div>
                          <JsonBlock value={log.before ?? null} />
                        </div>
                        <div>
                          <div className="text-xs text-[var(--adm-muted)] mb-1">after</div>
                          <JsonBlock value={log.after ?? null} />
                        </div>
                      </div>
                      {log.meta ? (
                        <div className="mt-3">
                          <div className="text-xs text-[var(--adm-muted)] mb-1">meta</div>
                          <JsonBlock value={log.meta} />
                        </div>
                      ) : null}
                    </details>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Paginacja */}
      <div className="flex items-center justify-between gap-3 mt-4">
        <div className="text-sm text-[var(--adm-muted)]">
          Strona {data?.page ?? pageNum} / {data?.pages ?? 1} — razem {data?.total ?? 0}
        </div>
        <div className="flex gap-2">
          <button
            className="admin-btn"
            disabled={(data?.page ?? pageNum) <= 1 || loading}
            onClick={() => setPage(String(Math.max(1, (data?.page ?? pageNum) - 1)))}
          >
            ← Poprzednia
          </button>
          <button
            className="admin-btn"
            disabled={(data?.page ?? pageNum) >= (data?.pages ?? 1) || loading}
            onClick={() => setPage(String(Math.min((data?.pages ?? 1), (data?.page ?? pageNum) + 1)))}
          >
            Następna →
          </button>
        </div>
      </div>
    </div>
  );
}
