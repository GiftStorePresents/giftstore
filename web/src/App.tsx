import { useEffect, useState } from "react";
import { api } from "./api";

export default function App() {
  const [items, setItems] = useState<any[]>([]);
  const [status, setStatus] = useState("Ładuję…");

  useEffect(() => {
    api.health().then(() => setStatus("API OK ✅")).catch(() => setStatus("API ❌"));
    api.products().then((data) => setItems(data.items)).catch(console.error);
  }, []);

  return (
    <div style={{ padding: 24 }}>
      <div>{status}</div>
      <h1>Produkty</h1>
      <ul>
        {items.map((p) => (
          <li key={p.id}>
            {p.name} — {Math.min(...p.variants.map((v:any)=>v.priceCents))/100} zł
          </li>
        ))}
      </ul>
    </div>
  );
}
