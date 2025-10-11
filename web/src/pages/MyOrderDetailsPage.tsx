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
  // Faktury
  invoiceIssuedAt?: string | null;
  invoiceNumber?: string | null;
};

// CSRF cookie (jak w LoginPage)
const CSRF_COOKIE_NAME = "csrf";
function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${name.replace(/([.*+?^${}()|[\\]\\\\])/g, "\\$1")}=([^;]*)`)
  );
  return match ? decodeURIComponent(match[1]) : null;
}
const REDIRECT_KEY = "postLoginRedirect";

export default function MyOrderDetailsPage() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { login, loading: authLoading, user } = useAuth();

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [err, setErr] = useState("");

  // Dokąd wrócić po zalogowaniu dowolną metodą
  const intendedPath = useMemo(
    () => (location.pathname + location.search) || `/orders/${encodeURIComponent(id)}`,
    [location.pathname, location.search, id]
  );

  const money = (c?: number | null) =>
    typeof c === "number" ? (c / 100).toFixed(2) + " zł" : "—";

  const fetchOrder = useCallback(async () => {
    setLoading(true);
    setErr("");
    setNeedsAuth(false);
    try {
      // backend akceptuje id LUB number
      const res = await api.orders.my.get(id);
      const normalized: Order = {
        ...res.order,
        items: Array.isArray(res.order.items) ? res.order.items : [],
      };
      setOrder(normalized);
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

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  // Jeśli wróciliśmy z OAuth/Magic i user już jest, a wcześniej było 401 → dociągnij automatycznie
  useEffect(() => {
    if (user && needsAuth) {
      (async () => {
        await fetchOrder();
        setNeedsAuth(false);
      })();
    }
  }, [user, needsAuth, fetchOrder]);

  // ── Inline login (hasło) ──────────────────────────────────────────
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [loginErr, setLoginErr] = useState("");

  async function handleInlineLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginErr("");
    if (!loginForm.email || !loginForm.password) {
      setLoginErr("Wpisz adres e-mail i hasło.");
      return;
    }
    try {
      // zapamiętaj cel na wszelki wypadek (dla OAuth/magic też skorzystamy)
      sessionStorage.setItem(REDIRECT_KEY, intendedPath);
      await login(loginForm.email, loginForm.password); // ważne: AuthContext.fetch z credentials:"include"
      await fetchOrder(); // po zalogowaniu od razu dociągamy szczegóły
      setNeedsAuth(false);
    } catch (err: any) {
      setLoginErr(err?.message || "Logowanie nie powiodło się.");
    }
  }

  // ── Magic link (jak w LoginPage, ale wbudowany) ───────────────────
  const [magicEmail, setMagicEmail] = useState("");
  const [magicStatus, setMagicStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [magicMsg, setMagicMsg] = useState("");

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    if (!magicEmail.trim()) {
      setMagicStatus("error");
      setMagicMsg("Podaj e-mail.");
      return;
    }
    try {
      setMagicStatus("loading");
      setMagicMsg("");
      // zapamiętaj dokąd wrócić po kliknięciu w mailu
      sessionStorage.setItem(REDIRECT_KEY, intendedPath);

      const csrf = getCookie(CSRF_COOKIE_NAME);
      const res = await fetch(`${API_BASE}/api/auth/magic/start`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(csrf ? { "X-CSRF-Token": csrf } : {}),
        },
        body: JSON.stringify({ email: magicEmail.trim() }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(
          txt ||
            (res.status === 403
              ? "Odrzucono z powodu CSRF. Odśwież stronę i spróbuj ponownie."
              : "Nie udało się wysłać linku.")
        );
      }
      setMagicStatus("success");
      setMagicMsg("Wysłaliśmy link logowania na e-mail (ważny ~15 minut). Sprawdź skrzynkę.");
    } catch (err: any) {
      setMagicStatus("error");
      setMagicMsg(err?.message || "Błąd podczas wysyłki linku.");
    }
  }

  // ── OAuth (Google / Apple): ustawiamy redirect w sessionStorage i przekierowujemy ─
  function oauthRedirect(kind: "google" | "apple") {
    sessionStorage.setItem(REDIRECT_KEY, intendedPath);
    window.location.href = `${API_BASE}/api/auth/${kind}`;
  }

  // ── Widok: prosimy o logowanie (miłe copy, bez linku do /login) ──
  if (needsAuth) {
    return (
      <div className="max-w-md mx-auto mt-10 bg-white rounded-2xl border-2 border-gold shadow p-6">
        <h1 className="text-xl font-bold text-mainRed mb-2 text-center">Logowanie</h1>
        <p className="text-gray-700 mb-4 text-center">
          Zaloguj się, aby zobaczyć zamówienie <span className="font-semibold">{id}</span>.
        </p>

        {/* Hasło */}
        <form onSubmit={handleInlineLogin} className="space-y-3">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1" htmlFor="inline-email">
              E-mail
            </label>
            <input
              id="inline-email"
              type="email"
              className="w-full p-2 rounded border outline-none focus:ring-2 focus:ring-gold"
              placeholder="np. jan@kowalski.pl"
              value={loginForm.email}
              onChange={(e) => setLoginForm((f) => ({ ...f, email: e.target.value }))}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1" htmlFor="inline-password">
              Hasło
            </label>
            <input
              id="inline-password"
              type="password"
              className="w-full p-2 rounded border outline-none focus:ring-2 focus:ring-gold"
              placeholder="Twoje hasło"
              value={loginForm.password}
              onChange={(e) => setLoginForm((f) => ({ ...f, password: e.target.value }))}
              required
            />
          </div>

          {loginErr && <div className="text-red-700 text-sm">{loginErr}</div>}
          {err && !loginErr && <div className="text-gray-600 text-xs">{err}</div>}

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

        {/* Divider */}
        <div className="flex items-center gap-3 my-4 text-xs text-gray-500">
          <div className="flex-1 h-px bg-gray-200" />
          <span>lub</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        {/* Google / Apple */}
        <div className="grid gap-2">
          <button
            type="button"
            className="w-full rounded py-2 font-bold bg-white text-gray-800 border hover:bg-gray-50"
            onClick={() => oauthRedirect("google")}
          >
            Zaloguj przez Google
          </button>
          <button
            type="button"
            className="w-full rounded py-2 font-bold bg-white text-gray-800 border hover:bg-gray-50"
            onClick={() => oauthRedirect("apple")}
          >
            Zaloguj przez Apple
          </button>
        </div>

        {/* Magic link */}
        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-gray-700">
            Zaloguj bez hasła (magic link)
          </summary>
          <form onSubmit={sendMagicLink} className="mt-3 space-y-2">
            <label className="block text-sm font-semibold text-gray-700" htmlFor="magic-email">
              E-mail
            </label>
            <div className="flex gap-2">
              <input
                id="magic-email"
                type="email"
                required
                placeholder="np. jan@kowalski.pl"
                className="w-full p-2 rounded border outline-none focus:ring-2 focus:ring-gold"
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
            {magicStatus === "success" && (
              <p className="mt-2 text-green-700 text-sm">{magicMsg}</p>
            )}
            {magicStatus === "error" && (
              <p className="mt-2 text-red-700 text-sm">{magicMsg}</p>
            )}
          </form>
        </details>

        {/* Przyciski pomocnicze */}
        <div className="flex gap-3 justify-center mt-4">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="px-5 py-2 rounded-xl border text-mainRed hover:bg-gray-50 transition"
          >
            Wróć
          </button>
        </div>
      </div>
    );
  }

  // Ładowanie / inne błędy
  if (loading || !order) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <Link to="/orders" className="underline text-mainRed">
          ← Moje zamówienia
        </Link>
        {loading ? (
          <div className="mt-3">Ładowanie…</div>
        ) : err ? (
          <div className="mt-3 text-red-700">{err}</div>
        ) : null}
      </div>
    );
  }

  // Widok szczegółów
  return (
    <div className="bg-white rounded-3xl shadow-xl p-8 max-w-3xl mx-auto mt-10 border-2 border-gold">
      <Link to="/orders" className="underline text-mainRed">
        ← Moje zamówienia
      </Link>

      <h1 className="text-2xl font-bold text-mainRed mt-3 mb-2">
        Zamówienie {order.number}
      </h1>

      <div className="text-sm text-gray-600 mb-4">
        Status: <b>{order.status}</b> • {new Date(order.createdAt).toLocaleString()}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-2 border text-left">Produkt</th>
              <th className="p-2 border">SKU</th>
              <th className="p-2 border">Ilość</th>
              <th className="p-2 border">Cena (szt.)</th>
              <th className="p-2 border">Razem</th>
            </tr>
          </thead>
          <tbody>
            {(order.items ?? []).map((it, i) => {
              const name = it.name || "(produkt)";
              const sku = it.sku || "—";
              const unit = it.priceCents ?? 0;
              return (
                <tr key={i}>
                  <td className="p-2 border">{name}</td>
                  <td className="p-2 border text-center">{sku}</td>
                  <td className="p-2 border text-center">{it.qty}</td>
                  <td className="p-2 border text-right">{money(unit)}</td>
                  <td className="p-2 border text-right">{money(unit * it.qty)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 grid gap-1 max-w-sm ml-auto">
        <div className="flex justify-between">
          <span>Produkty:</span>
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

      {/* Dokumenty (link do faktury PDF – tylko gdy istnieje) */}
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
  );
}
