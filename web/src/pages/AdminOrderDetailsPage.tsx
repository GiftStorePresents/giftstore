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

// Spójne kolory badge (jak na liście zamówień)
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

// pomocniczo: pobranie CSRF z ciasteczka
function getCookie(name: string) {
  return (
    document.cookie.split("; ").find((row) => row.startsWith(name + "="))?.split("=")[1] || ""
  );
}

/* ========= NOWE: API do wysyłki zaproszenia z opinią ========= */
async function sendReviewInvite(orderId: string) {
  const csrf = getCookie("csrf") || getCookie("XSRF-TOKEN");
  const res = await fetch(
    `${API_BASE}/api/admin/orders/${encodeURIComponent(orderId)}/review-invite`,
    {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(csrf ? { "X-CSRF-Token": csrf } : {}),
      },
      body: JSON.stringify({}), // backend generuje/odświeża token i wysyła mail
    }
  );
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(txt || `HTTP ${res.status}`);
  }
  return (await res.json().catch(() => ({}))) as { invited?: boolean; when?: string };
}
/* ============================================================ */

export default function AdminOrderDetailsPage() {
  const params = useParams<{ id?: string; orderId?: string }>();
  const orderParam = (params.id || params.orderId || "").trim();

  const [order, setOrder] = useState<AdminOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /* ========= NOWE: stan i handler do zaproszenia opinii ========= */
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteInfo, setInviteInfo] = useState<string | null>(null);

  async function handleInvite() {
    if (!order) return;
    if (!order.user?.email) {
      alert("Brak adresu e-mail klienta — nie można wysłać zaproszenia.");
      return;
    }
    if (!confirm(`Wysłać prośbę o opinię do: ${order.user.email}?`)) return;

    setInviteBusy(true);
    try {
      const resp = await sendReviewInvite(order.id);
      setInviteInfo(
        resp?.when ? `Wysłano (${new Date(resp.when).toLocaleString()})` : "Wysłano."
      );
    } catch (e: any) {
      alert(e?.message || "Nie udało się wysłać zaproszenia.");
    } finally {
      setInviteBusy(false);
    }
  }
  /* ============================================================= */

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
    if (
      !confirm(
        `Zmienić status na: ${STATUS_OPTIONS.find((s) => s.code === next)?.label || next}?`
      )
    )
      return;
    setBusy(true);
    try {
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
      <div className="admin-skin admin-page p-6 max-w-6xl mx-auto">
        <Link to="/admin/orders" className="admin-btn px-2 py-1">
          ← Powrót
        </Link>
        <div className="mt-3">Ładowanie…</div>
      </div>
    );

  if (err)
    return (
      <div className="admin-skin admin-page p-6 max-w-6xl mx-auto">
        <Link to="/admin/orders" className="admin-btn px-2 py-1">
          ← Powrót
        </Link>
        <div className="mt-3 text-red-500">{err}</div>
      </div>
    );

  if (!order)
    return (
      <div className="admin-skin admin-page p-6 max-w-6xl mx-auto">
        <Link to="/admin/orders" className="admin-btn px-2 py-1">
          ← Powrót
        </Link>
        <div className="mt-3">Brak danych zamówienia.</div>
      </div>
    );

  const sc = STATUS_COLORS[order.status] || { bg: "#262b39", color: "#e9eef7" };

  return (
    <div className="admin-skin admin-page p-6 max-w-6xl mx-auto">
      {/* Pasek akcji */}
      <div className="mb-4 flex items-center gap-3">
        <Link to="/admin/orders" className="admin-btn px-2 py-1">
          ← Wszystkie zamówienia
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <span
            className="admin-badge"
            style={{ background: sc.bg, color: sc.color, borderColor: sc["border"] || "transparent" }}
            title={order.status}
          >
            {STATUS_OPTIONS.find((s) => s.code === order.status)?.label || order.status}
          </span>

          {/* NOWE — Wyślij prośbę o opinię */}
          <button
            className="admin-btn px-2 py-1"
            onClick={handleInvite}
            disabled={inviteBusy}
            title={order.user?.email ? `Wyślij do ${order.user.email}` : "Brak e-maila"}
          >
            {inviteBusy ? "Wysyłanie..." : "Wyślij prośbę o opinię"}
          </button>
          {inviteInfo ? (
            <span className="text-sm text-[var(--adm-muted)]">{inviteInfo}</span>
          ) : null}

          <a
            className="admin-btn px-2 py-1"
            href={`${API_BASE}/api/admin/orders/export.csv`}
            target="_blank"
            rel="noreferrer"
            title="Eksport CSV"
          >
            Eksport CSV
          </a>
        </div>
      </div>

      {/* Nagłówek */}
      <div className="mb-3">
        <h1 className="text-2xl font-bold">
          Zamówienie {order.number} <span className="text-sm text-[var(--adm-muted)]">({order.id})</span>
        </h1>
        <div className="text-sm text-[var(--adm-muted)] mt-1">
          Klient: {order.user?.email || "—"}
          {order.user?.name ? ` (${order.user.name})` : ""} • Utw.:{" "}
          {new Date(order.createdAt).toLocaleString()}
          {order.updatedAt ? ` • Aktual.: ${new Date(order.updatedAt).toLocaleString()}` : ""}
        </div>
      </div>

      {/* Karty metryk */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <MetricCard label="Suma" value={money(order.totalCents)} />
        <MetricCard label="Produkty (netto)" value={money(order.subtotalCents)} />
        <MetricCard label="Wysyłka" value={money(order.shippingCents)} />
        <MetricCard label="Rabat" value={order.discountCents ? `-${money(order.discountCents)}` : "—"} />
      </div>

      {/* Adres wysyłki */}
      <div className="admin-card rounded-xl p-4 mb-4">
        <div className="font-semibold mb-2">Dostawa</div>
        <div>{order.shippingName || "—"}</div>
        <div>{order.shippingAddr1 || "—"}</div>
        <div>
          {(order.shippingZip || "")} {(order.shippingCity || "")}
        </div>
      </div>

      {/* Pozycje */}
      <div className="admin-table-wrap">
        <table className="admin-table text-sm">
          <thead>
            <tr>
              <th className="text-left">Produkt</th>
              <th className="text-left">Kategoria</th>
              <th className="text-left">SKU</th>
              <th className="text-center">Ilość</th>
              <th className="text-right">Cena (szt.)</th>
              <th className="text-right">Razem</th>
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
                  <td>
                    {name}
                    {p?.slug ? (
                      <div className="text-xs text-[var(--adm-muted)]">/{p.slug}</div>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap">{category || "—"}</td>
                  <td className="whitespace-nowrap">{sku || "—"}</td>
                  <td className="text-center">{it.qty}</td>
                  <td className="text-right whitespace-nowrap">{money(unit)}</td>
                  <td className="text-right whitespace-nowrap">{money(unit * it.qty)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Podsumowanie */}
      <div className="mt-4 grid gap-1 max-w-sm ml-auto admin-card rounded-xl p-4">
        <Row label="Produkty (netto)" value={money(order.subtotalCents)} />
        {typeof order.discountCents === "number" && order.discountCents > 0 && (
          <Row label="Rabat" value={`-${money(order.discountCents)}`} />
        )}
        {typeof order.shippingCents === "number" && <Row label="Wysyłka" value={money(order.shippingCents)} />}
        {typeof order.paymentSurchargeCents === "number" && order.paymentSurchargeCents > 0 && (
          <Row label="Dopłata płatności" value={money(order.paymentSurchargeCents)} />
        )}
        <Row label="Suma" value={money(order.totalCents)} bold top />
      </div>

      {/* Zmiana statusu */}
      <div className="mt-6">
        <div className="mb-2 font-semibold">Zmień status</div>
        <div className="flex flex-wrap gap-2">
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s.code}
              disabled={busy || order.status === s.code}
              onClick={() => changeStatus(s.code)}
              className={`admin-btn px-3 py-1 ${
                order.status === s.code ? "opacity-70 cursor-not-allowed" : ""
              }`}
              title={s.code}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ——— Pomocnicze komponenty ——— */

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="admin-card rounded-xl p-4">
      <div className="text-sm text-[var(--adm-muted)]">{label}</div>
      <div className="text-xl font-extrabold">{value}</div>
    </div>
  );
}

function Row({ label, value, bold, top }: { label: string; value: string; bold?: boolean; top?: boolean }) {
  return (
    <div className={`flex justify-between ${top ? "pt-2 border-t" : ""}`}>
      <span className={bold ? "font-bold" : ""}>{label}:</span>
      <span className={bold ? "font-bold" : ""}>{value}</span>
    </div>
  );
}
