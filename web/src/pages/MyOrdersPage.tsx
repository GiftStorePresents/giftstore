import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

type Row = { id: string; number: string; status: string; totalCents: number; createdAt: string };

export default function MyOrdersPage() {
  const [items, setItems] = useState<Row[]>([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await api.orders.my.list();
        setItems(res.items || []);
      } catch (e: any) {
        setErr(e?.message || "Nie udało się pobrać zamówień.");
      }
    })();
  }, []);

  const money = (c: number) => (c / 100).toFixed(2) + " zł";

  return (
    <div className="bg-white rounded-3xl shadow-xl p-8 max-w-3xl mx-auto mt-10 border-2 border-gold">
      <h1 className="text-2xl font-bold text-mainRed mb-4">Twoje zamówienia</h1>
      {err && <div className="mb-3 text-red-700">{err}</div>}

      {!items.length ? (
        <div>Brak zamówień.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-2 border text-left">Numer</th>
                <th className="p-2 border">Status</th>
                <th className="p-2 border">Kwota</th>
                <th className="p-2 border">Data</th>
                <th className="p-2 border">Akcje</th>
              </tr>
            </thead>
            <tbody>
              {items.map((o) => (
                <tr key={o.id}>
                  <td className="p-2 border">{o.number}</td>
                  <td className="p-2 border text-center">{o.status}</td>
                  <td className="p-2 border text-right">{money(o.totalCents)}</td>
                  <td className="p-2 border whitespace-nowrap">{new Date(o.createdAt).toLocaleString()}</td>
                  <td className="p-2 border">
                    <Link to={`/orders/${o.id}`} className="px-2 py-1 border rounded hover:bg-gray-50 inline-block">Szczegóły</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
