// src/pages/AdminPage.tsx
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";

type Role = "USER" | "ADMIN";
type UserRow = {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  createdAt: string;
  verifiedAt: string | null;
  disabledAt?: string | null;
};

export default function AdminPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<"" | Role>("");
  const [verified, setVerified] = useState<"" | "true" | "false">("");
  const [page, setPage] = useState(1);
  const [resp, setResp] = useState<{
    items: Array<UserRow>;
    total: number;
    page: number;
    pages: number;
  } | null>(null);

  const [metrics, setMetrics] = useState<{
    totalUsers: number;
    verifiedUsers: number;
    admins: number;
    banned: number;
  } | null>(null);

  const isAdmin = useMemo(() => user?.role === "ADMIN", [user]);

  useEffect(() => {
    if (!user) return;
    if (!isAdmin) navigate("/");
  }, [user, isAdmin, navigate]);

  async function load(p = page) {
    setLoading(true);
    setError("");
    try {
      const [usersRes, metricsRes] = await Promise.all([
        api.admin.users(p, 20, query, role || undefined, verified || undefined),
        api.admin.metrics(),
      ]);
      setResp(usersRes);
      setMetrics(metricsRes);
      setPage(usersRes.page);
    } catch (e: any) {
      setError(e?.message || "Nie udało się pobrać danych.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isAdmin) load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  async function changeRole(userId: string, next: Role) {
    setBusy(true);
    setError("");
    try {
      await api.admin.setRole(userId, next);
      await load(page);
    } catch (e: any) {
      setError(e?.message || "Nie udało się zmienić roli.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleBan(userId: string, disabledAt?: string | null) {
    setBusy(true);
    setError("");
    try {
      await api.admin.softBan(userId, !disabledAt);
      await load(page);
    } catch (e: any) {
      setError(e?.message || "Nie udało się zmienić statusu konta.");
    } finally {
      setBusy(false);
    }
  }

  if (!isAdmin) return null;

  // helper do aktywnych „zakładek”
  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="admin-skin admin-page max-w-6xl mx-auto p-6">
      {/* Nagłówek + nawigacja modułów */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold">Panel administracyjny</h1>

        <nav className="flex flex-wrap gap-2 text-sm items-center">
          <Link
            to="/admin/products"
            className={`admin-btn px-3 py-1 ${isActive("/admin/products") ? "primary" : ""}`}
          >
            Produkty
          </Link>
          <Link
            to="/admin/orders"
            className={`admin-btn px-3 py-1 ${isActive("/admin/orders") ? "primary" : ""}`}
          >
            Zamówienia
          </Link>
          <Link
            to="/admin/users"
            className={`admin-btn px-3 py-1 ${
              isActive("/admin/users") || isActive("/admin") ? "primary" : ""
            }`}
          >
            Użytkownicy
          </Link>
          <Link
            to="/admin/logs"
            className={`admin-btn px-3 py-1 ${isActive("/admin/logs") ? "primary" : ""}`}
          >
            Logi
          </Link>
          <Link
            to="/admin/coupons"
            className={`admin-btn px-3 py-1 ${isActive("/admin/coupons") ? "primary" : ""}`}
          >
            Kupony
          </Link>

          {/* NOWE: Inspiracje */}
          <Link
            to="/admin/inspirations"
            className={`admin-btn px-3 py-1 ${
              isActive("/admin/inspirations") ? "primary" : ""
            }`}
            title="Sekcja inspiracji na stronie"
          >
            Inspiracje
          </Link>

          {/* NOWE: Hero */}
          <Link
            to="/admin/hero"
            className={`admin-btn px-3 py-1 ${isActive("/admin/hero") ? "primary" : ""}`}
            title="Sekcja hero strony głównej"
          >
            Hero
          </Link>

          {/* Kategorie */}
          <Link
            to="/admin/categories"
            className={`admin-btn px-3 py-1 ${isActive("/admin/categories") ? "primary" : ""}`}
            title="Zarządzaj kategoriami produktów"
          >
            Kategorie
          </Link>

          {/* Szybkie akcje po prawej */}
          <Link
            to="/admin/blog"
            className="admin-btn px-3 py-1 ml-2"
            title="Blog"
          >
            Blog
          </Link>
          {/* Usunięto: duplikat „Zarządzaj kuponami →” */}
        </nav>
      </div>

      {/* Metryki */}
      {metrics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <MetricCard label="Użytkownicy" value={metrics.totalUsers} />
          <MetricCard label="Zweryfikowani" value={metrics.verifiedUsers} />
          <MetricCard label="Admini" value={metrics.admins} />
          <MetricCard label="Zbanowani" value={metrics.banned} />
        </div>
      )}

      {/* Filtry */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Szukaj po email / imię"
          className="admin-input w-full sm:w-64"
        />
        <select
          className="admin-select"
          value={role}
          onChange={(e) => setRole(e.target.value as "" | Role)}
        >
          <option value="">Rola: wszystkie</option>
          <option value="USER">USER</option>
          <option value="ADMIN">ADMIN</option>
        </select>
        <select
          className="admin-select"
          value={verified}
          onChange={(e) => setVerified(e.target.value as "" | "true" | "false")}
        >
          <option value="">Weryfikacja: wszystkie</option>
          <option value="true">Zweryfikowani</option>
          <option value="false">Niezweryfikowani</option>
        </select>
        <button onClick={() => load(1)} className="admin-btn primary">
          Filtruj
        </button>
      </div>

      {error && <div className="mb-3 text-red-500">{error}</div>}

      {loading ? (
        <div>Ładowanie…</div>
      ) : !resp ? (
        <div>Brak danych.</div>
      ) : (
        <>
          {/* Tabela */}
          <div className="admin-table-wrap">
            <table className="admin-table text-sm">
              <thead>
                <tr>
                  <th className="text-left">Email</th>
                  <th className="text-left">Imię</th>
                  <th className="text-left">Rola</th>
                  <th className="text-left">Weryfikacja</th>
                  <th className="text-left">Ban</th>
                  <th className="text-left">Akcje</th>
                </tr>
              </thead>
              <tbody>
                {resp.items.map((u) => {
                  const banned = Boolean(u.disabledAt);
                  return (
                    <tr key={u.id}>
                      <td className="align-middle">{u.email}</td>
                      <td className="align-middle">{u.name ?? "—"}</td>
                      {/* RELATIVE -> z-index kontekst dla dropdowna */}
                      <td className="align-middle relative">
                        <select
                          className="admin-select px-2 py-1"
                          value={u.role}
                          disabled={busy}
                          onChange={(e) => changeRole(u.id, e.target.value as Role)}
                          aria-label={`Zmień rolę użytkownika ${u.email}`}
                        >
                          <option value="USER">USER</option>
                          <option value="ADMIN">ADMIN</option>
                        </select>
                      </td>
                      <td className="align-middle">{u.verifiedAt ? "tak" : "nie"}</td>
                      <td className="align-middle">
                        {banned ? (
                          <span className="admin-badge">ZBANOWANY</span>
                        ) : (
                          <span className="text-green-600 dark:text-green-400">OK</span>
                        )}
                      </td>
                      <td className="align-middle">
                        <button
                          disabled={busy}
                          onClick={() => toggleBan(u.id, u.disabledAt)}
                          className={`admin-btn px-3 py-1 ${banned ? "success" : "danger"} ${
                            busy ? "opacity-50 cursor-not-allowed" : ""
                          }`}
                          title={banned ? "Odblokuj użytkownika" : "Zbanuj użytkownika"}
                          aria-label={`${banned ? "Odblokuj" : "Zbanuj"} użytkownika ${u.email}`}
                        >
                          {banned ? "Odblokuj" : "Zbanuj"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {resp.items.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-4 text-center text-[var(--adm-muted)]">
                      Brak wyników.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Paginacja */}
          <div className="flex flex-wrap items-center gap-2 mt-4">
            <button
              disabled={page <= 1}
              onClick={() => {
                const p = page - 1;
                setPage(p);
                load(p);
              }}
              className={`admin-btn ${page <= 1 ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              ← Poprzednia
            </button>
            <div className="text-sm text-[var(--adm-muted)]">
              Strona {resp.page} / {resp.pages} (łącznie: {resp.total})
            </div>
            <button
              disabled={page >= (resp.pages || 1)}
              onClick={() => {
                const p = page + 1;
                setPage(p);
                load(p);
              }}
              className={`admin-btn ${
                page >= (resp.pages || 1) ? "opacity-50 cursor-not-allowed" : ""
              }`}
            >
              Następna →
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="admin-card p-4 rounded-xl">
      <div className="text-sm text-[var(--adm-muted)]">{label}</div>
      <div className="text-2xl font-extrabold">{value}</div>
    </div>
  );
}
