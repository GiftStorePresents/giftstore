// src/pages/AdminUsersPage.tsx
import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useTheme } from "../context/ThemeContext";

type UserRow = {
  id: string;
  email: string;
  name: string | null;
  role: "USER" | "ADMIN";
  verifiedAt: string | null;
  disabledAt: string | null;
  createdAt: string;
};

export default function AdminUsersPage() {
  // ------- state -------
  const [items, setItems] = useState<UserRow[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // filters
  const [q, setQ] = useState("");
  const [role, setRole] = useState<"" | "USER" | "ADMIN">("");
  const [verified, setVerified] = useState<"" | "true" | "false">("");

  // theme
  const { theme } = useTheme();

  // unique key to refetch on filter/page change
  const refetchKey = useMemo(
    () => JSON.stringify({ page, role, verified }),
    [page, role, verified]
  );

  // ------- API -------
  async function load(p = page) {
    setLoading(true);
    setErr(null);
    try {
      const verifiedParam = verified === "" ? undefined : verified;
      let res = await api.admin.users(
        p,
        20,
        q.trim(),
        role || undefined,
        verifiedParam as any
      );

      if ((!res || !res.items) && verified !== "") {
        const boolVal = verified === "true";
        res = await api.admin.users(p, 20, q.trim(), role || undefined, boolVal as any);
      }

      setItems((res?.items || []) as UserRow[]);
      setPages(res?.pages || 1);
      setPage(res?.page || p);
    } catch (e: any) {
      setErr(e?.message || "Nie udało się pobrać listy użytkowników.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refetchKey]);

  // ------- styles (light/dark + brak wewn. scrolla + naprawione strzałki) -------
  const styles = (
    <style>{`
      /* brak wewnętrznego scrolla na tej stronie */
      main#main, main#main > div, .admin-page {
        overflow: visible !important;
        max-height: none !important;
        height: auto !important;
      }

      /* Tokeny dla dark/light – sterowane przez data-theme na sekcji */
      .admin-page[data-theme="dark"] {
        --adm-surface: #0c1320;
        --adm-surface-2: #0f1524;
        --adm-fore: #e9eef7;
        --adm-ink: #e9eef7;
        --adm-muted: #9bb0c9;
        --adm-border: rgba(255,255,255,0.10);
        --adm-popover: #0b1220;
        --adm-popover-hover: #0f1a2f;
        --adm-accent: #ffd54a;
      }
      .admin-page[data-theme="light"] {
        --adm-surface: #ffffff;
        --adm-surface-2: #ffffff;
        --adm-fore: #0b1220;
        --adm-ink: #0b1220;
        --adm-muted: #6b7280;
        --adm-border: rgba(20,23,28,0.12);
        --adm-popover: #ffffff;
        --adm-popover-hover: #f2f5f9;
        --adm-accent: #ffb90a;
      }

      .admin-card { background: var(--adm-surface); border: 1px solid var(--adm-border); }
      .admin-input, .admin-select {
        background: var(--adm-surface-2);
        border: 1px solid var(--adm-border);
        color: var(--adm-ink);
        border-radius: .6rem;
        padding: .55rem .75rem;
      }
      .admin-input::placeholder { color: var(--adm-muted); }

      .admin-btn {
        background: transparent;
        border: 1px solid var(--adm-border);
        color: var(--adm-ink);
        padding: .55rem .8rem;
        border-radius: .7rem;
        transition: background .2s ease, border-color .2s ease, color .2s ease, filter .2s ease;
      }
      .admin-btn:hover { background: color-mix(in oklab, var(--adm-surface-2), #ffffff 6%); }
      .admin-btn.primary {
        background: var(--adm-accent);
        color: #6a0d0d;
        font-weight: 700;
        border-color: var(--adm-accent);
      }
      .admin-btn.primary:hover { filter: brightness(1.1); }
      .admin-btn.danger { border-color: #e70000; color: color-mix(in oklab, #000, var(--adm-fore) 25%); background: color-mix(in oklab, rgba(224,35,35,1), transparent 0%); }
      .admin-btn.danger:hover { background: color-mix(in oklab, #f00, transparent 0%); }

      .admin-table {
        width: 100%;
        border: 1px solid var(--adm-border);
        border-radius: .8rem;
        overflow: hidden;
        background: var(--adm-surface-2);
      }
      .admin-table thead { background: color-mix(in oklab, var(--adm-surface), #000 6%); color: var(--adm-fore); }
      .admin-table th, .admin-table td { border-bottom: 1px solid var(--adm-border); padding: .55rem .6rem; }
      .admin-table tbody tr:hover { background: color-mix(in oklab, var(--adm-surface-2), #fff 4%); }
      .admin-table td .admin-select { min-width: 8rem; }

      .badge {
        display: inline-block; padding: .15rem .5rem; border-radius: .5rem; font-size: .75rem; line-height: 1rem;
        border: 1px solid transparent;
      }
      .badge-blue { background: #e6f0ff; color: #1e40af; border-color: #b9d2ff; }
      .badge-red { background: #ffe6e8; color: #9f1239; border-color: #ffc2c8; }

      /* === Select: wspólne ustawienia === */
      .admin-select {
        appearance: none;
        -webkit-appearance: none;
        -moz-appearance: none;
        padding-right: 2rem; /* miejsce na strzałkę */
        background-position: right .55rem center;
        background-size: 1rem;
        background-repeat: no-repeat;
        background-clip: padding-box;
      }

      /* DARK: ustaw WSZYSTKIE background-* w jednym miejscu (żeby nic się nie "nadkładało") */
      .admin-page[data-theme="dark"] .admin-select {
        background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path fill='%23ffffff' d='M7 10l5 5 5-5z'/></svg>");
        background-repeat: no-repeat;
        background-position: right .55rem center;
        background-size: 1rem;
      }

      /* LIGHT: to samo, ale ciemna ikona */
      .admin-page[data-theme="light"] .admin-select {
        background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path fill='%230b1220' d='M7 10l5 5 5-5z'/></svg>");
        background-repeat: no-repeat;
        background-position: right .55rem center;
        background-size: 1rem;
      }

      .admin-select:focus {
        outline: 2px solid var(--adm-accent);
        outline-offset: 0;
        border-color: var(--adm-accent);
      }
      .admin-select:hover { background-color: color-mix(in oklab, var(--adm-surface-2), #fff 6%); }

      /* Lista opcji – kontrast i brak własnych teł (żeby strzałki tam nie trafiły) */
      .admin-select option,
      .admin-select optgroup {
        background-color: var(--adm-popover) !important;
        color: var(--adm-fore) !important;
        background-image: none !important;
      }
      .admin-select option:checked,
      .admin-select option:hover {
        background-color: var(--adm-popover-hover) !important;
        color: var(--adm-fore) !important;
      }

      /* Na wypadek checkboxów */
      input[type="checkbox"] { accent-color: var(--adm-accent); }
    `}</style>
  );

  return (
    <section
      className="admin-page max-w-6xl mx-auto px-4 sm:px-6 py-6"
      data-theme={theme}
    >
      {styles}

      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold" style={{ color: "var(--adm-ink)" }}>
          Użytkownicy
        </h1>
      </div>

      {/* Filters */}
      <div className="admin-card rounded-xl p-3 mb-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[220px]">
            <label className="text-xs" style={{ color: "var(--adm-muted)" }}>
              Szukaj
            </label>
            <input
              className="admin-input w-full"
              placeholder="Szukaj po email / imię…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { setPage(1); load(1); }
              }}
              autoComplete="off"
            />
          </div>

          <div>
            <label className="text-xs" style={{ color: "var(--adm-muted)" }}>
              Rola
            </label>
            <select
              className="admin-select w-full"
              value={role}
              onChange={(e) => { setRole(e.target.value as "" | "USER" | "ADMIN"); setPage(1); }}
            >
              <option value="">wszystkie</option>
              <option value="USER">USER</option>
              <option value="ADMIN">ADMIN</option>
            </select>
          </div>

          <div>
            <label className="text-xs" style={{ color: "var(--adm-muted)" }}>
              Weryfikacja
            </label>
            <select
              className="admin-select w-full"
              value={verified}
              onChange={(e) => { setVerified(e.target.value as "" | "true" | "false"); setPage(1); }}
            >
              <option value="">wszystkie</option>
              <option value="true">Zweryfikowani</option>
              <option value="false">Niezweryfikowani</option>
            </select>
          </div>

          <div className="ml-auto">
            <button
              className="admin-btn primary"
              onClick={() => { setPage(1); load(1); }}
              disabled={loading}
            >
              {loading ? "Szukam…" : "Szukaj"}
            </button>
          </div>
        </div>

        {err && <div className="mt-2 text-sm" style={{ color: "#ffb3b8" }}>{err}</div>}
      </div>

      {/* Table */}
      <div className="admin-table-wrap overflow-x-auto">
        <table className="admin-table text-[0.95rem]">
          <thead>
            <tr>
              <th className="text-left">Email</th>
              <th className="text-left">Imię</th>
              <th className="text-left">Rola</th>
              <th className="text-left">Weryfikacja</th>
              <th className="text-left">Status</th>
              <th className="text-left">Akcje</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="p-4 text-center" style={{ color: "var(--adm-muted)" }}>Ładowanie…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={6} className="p-6 text-center" style={{ color: "var(--adm-muted)" }}>Brak wyników.</td></tr>
            ) : (
              items.map((u) => {
                const isVerified = !!u.verifiedAt;
                const isBanned = !!u.disabledAt;
                return (
                  <tr key={u.id}>
                    <td className="font-mono">{u.email}</td>
                    <td>{u.name || "—"}</td>
                    <td>
                      <select
                        className="admin-select"
                        value={u.role}
                        disabled={busyId === u.id}
                        onChange={async (e) => {
                          const next = e.target.value as "USER" | "ADMIN";
                          if (!confirm(`Zmienić rolę użytkownika ${u.email} na ${next}?`)) {
                            e.currentTarget.value = u.role;
                            return;
                          }
                          setBusyId(u.id);
                          try {
                            await api.admin.setRole(u.id, next);
                            await load();
                          } catch (err: any) {
                            alert(err?.message || "Nie udało się zmienić roli.");
                            await load();
                          } finally {
                            setBusyId(null);
                          }
                        }}
                      >
                        <option value="USER">USER</option>
                        <option value="ADMIN">ADMIN</option>
                      </select>
                    </td>
                    <td>
                      {isVerified ? (
                        <span className="badge badge-blue">TAK</span>
                      ) : (
                        <span className="badge badge-red">NIE</span>
                      )}
                    </td>
                    <td>
                      {isBanned ? (
                        <span className="badge badge-red">ZBANOWANY</span>
                      ) : (
                        "OK"
                      )}
                    </td>
                    <td>
                      <button
                        className={`admin-btn ${isBanned ? "" : "danger"} px-3 py-1`}
                        disabled={busyId === u.id}
                        onClick={async () => {
                          const action = isBanned ? "odblokować" : "zbanować";
                          if (!confirm(`Czy na pewno chcesz ${action} ${u.email}?`)) return;
                          setBusyId(u.id);
                          try {
                            await api.admin.softBan(u.id, !isBanned);
                            await load();
                          } catch (err: any) {
                            alert(err?.message || "Nie udało się zmienić statusu konta.");
                            await load();
                          } finally {
                            setBusyId(null);
                          }
                        }}
                      >
                        {busyId === u.id ? "…" : isBanned ? "Odblokuj" : "Zbanuj"}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="mt-3 flex items-center gap-2">
        <button
          className="admin-btn px-3 py-1 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={page <= 1 || loading}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          ← Poprzednia
        </button>
        <span className="text-sm" style={{ color: "var(--adm-muted)" }}>
          Strona {page}/{pages}
        </span>
        <button
          className="admin-btn px-3 py-1 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={page >= pages || loading}
          onClick={() => setPage((p) => Math.min(pages, p + 1))}
        >
          Następna →
        </button>
      </div>
    </section>
  );
}