// src/hooks/useApiProduct.js
import { useEffect, useState } from "react";
import { API_BASE } from "../api";

/** Normalizacja do porównań slugów */
function normSlug(s = "") {
  return String(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

/**
 * Pobiera pojedynczy produkt po slug’u.
 * Kolejność:
 *   1) GET /api/products?slug={slug}  → wybiera TYLKO idealne trafienie po slugu
 *   2) fallback: GET /api/products/{slug}
 */
export function useApiProduct(slug) {
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(!!slug);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!slug) {
      setProduct(null);
      setLoading(false);
      setError("");
      return;
    }

    const ac = new AbortController();
    const wanted = normSlug(slug);

    const fetchJson = async (url) => {
      try {
        const res = await fetch(url, {
          credentials: "include",
          signal: ac.signal,
        });
        if (!res.ok) return { ok: false, status: res.status, data: null };
        const data = await res.json().catch(() => null);
        return { ok: true, status: res.status, data };
      } catch {
        if (ac.signal.aborted) return { ok: false, status: 0, data: null };
        return { ok: false, status: 0, data: null };
      }
    };

    const run = async () => {
      setLoading(true);
      setError("");

      // 1) /api/products?slug=...
      const url1 = `${API_BASE}/api/products?slug=${encodeURIComponent(slug)}`;
      const r1 = await fetchJson(url1);

      if (r1.ok && r1.data && !ac.signal.aborted) {
        const items = Array.isArray(r1.data.items) ? r1.data.items : [];
        if (items.length > 1) {
          console.warn(
            "[useApiProduct] /api/products?slug=… zwróciło wiele pozycji:",
            items.map((x) => x?.slug)
          );
        }

        // Szukaj TYLKO dokładnego trafienia (po normalizacji)
        const hit = items.find((x) => normSlug(x?.slug) === wanted);

        if (hit) {
          setProduct(hit);
          setLoading(false);
          return;
        }
      }

      // 2) fallback: /api/products/:slug
      const url2 = `${API_BASE}/api/products/${encodeURIComponent(slug)}`;
      const r2 = await fetchJson(url2);
      if (r2.ok && r2.data && !ac.signal.aborted) {
        const p = r2.data.product ?? r2.data;
        if (p) {
          setProduct(p);
          setLoading(false);
          return;
        }
      }

      if (!ac.signal.aborted) {
        setProduct(null);
        setError("Nie znaleziono produktu.");
        setLoading(false);
      }
    };

    run();
    return () => ac.abort();
  }, [slug]);

  return { product, loading, error };
}
