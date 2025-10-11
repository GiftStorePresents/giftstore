import { useEffect, useState } from "react";
import { api } from "../api";

type AdminLog = {
  id: string;
  action: string;
  entityType: "User" | "Product" | "Variant";
  entityId: string;
  before?: any | null;
  after?: any | null;
  meta?: any | null;
  createdAt: string;
  actor: { id: string; email: string };
};

export default function AdminLogsPage() {
  const [items, setItems] = useState<AdminLog[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  async function load(p = page) {
    try {
      setLoading(true);
      setErr("");
      const res = await api.admin.logs(p, 20);
      setItems(res.items as AdminLog[]);
      setPages(res.pages);
      setPage(res.page);
    } catch (e: any) {
      setErr(e?.message || "Nie udało się pobrać logów.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Logi administracyjne</h1>

      {err && <div className="text-red-600 mb-3">{err}</div>}

      {loading ? (
        <div>Ładowanie…</div>
      ) : (
        <>
          <div className="overflow-x-auto border rounded-lg">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="text-left px-3 py-2">Czas</th>
                  <th className="text-left px-3 py-2">Aktor</th>
                  <th className="text-left px-3 py-2">Akcja</th>
                  <th className="text-left px-3 py-2">Encja</th>
                  <th className="text-left px-3 py-2">Diff</th>
                </tr>
              </thead>
              <tbody>
                {items.map((log) => (
                  <tr key={log.id} className="border-t align-top">
                    <td className="px-3 py-2 whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="px-3 py-2">{log.actor?.email || "-"}</td>
                    <td className="px-3 py-2 font-mono">{log.action}</td>
                    <td className="px-3 py-2">
                      {log.entityType} <span className="text-gray-500">#{log.entityId}</span>
                    </td>
                    <td className="px-3 py-2">
                      <details>
                        <summary className="cursor-pointer underline">Pokaż</summary>
                        <div className="grid grid-cols-2 gap-3 mt-2">
                          <pre className="bg-gray-50 p-2 rounded border overflow-auto">
                            {JSON.stringify(log.before ?? null, null, 2)}
                          </pre>
                          <pre className="bg-gray-50 p-2 rounded border overflow-auto">
                            {JSON.stringify(log.after ?? null, null, 2)}
                          </pre>
                        </div>
                        {log.meta ? (
                          <div className="mt-2">
                            <div className="text-xs text-gray-500 mb-1">meta</div>
                            <pre className="bg-gray-50 p-2 rounded border overflow-auto">
                              {JSON.stringify(log.meta, null, 2)}
                            </pre>
                          </div>
                        ) : null}
                      </details>
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-gray-500">
                      Brak wpisów.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-2 mt-4">
            <button
              className="px-3 py-1 rounded border hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={page <= 1}
              onClick={() => load(page - 1)}
            >
              ← Poprzednia
            </button>
            <div className="text-sm">Strona {page} / {pages}</div>
            <button
              className="px-3 py-1 rounded border hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={page >= pages}
              onClick={() => load(page + 1)}
            >
              Następna →
            </button>
          </div>
        </>
      )}
    </div>
  );
}
