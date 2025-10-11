// src/pages/AdminOrderDetailsPage.tsx
import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { API_BASE } from "../api";

type OrderStatus =
  | "PENDING"
  | "PAID"
  | "FULFILLED"
  | "CANCELLED"
  | "REFUNDED"
  // rozszerzone:
  | "PREPARING"
  | "PACKING"
  | "READY_TO_SHIP"
  | "SHIPPED";

type Item = {
  id?: string;
  qty: number;
  priceCents: number;
  sku?: string | null;
  name?: string | null;
  category?: string | null;
  variant?: {
    sku?: string | null;
    priceCents?: number;
    product?: { name?: string; slug?: string; category?: string | null };
  };
};

type AdminOrder = {
  id: string;
  number: string;
  status: OrderStatus;
  totalCents: number;
  subtotalCents?: number;
  discountCents?: number;
  shippingCents?: number;
  paymentSurchargeCents?: number;
  shippingName?: string | null;
  shippingAddr1?: string | null;
  shippingCity?: string | null;
  shippingZip?: string | null;
  createdAt: string;
  updatedAt?: string;
  user?: { id?: string; email: string | null; name: string | null } | null;
  items: Item[];
};

const STATUS_OPTIONS: Array<{ code: OrderStatus; label: string }> = [
  { code: "PENDING", label: "Oczekujące" },
  { code: "PAID", label: "Opłacone" },
  { code: "PREPARING", label: "W trakcie przygotowania" },
  { code: "PACKING", label: "Pakowanie" },
  { code: "READY_TO_SHIP", label: "Gotowe do wysłania" },
  { code: "SHIPPED", label: "Wysłane" },
  { code: "FULFILLED", label: "Zrealizowane" },
  { code: "CANCELLED", label: "Anulowane" },
  { code: "REFUNDED", label: "Zwrócone" },
];

// pomocniczo: pobranie CSRF z ciasteczka
function getCookie(name: string) {
  return (
    document.cookie
      .split("; ")
      .find((row) => row.startsWith(name + "="))
      ?.split("=")[1] || ""
  );
}

export default function AdminOrderDetailsPage() {
  const params = useParams<{ id?: string; orderId?: string }>();
  const orderParam = (params.id || params.orderId || "").trim();

  const [order, setOrder] = useState<AdminOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const money = (cents?: number | null) =>
    typeof cents === "number" ? (cents / 100).toFixed(2) + " zł" : "—";

  async function load() {
    if (!orderParam) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/admin/orders/${encodeURIComponent(orderParam)}`,
        { credentials: "include" }
      );
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { order: AdminOrder } | AdminOrder;
      const o = (data as any).order || data;
      setOrder(o as AdminOrder);
    } catch (e: any) {
      setErr(e?.message || "Nie udało się pobrać zamówienia.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderParam]);

  async function changeStatus(next: OrderStatus) {
    if (!order) return;
    if (!confirm(`Zmienić status na: ${STATUS_OPTIONS.find(s => s.code === next)?.label || next}?`)) return;
    setBusy(true);
    try {
      // CSRF token (wymagany przez backend dla metod mutujących)
      const csrf = getCookie("csrf") || getCookie("XSRF-TOKEN");

      const res = await fetch(
        `${API_BASE}/api/admin/orders/${encodeURIComponent(order.id)}/status`,
        {
          method: "PATCH",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            ...(csrf ? { "X-CSRF-Token": csrf } : {}),
          },
          body: JSON.stringify({ status: next }),
        }
      );
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `HTTP ${res.status}`);
      }
      await load();
    } catch (e: any) {
      alert(e?.message || "Błąd zmiany statusu.");
    } finally {
      setBusy(false);
    }
  }

  if (loading)
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <Link to="/admin/orders" className="underline text-mainRed">
          ← Powrót
        </Link>
        <div className="mt-3">Ładowanie…</div>
      </div>
    );

  if (err)
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <Link to="/admin/orders" className="underline text-mainRed">
          ← Powrót
        </Link>
        <div className="mt-3 text-red-700">{err}</div>
      </div>
    );

  if (!order)
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <Link to="/admin/orders" className="underline text-mainRed">
          ← Powrót
        </Link>
        <div className="mt-3">Brak danych zamówienia.</div>
      </div>
    );

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-4 flex items-center gap-3">
        <Link to="/admin/orders" className="px-3 py-1 border rounded">
          ← Wszystkie zamówienia
        </Link>
        <a
          className="ml-auto px-3 py-1 border rounded hover:bg-gray-50"
          href={`${API_BASE}/api/admin/orders/export.csv`}
          target="_blank"
          rel="noreferrer"
        >
          Eksport CSV
        </a>
      </div>

      <h1 className="text-2xl font-bold mt-1 mb-2">
        Zamówienie {order.number}{" "}
        <span className="text-sm text-gray-500">({order.id})</span>
      </h1>
      <div className="text-sm text-gray-600 mb-4">
        Klient: {order.user?.email || "—"}
        {order.user?.name ? ` (${order.user.name})` : ""} • Utw.:{" "}
        {new Date(order.createdAt).toLocaleString()}
      </div>

      {/* Adres wysyłki */}
      <div className="mb-4 border rounded p-3 bg-white">
        <div className="font-semibold mb-1">Dostawa</div>
        <div>{order.shippingName || "—"}</div>
        <div>{order.shippingAddr1 || "—"}</div>
        <div>
          {order.shippingZip || ""} {order.shippingCity || ""}
        </div>
      </div>

      {/* Pozycje */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm border">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-2 border text-left">Produkt</th>
              <th className="p-2 border">Kategoria</th>
              <th className="p-2 border">SKU</th>
              <th className="p-2 border">Ilość</th>
              <th className="p-2 border">Cena (szt.)</th>
              <th className="p-2 border">Razem</th>
            </tr>
          </thead>
          <tbody>
            {order.items?.map((it, i) => {
              const p = it.variant?.product;
              const name = p?.name || it.name || "(produkt)";
              const category = p?.category ?? it.category ?? "—";
              const sku = it.variant?.sku || it.sku || "—";
              const unit = it.variant?.priceCents ?? it.priceCents ?? 0;
              return (
                <tr key={i}>
                  <td className="p-2 border">
                    {name}
                    {p?.slug ? (
                      <div className="text-xs text-gray-500">/{p.slug}</div>
                    ) : null}
                  </td>
                  <td className="p-2 border text-center">{category || "—"}</td>
                  <td className="p-2 border text-center">{sku || "—"}</td>
                  <td className="p-2 border text-center">{it.qty}</td>
                  <td className="p-2 border text-right">{money(unit)}</td>
                  <td className="p-2 border text-right">{money(unit * it.qty)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Podsumowanie */}
      <div className="mt-4 grid gap-1 max-w-sm ml-auto">
        <div className="flex justify-between">
          <span>Produkty (netto):</span>
          <span>{money(order.subtotalCents)}</span>
        </div>
        {typeof order.discountCents === "number" && order.discountCents > 0 && (
          <div className="flex justify-between">
            <span>Rabat:</span>
            <span>-{money(order.discountCents)}</span>
          </div>
        )}
        {typeof order.shippingCents === "number" && (
          <div className="flex justify-between">
            <span>Wysyłka:</span>
            <span>{money(order.shippingCents)}</span>
          </div>
        )}
        {typeof order.paymentSurchargeCents === "number" &&
          order.paymentSurchargeCents > 0 && (
            <div className="flex justify-between">
              <span>Dopłata płatności:</span>
              <span>{money(order.paymentSurchargeCents)}</span>
            </div>
          )}
        <div className="flex justify-between font-bold border-t pt-2">
          <span>Suma:</span>
          <span>{money(order.totalCents)}</span>
        </div>
      </div>

      {/* Status — szybka zmiana */}
      <div className="mt-6 flex flex-wrap gap-2">
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s.code}
            disabled={busy || order.status === s.code}
            onClick={() => changeStatus(s.code)}
            className={`px-3 py-1 border rounded ${
              order.status === s.code ? "bg-gray-200" : "hover:bg-gray-50"
            } disabled:opacity-60`}
            title={s.code}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
