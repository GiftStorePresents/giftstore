import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

/** Minimalny kształt rekordu z API */
type Row = { id: string; number: string; status: string; totalCents: number; createdAt: string };

/** Lokalny wygląd: spójny light/dark, złote obramowania, badge statusu bardziej kwadratowy */
const LocalStyles = () => (
  <style>{`
    .orders-wrap{
      --ink:#0f172a;
      --muted:#475467;
      --surface:#ffffff;
      --surface-2:#fafafa;
      --line:rgba(17,24,39,.12);
      --gold: var(--gold, #ffd700);
      --red: var(--mainRed, #d7263d);
    }
    :root[data-theme="dark"] .orders-wrap, html.dark .orders-wrap{
      --ink:#eaf1ff;
      --muted:#a9b6d4;
      --surface:#0f1424;
      --surface-2:#111a2e;
      --line:rgba(122,162,255,.28);
    }

    .title-gold{ color: var(--gold); }

    .card{
      background: var(--surface);
      color: var(--ink);
      border: 1.5px solid var(--gold);
      border-radius: 20px;
      box-shadow: 0 16px 42px rgba(0,0,0,.10);
    }
    :root[data-theme="dark"] .card, html.dark .card{
      box-shadow: 0 20px 55px rgba(0,0,0,.55);
    }

    .tbl{ width:100%; border-collapse: separate; border-spacing: 0; }
    .tbl th, .tbl td{ padding:.75rem .85rem; border-bottom:1px solid var(--line); }
    .tbl thead th{
      background: var(--surface-2);
      font-weight: 700;
      text-align:left;
      color: var(--gold); /* Złoty header tabeli */
    }
    .tbl tbody tr:hover{ background: color-mix(in oklab, var(--surface) 90%, black 10%); }

    /* Badge statusu – bardziej kwadratowy (rounded-md) */
    .st-badge{
      display:inline-flex; align-items:center; gap:.4rem;
      font-size:.75rem; font-weight:800; letter-spacing:.4px;
      padding:.35rem .55rem; border-radius:.5rem; /* square’owaty */
      border:2px solid currentColor; text-transform:uppercase;
      background: transparent;
      user-select:none;
    }
    .st--paid      { color:#16a34a; }
    .st--preparing { color: var(--gold); } /* PREPARING w złocie */
    .st--shipped   { color:#60a5fa; }
    .st--cancelled { color:#ef4444; }
    .st--pending   { color:#f59e0b; }
    .st--default   { color: var(--red); }

    .money{ font-variant-numeric: tabular-nums; }
    .muted{ color:var(--muted); }
  `}</style>
);

function StatusBadge({ status }: { status: string }) {
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
  return <span className={`st-badge ${cls}`}>{status || "STATUS"}</span>;
}

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

  const hasItems = items && items.length > 0;
  const rows = useMemo(
    () =>
      (items || []).map((o) => ({
        ...o,
        dateTxt: new Date(o.createdAt).toLocaleString(),
      })),
    [items]
  );

  return (
    <section className="orders-wrap max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <LocalStyles />
      <h1 className="title-gold text-3xl sm:text-4xl font-extrabold tracking-tight mb-2">
        Twoje zamówienia
      </h1>
      <p className="muted mb-6">
        Historia zakupów w Gift Store. Kliknij w numer, aby zobaczyć szczegóły i faktury.
      </p>

      <div className="card p-5 sm:p-6">
        {err && <div className="mb-4 text-red-500 font-medium">{err}</div>}

        {!hasItems ? (
          <div className="muted">Brak zamówień.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Numer</th>
                  <th className="text-center">Status</th>
                  <th className="text-right">Kwota</th>
                  <th>Data</th>
                  <th className="text-right">Akcje</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={o.id}>
                    <td className="whitespace-nowrap font-semibold">
                      <Link to={`/orders/${o.id}`} className="text-mainRed hover:underline">
                        {o.number}
                      </Link>
                    </td>
                    <td className="text-center">
                      <StatusBadge status={o.status} />
                    </td>
                    <td className="text-right money">{money(o.totalCents)}</td>
                    <td className="whitespace-nowrap">{o.dateTxt}</td>
                    <td className="text-right">
                      <Link
                        to={`/orders/${o.id}`}
                        className="inline-flex items-center px-3 py-1.5 rounded-lg border-2 border-gold text-mainRed font-bold hover:bg-gold/10 transition"
                      >
                        Szczegóły
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
