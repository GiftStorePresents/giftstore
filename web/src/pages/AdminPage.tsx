// src/pages/AdminPage.tsx
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Panel administracyjny</h1>
        <nav className="flex flex-wrap gap-3 text-sm items-center">
          <Link to="/admin/products" className="underline hover:no-underline">Produkty</Link>
          <Link to="/admin/blog" className="underline hover:no-underline">Blog</Link>
          <Link to="/admin/users" className="underline hover:no-underline">Użytkownicy</Link>
          <Link to="/admin/logs" className="underline hover:no-underline">Logi</Link>
          {/* NOWE: Kupony */}
          <Link to="/admin/coupons" className="underline hover:no-underline">Kupony</Link>

          {/* Szybkie przyciski akcji */}
          <Link
            to="/admin/blog"
            className="ml-2 px-3 py-1 rounded-lg border bg-white hover:bg-gray-50"
            title="Przejdź do zarządzania blogiem"
          >
            Zarządzaj blogiem →
          </Link>
          <Link
            to="/admin/coupons"
            className="px-3 py-1 rounded-lg border bg-white hover:bg-gray-50"
            title="Przejdź do zarządzania kuponami"
          >
            Zarządzaj kuponami →
          </Link>
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
          className="border rounded px-3 py-2 w-full sm:w-64"
        />
        <select
          className="border rounded px-2 py-2"
          value={role}
          onChange={(e) => setRole(e.target.value as "" | Role)}
        >
          <option value="">Rola: wszystkie</option>
          <option value="USER">USER</option>
          <option value="ADMIN">ADMIN</option>
        </select>
        <select
          className="border rounded px-2 py-2"
          value={verified}
          onChange={(e) => setVerified(e.target.value as "" | "true" | "false")}
        >
          <option value="">Weryfikacja: wszystkie</option>
          <option value="true">Zweryfikowani</option>
          <option value="false">Niezweryfikowani</option>
        </select>
        <button
          onClick={() => load(1)}
          className="px-4 py-2 rounded bg-black text-white hover:bg-gray-900"
        >
          Filtruj
        </button>
      </div>

      {error && <div className="mb-3 text-red-600">{error}</div>}

      {loading ? (
        <div>Ładowanie…</div>
      ) : !resp ? (
        <div>Brak danych.</div>
      ) : (
        <>
          <div className="overflow-x-auto border rounded-lg">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="text-left px-3 py-2">Email</th>
                  <th className="text-left px-3 py-2">Imię</th>
                  <th className="text-left px-3 py-2">Rola</th>
                  <th className="text-left px-3 py-2">Weryf.</th>
                  <th className="text-left px-3 py-2">Ban</th>
                  <th className="text-left px-3 py-2">Akcje</th>
                </tr>
              </thead>
              <tbody>
                {resp.items.map((u) => (
                  <tr key={u.id} className="border-t">
                    <td className="px-3 py-2">{u.email}</td>
                    <td className="px-3 py-2">{u.name ?? "—"}</td>
                    <td className="px-3 py-2">
                      <select
                        className="border rounded px-2 py-1"
                        value={u.role}
                        disabled={busy}
                        onChange={(e) => changeRole(u.id, e.target.value as Role)}
                      >
                        <option value="USER">USER</option>
                        <option value="ADMIN">ADMIN</option>
                      </select>
                    </td>
                    <td className="px-3 py-2">{u.verifiedAt ? "tak" : "nie"}</td>
                    <td className="px-3 py-2">
                      {u.disabledAt ? (
                        <span className="text-red-700 font-semibold">ZBANOWANY</span>
                      ) : (
                        <span className="text-green-700">OK</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        disabled={busy}
                        onClick={() => toggleBan(u.id, u.disabledAt)}
                        className={`px-3 py-1 rounded border ${
                          busy ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-50"
                        }`}
                      >
                        {u.disabledAt ? "Odblokuj" : "Zbanuj"}
                      </button>
                    </td>
                  </tr>
                ))}
                {resp.items.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-4 text-center text-gray-500">
                      Brak wyników.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Paginacja */}
          <div className="flex items-center gap-2 mt-4">
            <button
              disabled={page <= 1}
              onClick={() => {
                const p = page - 1;
                setPage(p);
                load(p);
              }}
              className={`px-3 py-1 rounded border ${page <= 1 ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-50"}`}
            >
              ← Poprzednia
            </button>
            <div className="text-sm">
              Strona {resp.page} / {resp.pages} (łącznie: {resp.total})
            </div>
            <button
              disabled={page >= (resp.pages || 1)}
              onClick={() => {
                const p = page + 1;
                setPage(p);
                load(p);
              }}
              className={`px-3 py-1 rounded border ${page >= (resp.pages || 1) ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-50"}`}
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
    <div className="rounded-xl border p-4 bg-white">
      <div className="text-sm text-gray-600">{label}</div>
      <div className="text-2xl font-extrabold">{value}</div>
    </div>
  );
}
