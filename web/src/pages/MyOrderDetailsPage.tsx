// src/pages/MyOrderDetailsPage.tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useNavigate, useLocation } from "react-router-dom";
import { api, API_BASE } from "../api";
import { useAuth } from "../context/AuthContext";

type Item = { qty: number; priceCents: number; name?: string | null; sku?: string | null };

type Order = {
  id: string;
  number: string;
  status: string;
  totalCents: number;
  subtotalCents?: number | null;
  discountCents?: number | null;
  shippingCents?: number | null;
  paymentSurchargeCents?: number | null;
  createdAt: string;
  items?: Item[];
  invoiceIssuedAt?: string | null;
  invoiceNumber?: string | null;
};

const CSRF_COOKIE_NAME = "csrf";
function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(
    new RegExp(`(?:^|; )${name.replace(/([.*+?^${}()|[\\]\\\\])/g,"\\$1")}=([^;]*)`)
  );
  return m ? decodeURIComponent(m[1]) : null;
}
const REDIRECT_KEY = "postLoginRedirect";

/** Lokalne style i status-tekst */
const LocalStyles = () => (
  <style>{`
    .order-wrap{
      --ink:#0f172a; --muted:#475467; --surface:#ffffff; --surface-2:#fafafa;
      --line:rgba(17,24,39,.12); --gold: var(--gold,#ffd700); --red: var(--mainRed,#d7263d);
    }
    :root[data-theme="dark"] .order-wrap, html.dark .order-wrap{
      --ink:#eaf1ff; --muted:#a9b6d4; --surface:#0f1424; --surface-2:#111a2e; --line:rgba(122,162,255,.28);
    }
    .text-gold-alt{ color: var(--gold); }

    .card{ background:var(--surface); color:var(--ink); border:1.5px solid var(--gold); border-radius:20px; box-shadow:0 20px 55px rgba(0,0,0,.45); }

    .tbl{ width:100%; border-collapse:separate; border-spacing:0; border:2px solid var(--gold); border-radius:12px; overflow:hidden; }
    .tbl th, .tbl td{ padding:.75rem .85rem; border-bottom:1px solid var(--line); }
    .tbl thead th{ background:var(--surface-2); font-weight:800; text-align:left; color:var(--gold); }
    .tbl tbody tr:hover{ background: color-mix(in oklab, var(--surface) 92%, black 8%); }

    .st{ font-weight: 900; text-transform: uppercase; letter-spacing:.3px; }
    .st--paid{ color:#16a34a; }
    .st--preparing{ color: var(--gold); }
    .st--shipped{ color:#60a5fa; }
    .st--cancelled{ color:#ef4444; }
    .st--pending{ color:#f59e0b; }
    .st--default{ color: var(--red); }

    .money{ font-variant-numeric: tabular-nums; }
    .muted{ color:var(--muted); }
  `}</style>
);

function StatusText({ status }: { status: string }) {
  const key = (status || "").toLowerCase();
  const cls =
    key.includes("paid") || key.includes("zapł")
      ? "st--paid"
      : key.includes("prep") || key.includes("przyg")
      ? "st--preparing"
      : key.includes("ship") || key.includes("wysył")
      ? "st--shipped"
      : key.includes("pend") || key.includes("oczek")
      ? "st--pending"
      : key.includes("cancel") || key.includes("anul")
      ? "st--cancelled"
      : "st--default";
  return <span className={`st ${cls}`}>{status || "STATUS"}</span>;
}

export default function MyOrderDetailsPage() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { login, loading: authLoading, user } = useAuth();

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [err, setErr] = useState("");

  const intendedPath = useMemo(
    () => (location.pathname + location.search) || `/orders/${encodeURIComponent(id)}`,
    [location.pathname, location.search, id]
  );

  const money = (c?: number | null) => (typeof c === "number" ? (c / 100).toFixed(2) + " zł" : "—");

  const fetchOrder = useCallback(async () => {
    setLoading(true);
    setErr("");
    setNeedsAuth(false);
    try {
      const res = await api.orders.my.get(id);
      setOrder({ ...res.order, items: Array.isArray(res.order.items) ? res.order.items : [] });
    } catch (e: any) {
      const status = e?.status ?? e?.response?.status;
      if (status === 401) {
        setNeedsAuth(true);
        setErr("Zaloguj się, aby zobaczyć szczegóły tego zamówienia.");
      } else if (status === 404) {
        setErr("Nie znaleziono takiego zamówienia.");
      } else {
        setErr(e?.message || "Nie udało się pobrać zamówienia.");
      }
      setOrder(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchOrder(); }, [fetchOrder]);
  useEffect(() => {
    if (user && needsAuth) { (async () => { await fetchOrder(); setNeedsAuth(false); })(); }
  }, [user, needsAuth, fetchOrder]);

  // inline login
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [loginErr, setLoginErr] = useState("");
  async function handleInlineLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginErr("");
    if (!loginForm.email || !loginForm.password) { setLoginErr("Wpisz adres e-mail i hasło."); return; }
    try {
      sessionStorage.setItem(REDIRECT_KEY, intendedPath);
      await login(loginForm.email, loginForm.password);
      await fetchOrder();
      setNeedsAuth(false);
    } catch (error: any) {
      setLoginErr(error?.message || "Logowanie nie powiodło się.");
    }
  }

  // magic link
  const [magicEmail, setMagicEmail] = useState("");
  const [magicStatus, setMagicStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [magicMsg, setMagicMsg] = useState("");
  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    if (!magicEmail.trim()) { setMagicStatus("error"); setMagicMsg("Podaj e-mail."); return; }
    try {
      setMagicStatus("loading"); setMagicMsg("");
      sessionStorage.setItem(REDIRECT_KEY, intendedPath);
      const csrf = getCookie(CSRF_COOKIE_NAME);
      const res = await fetch(`${API_BASE}/api/auth/magic/start`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...(csrf ? { "X-CSRF-Token": csrf } : {}) },
        body: JSON.stringify({ email: magicEmail.trim() }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || "Nie udało się wysłać linku.");
      }
      setMagicStatus("success"); setMagicMsg("Wysłaliśmy link logowania na e-mail (ważny ~15 minut).");
    } catch (error: any) {
      setMagicStatus("error"); setMagicMsg(error?.message || "Błąd podczas wysyłki linku.");
    }
  }

  function oauthRedirectGoogle() {
    sessionStorage.setItem(REDIRECT_KEY, intendedPath);
    window.location.href = `${API_BASE}/api/auth/google`;
  }

  // ───── Widok: potrzeba logowania ─────
  if (needsAuth) {
    return (
      <section className="order-wrap max-w-lg mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <LocalStyles />
        <div className="card p-6">
          <h1 className="text-xl font-extrabold text-mainRed text-center mb-2">Logowanie</h1>
          <p className="muted text-center mb-5">
            Zaloguj się, aby zobaczyć zamówienie <b>{id}</b>.
          </p>

          <form onSubmit={handleInlineLogin} className="space-y-3">
            <div>
              <label className="block text-sm font-semibold mb-1" htmlFor="od-email">E-mail</label>
              <input
                id="od-email"
                type="email"
                className="w-full p-2 rounded border outline-none focus:ring-2 focus:ring-gold bg-white dark:bg-[#0f1424]"
                placeholder="np. jan@kowalski.pl"
                value={loginForm.email}
                onChange={(e) => setLoginForm((f) => ({ ...f, email: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1" htmlFor="od-pass">Hasło</label>
              <input
                id="od-pass"
                type="password"
                className="w-full p-2 rounded border outline-none focus:ring-2 focus:ring-gold bg-white dark:bg-[#0f1424]"
                placeholder="Twoje hasło"
                value={loginForm.password}
                onChange={(e) => setLoginForm((f) => ({ ...f, password: e.target.value }))}
                required
              />
            </div>
            {loginErr && <div className="text-red-500 text-sm">{loginErr}</div>}
            {err && !loginErr && <div className="text-xs muted">{err}</div>}

            <button
              type="submit"
              disabled={authLoading}
              className={`w-full rounded-xl py-2 font-bold transition ${
                authLoading
                  ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                  : "bg-gold text-mainRed hover:bg-mainRed hover:text-gold"
              }`}
              aria-busy={authLoading ? "true" : "false"}
            >
              {authLoading ? "Logowanie…" : "Zaloguj się"}
            </button>
          </form>

          <div className="flex items-center gap-3 my-4 text-xs muted">
            <div className="flex-1 h-px bg-gray-200/60 dark:bg-white/10" />
            <span>lub</span>
            <div className="flex-1 h-px bg-gray-200/60 dark:bg-white/10" />
          </div>

          {/* Tylko Google (Apple usunięte) */}
          <button
            type="button"
            className="w-full rounded py-2 font-bold bg-white dark:bg-[#0f1424] text-gray-800 dark:text-white border hover:bg-gray-50 dark:hover:bg-[#0f162b]"
            onClick={oauthRedirectGoogle}
          >
            Zaloguj przez Google
          </button>

          <details className="mt-4">
            <summary className="cursor-pointer text-sm">Zaloguj bez hasła (magic link)</summary>
            <form onSubmit={sendMagicLink} className="mt-3 space-y-2">
              <label className="block text-sm font-semibold" htmlFor="od-magic">E-mail</label>
              <div className="flex gap-2">
                <input
                  id="od-magic"
                  type="email"
                  required
                  placeholder="np. jan@kowalski.pl"
                  className="w-full p-2 rounded border outline-none focus:ring-2 focus:ring-gold bg-white dark:bg-[#0f1424]"
                  value={magicEmail}
                  onChange={(e) => setMagicEmail(e.target.value)}
                />
                <button
                  type="submit"
                  disabled={magicStatus === "loading"}
                  className={`px-4 rounded font-semibold ${
                    magicStatus === "loading"
                      ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                      : "bg-black text-white hover:bg-gray-900"
                  }`}
                  aria-busy={magicStatus === "loading" ? "true" : "false"}
                >
                  {magicStatus === "loading" ? "Wysyłamy…" : "Wyślij link"}
                </button>
              </div>
              {magicStatus === "success" && <p className="mt-2 text-green-600 text-sm">{magicMsg}</p>}
              {magicStatus === "error" && <p className="mt-2 text-red-500 text-sm">{magicMsg}</p>}
            </form>
          </details>

          <div className="flex justify-center mt-4">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="px-5 py-2 rounded-xl border text-mainRed hover:bg-gold/10 transition"
            >
              Wróć
            </button>
          </div>
        </div>
      </section>
    );
  }

  // Ładowanie / błąd bez auth
  if (loading || !order) {
    return (
      <section className="order-wrap max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <LocalStyles />
        <Link to="/orders" className="text-mainRed hover:underline">← Moje zamówienia</Link>
        {loading ? <div className="mt-3">Ładowanie…</div> : err ? <div className="mt-3 text-red-500">{err}</div> : null}
      </section>
    );
  }

  // Widok szczegółów
  return (
    <section className="order-wrap max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <LocalStyles />
      <Link to="/orders" className="text-mainRed hover:underline">← Moje zamówienia</Link>

      <div className="card p-6 mt-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gold-alt">
            Zamówienie <span className="text-mainRed">{order.number}</span>
          </h1>
          <StatusText status={order.status} />
        </div>

        <div className="muted mt-2">
          {new Date(order.createdAt).toLocaleString()}
        </div>

        <div className="mt-5 overflow-x-auto rounded-xl">
          <table className="tbl">
            <thead>
              <tr>
                <th>Produkt</th>
                <th>SKU</th>
                <th className="text-center">Ilość</th>
                <th className="text-right">Cena (szt.)</th>
                <th className="text-right">Razem</th>
              </tr>
            </thead>
            <tbody>
              {(order.items ?? []).map((it, i) => {
                const name = it.name || "(produkt)";
                const sku = it.sku || "—";
                const unit = it.priceCents ?? 0;
                return (
                  <tr key={i}>
                    <td>{name}</td>
                    <td className="text-sm">{sku}</td>
                    <td className="text-center">{it.qty}</td>
                    <td className="text-right money">{money(unit)}</td>
                    <td className="text-right money">{money(unit * it.qty)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-6 grid gap-1 max-w-sm ml-auto">
          <div className="flex justify-between"><span>Produkty:</span><span className="money">{money(order.subtotalCents)}</span></div>
          {typeof order.discountCents === "number" && order.discountCents > 0 && (
            <div className="flex justify-between"><span>Rabat:</span><span className="money">-{money(order.discountCents)}</span></div>
          )}
          {typeof order.shippingCents === "number" && (
            <div className="flex justify-between"><span>Wysyłka:</span><span className="money">{money(order.shippingCents)}</span></div>
          )}
          {typeof order.paymentSurchargeCents === "number" && order.paymentSurchargeCents > 0 && (
            <div className="flex justify-between"><span>Dopłata płatności:</span><span className="money">{money(order.paymentSurchargeCents)}</span></div>
          )}
          <div className="flex justify-between font-bold border-t pt-2">
            <span>Suma:</span><span className="money">{money(order.totalCents)}</span>
          </div>
        </div>

        {order.invoiceIssuedAt && (
          <div className="mt-6 border-t pt-4">
            <h2 className="font-semibold mb-2">Dokumenty</h2>
            <a
              href={`${API_BASE}/api/my/orders/${encodeURIComponent(order.number || order.id)}/invoice.pdf`}
              className="inline-block rounded-xl px-4 py-2 bg-gold text-mainRed font-bold hover:bg-mainRed hover:text-gold transition"
              target="_blank"
              rel="noreferrer"
            >
              Pobierz fakturę (PDF){order.invoiceNumber ? ` – ${order.invoiceNumber}` : ""}
            </a>
          </div>
        )}
      </div>
    </section>
  );
}
