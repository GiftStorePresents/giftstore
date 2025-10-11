// src/hooks/useApiProducts.js
import { useEffect, useState } from "react";
import { API_BASE } from "../api";

/**
 * Pobiera listę produktów z backendu (publiczny endpoint).
 * Parametry: page, limit, q, category, withDeleted.
 * Zwraca { items, loading, error, pages, total }.
 */
export function useApiProducts({
  page = 1,
  limit = 20,
  q = "",
  category = "",
  withDeleted = false,
  featured = undefined,
} = {}) {
  const [items, setItems] = useState([]);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let aborted = false;
    async function run() {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("limit", String(limit));
        if (q) params.set("q", q);
        if (category) params.set("category", category);
        if (withDeleted) params.set("withDeleted", "true");
        if (typeof featured === "boolean") params.set("featured", String(featured));

        const url = `${API_BASE}/api/products?${params.toString()}`;
        const resp = await fetch(url, { credentials: "include" });
        if (!resp.ok) {
          const text = await resp.text().catch(() => "");
          throw new Error(text || `HTTP ${resp.status}`);
        }
        const data = await resp.json();

        if (!aborted) {
          setItems(Array.isArray(data.items) ? data.items : []);
          setPages(typeof data.pages === "number" ? data.pages : 1);
          setTotal(typeof data.total === "number" ? data.total : 0);
        }
      } catch (e) {
        if (!aborted) {
          setError(e?.message || "Nie udało się pobrać produktów.");
        }
      } finally {
        if (!aborted) setLoading(false);
      }
    }
    run();
    return () => { aborted = true; };
  }, [page, limit, q, category, withDeleted, featured]);

  return { items, pages, total, loading, error };
}
