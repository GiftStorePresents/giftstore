// src/pages/AdminOrdersPage.tsx
import React, { useEffect, useMemo, useState } from "react";
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
    next.set("page", "1");
    setSp(next, { replace: true });
  };

  const money = (cents: number) => (cents / 100).toFixed(2) + " zł";

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Zamówienia</h1>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input
          className="border rounded px-3 py-2"
          placeholder="Szukaj (nr zam., email)"
          defaultValue={q}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              updateParam({ q: (e.target as HTMLInputElement).value });
            }
          }}
        />
        <select
          className="border rounded px-3 py-2"
          value={status}
          onChange={(e) => updateParam({ status: e.target.value })}
        >
          {STATUSES.map((s) => (
            <option key={s || "ALL"} value={s}>
              {STATUS_LABEL[s] || s}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="px-3 py-2 border rounded"
          onClick={() => load()}
          disabled={loading}
        >
          Odśwież
        </button>

        <a
          className="ml-auto px-3 py-2 border rounded hover:bg-gray-50"
          href={`${API_BASE}/api/admin/orders/export.csv`}
          target="_blank"
          rel="noreferrer"
          title="Eksport CSV"
        >
          Eksport CSV
        </a>
      </div>

      {err && (
        <div className="mb-3 text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded">
          {err}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm border">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-2 border text-left">Numer</th>
              <th className="p-2 border text-left">Użytkownik</th>
              <th className="p-2 border">Status</th>
              <th className="p-2 border">Kwota</th>
              <th className="p-2 border">Data</th>
              <th className="p-2 border">Akcje</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="p-3 border text-center" colSpan={6}>
                  Ładowanie…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td className="p-3 border text-center" colSpan={6}>
                  Brak wyników.
                </td>
              </tr>
            ) : (
              items.map((o) => (
                <tr key={o.id}>
                  <td className="p-2 border font-mono">{o.number || o.id}</td>
                  <td className="p-2 border">
                    {o.user?.email || "—"}
                    {o.user?.name ? ` (${o.user.name})` : ""}
                  </td>
                  <td className="p-2 border text-center">
                    {STATUS_LABEL[o.status] || o.status}
                  </td>
                  <td className="p-2 border text-right">{money(o.totalCents)}</td>
                  <td className="p-2 border whitespace-nowrap">
                    {new Date(o.createdAt).toLocaleString()}
                  </td>
                  <td className="p-2 border">
                    <Link
                      to={`/admin/orders/${o.id}`}
                      className="px-2 py-1 border rounded hover:bg-gray-50 inline-block"
                    >
                      Szczegóły
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          className="px-3 py-1 border rounded"
          disabled={page <= 1 || loading}
          onClick={() => setSp({ q, status, limit: String(limit), page: String(page - 1) })}
        >
          ←
        </button>
        <span>
          Strona {page}/{pages}
        </span>
        <button
          type="button"
          className="px-3 py-1 border rounded"
          disabled={page >= pages || loading}
          onClick={() => setSp({ q, status, limit: String(limit), page: String(page + 1) })}
        >
          →
        </button>
        <span className="ml-auto text-sm text-gray-600">Łącznie: {total}</span>
      </div>
    </div>
  );
}
