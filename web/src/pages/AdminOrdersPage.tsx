// src/pages/AdminOrdersPage.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { API_BASE } from "../api";

type OrderRow = {
  id: string;
  number: string;
  status:
    | "PENDING"
    | "PAID"
    | "PREPARING"
    | "PACKING"
    | "READY_TO_SHIP"
    | "SHIPPED"
    | "FULFILLED"
    | "CANCELLED"
    | "REFUNDED";
  totalCents: number;
  createdAt: string;
  user?: { id: string; email: string | null; name: string | null } | null;
};

type OrdersListResponse = {
  items: OrderRow[];
  total: number;
  page: number;
  pages: number;
};

const STATUSES = [
  "",
  "PENDING",
  "PAID",
  "PREPARING",
  "PACKING",
  "READY_TO_SHIP",
  "SHIPPED",
  "FULFILLED",
  "CANCELLED",
  "REFUNDED",
] as const;

const STATUS_LABEL: Record<string, string> = {
  "": "Wszystkie statusy",
  PENDING: "Oczekujące",
  PAID: "Opłacone",
  PREPARING: "W trakcie przygotowania",
  PACKING: "Pakowanie",
  READY_TO_SHIP: "Gotowe do wysyłki",
  SHIPPED: "Wysłane",
  FULFILLED: "Zrealizowane",
  CANCELLED: "Anulowane",
  REFUNDED: "Zwrócone",
};

// delikatne kolory badge pod ciemny motyw admina
const STATUS_COLORS: Record<string, { bg: string; color: string; border?: string }> = {
  PENDING: { bg: "#2a2640", color: "#c5c1ff", border: "rgba(197,193,255,.25)" },
  PAID: { bg: "#123425", color: "#b6f3d0", border: "rgba(182,243,208,.25)" },
  PREPARING: { bg: "#243447", color: "#cbe7ff", border: "rgba(203,231,255,.25)" },
  PACKING: { bg: "#2d2e1f", color: "#efe7b5", border: "rgba(239,231,181,.25)" },
  READY_TO_SHIP: { bg: "#1d343d", color: "#b6e9f5", border: "rgba(182,233,245,.25)" },
  SHIPPED: { bg: "#1f2d44", color: "#bcd9ff", border: "rgba(188,217,255,.25)" },
  FULFILLED: { bg: "#152e26", color: "#bff0d7", border: "rgba(191,240,215,.25)" },
  CANCELLED: { bg: "#3a1f24", color: "#ffdfe1", border: "rgba(255,223,225,.25)" },
  REFUNDED: { bg: "#2e223f", color: "#dcc7ff", border: "rgba(220,199,255,.25)" },
};

export default function AdminOrdersPage() {
  const [sp, setSp] = useSearchParams();
  const [items, setItems] = useState<OrderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const page = Math.max(1, parseInt(sp.get("page") || "1", 10));
  const q = sp.get("q") || "";
  const status = sp.get("status") || "";
  const limit = Math.max(1, Math.min(100, parseInt(sp.get("limit") || "20", 10)));

  const searchRef = useRef<HTMLInputElement | null>(null);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    p.set("page", String(page));
    p.set("limit", String(limit));
    if (q.trim()) p.set("q", q.trim());
    if (status) p.set("status", status);
    return p.toString();
  }, [page, limit, q, status]);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`${API_BASE}/api/admin/orders?${qs}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as OrdersListResponse;
      setItems(data.items);
      setTotal(data.total);
      setPages(data.pages);
    } catch (e: any) {
      setErr(e?.message || "Nie udało się pobrać zamówień.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qs]);

  const updateParam = (patch: Record<string, string | number | null>) => {
    const next = new URLSearchParams(sp.toString());
    Object.entries(patch).forEach(([k, v]) => {
      if (v === null || v === "") next.delete(k);
      else next.set(k, String(v));
    });
    // reset strony na 1 przy każdej zmianie filtrów
    next.set("page", "1");
    setSp(next, { replace: true });
  };

  const money = (cents: number) => (cents / 100).toFixed(2) + " zł";

  return (
    <div className="admin-skin admin-page p-6 max-w-6xl mx-auto">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Zamówienia</h1>
        <Link to="/admin" className="admin-btn px-2 py-1">← Panel</Link>
      </div>

      {/* Filtry / akcje */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <input
            ref={searchRef}
            className="admin-input"
            placeholder="Szukaj (nr zam., email)"
            defaultValue={q}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                updateParam({ q: (e.target as HTMLInputElement).value });
              }
            }}
          />
          {q ? (
            <button
              type="button"
              className="admin-btn"
              title="Wyczyść"
              onClick={() => {
                updateParam({ q: null });
                if (searchRef.current) searchRef.current.value = "";
              }}
            >
              Wyczyść
            </button>
          ) : null}
        </div>

        <select
          className="admin-input"
          value={status}
          onChange={(e) => updateParam({ status: e.target.value })}
        >
          {STATUSES.map((s) => (
            <option key={s || "ALL"} value={s}>
              {STATUS_LABEL[s] || s}
            </option>
          ))}
        </select>

        <select
          className="admin-input"
          value={String(limit)}
          onChange={(e) => updateParam({ limit: parseInt(e.target.value, 10) })}
          title="Ilość na stronę"
        >
          {[10, 20, 30, 50, 100].map((n) => (
            <option key={n} value={n}>
              {n}/stronę
            </option>
          ))}
        </select>

        <button
          type="button"
          className="admin-btn"
          onClick={() => load()}
          disabled={loading}
          title="Odśwież listę"
        >
          {loading ? "Odświeżam…" : "Odśwież"}
        </button>

        <a
          className="ml-auto admin-btn"
          href={`${API_BASE}/api/admin/orders/export.csv`}
          target="_blank"
          rel="noreferrer"
          title="Eksport CSV"
        >
          Eksport CSV
        </a>
      </div>

      {/* Tabela */}
      <div className="admin-table-wrap">
        <table className="admin-table text-sm">
          <thead>
            <tr>
              <th className="text-left">Numer</th>
              <th className="text-left">Użytkownik</th>
              <th className="text-left">Status</th>
              <th className="text-right">Kwota</th>
              <th className="text-left">Data</th>
              <th className="text-left">Akcje</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-3 py-4 text-center" colSpan={6}>
                  Ładowanie…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-center text-[var(--adm-muted)]" colSpan={6}>
                  Brak wyników.
                </td>
              </tr>
            ) : (
              items.map((o) => {
                const c = STATUS_COLORS[o.status] || { bg: "#262b39", color: "#e9eef7" };
                return (
                  <tr key={o.id}>
                    <td className="font-mono">
                      {o.number || o.id}
                    </td>
                    <td>
                      {o.user?.email || "—"}
                      {o.user?.name ? (
                        <span className="text-[var(--adm-muted)]"> ({o.user.name})</span>
                      ) : null}
                    </td>
                    <td>
                      <span
                        className="admin-badge"
                        style={{
                          background: c.bg,
                          color: c.color,
                          borderColor: c.border || "transparent",
                        }}
                        title={o.status}
                      >
                        {STATUS_LABEL[o.status] || o.status}
                      </span>
                    </td>
                    <td className="text-right whitespace-nowrap">{money(o.totalCents)}</td>
                    <td className="whitespace-nowrap">
                      {new Date(o.createdAt).toLocaleString()}
                    </td>
                    <td>
                      <Link
                        to={`/admin/orders/${o.id}`}
                        className="admin-btn px-2 py-1 inline-block"
                        title="Szczegóły zamówienia"
                      >
                        Szczegóły
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Paginacja */}
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          className={`admin-btn ${page <= 1 || loading ? "opacity-50 cursor-not-allowed" : ""}`}
          disabled={page <= 1 || loading}
          onClick={() => setSp({ q, status, limit: String(limit), page: String(page - 1) })}
        >
          ←
        </button>
        <span className="text-sm text-[var(--adm-muted)]">
          Strona {page}/{pages}
        </span>
        <button
          type="button"
          className={`admin-btn ${page >= pages || loading ? "opacity-50 cursor-not-allowed" : ""}`}
          disabled={page >= pages || loading}
          onClick={() => setSp({ q, status, limit: String(limit), page: String(page + 1) })}
        >
          →
        </button>
        <span className="ml-auto text-sm text-[var(--adm-muted)]">Łącznie: {total}</span>
      </div>
    </div>
  );
}
