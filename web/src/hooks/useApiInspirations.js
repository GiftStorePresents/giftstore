// src/hooks/useApiInspirations.js
import { useEffect, useState } from "react";
import { API_BASE } from "../api";
import { mapApiProductToCard } from "../utils/productMapper";

/**
 * Lista inspiracji (do sekcji na stronie głównej, Hero itp.)
 * GET /api/public/inspirations
 */
export function useApiInspirations(limit = 8) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let aborted = false;
    async function run() {
      setLoading(true);
      setError("");
      try {
        const url = `${API_BASE}/api/public/inspirations?limit=${limit}`;
        const resp = await fetch(url, {
          credentials: "include",
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        if (!aborted) {
          setItems(Array.isArray(data.items) ? data.items : []);
        }
      } catch (e) {
        if (!aborted) setError(e?.message || "Błąd pobierania inspiracji.");
      } finally {
        if (!aborted) setLoading(false);
      }
    }
    run();
    return () => {
      aborted = true;
    };
  }, [limit]);

  return { items, loading, error };
}

/**
 * Produkty przypięte do inspiracji
 * GET /api/public/inspirations/:slug/products
 *
 * Zasada:
 * - próbujemy mapApiProductToCard,
 * - używamy jego wyniku tylko, gdy MA sensowną cenę,
 * - zawsze dopinamy aliasy reviewCount/reviewsCount,
 * - zawsze normalizujemy rating (0–5; domyślnie 5 jeśli brak).
 */
export function useApiInspirationProducts(slug, { take = 48, q = "" } = {}) {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!slug) return;
    let aborted = false;

    async function run() {
      setLoading(true);
      setError("");
      try {
        const u = new URL(`${API_BASE}/api/public/inspirations/${slug}/products`);
        u.searchParams.set("take", String(take));
        if (q) u.searchParams.set("q", q);

        const resp = await fetch(u.toString(), {
          credentials: "include",
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

        const data = await resp.json();
        if (aborted) return;

        const raw = Array.isArray(data.items) ? data.items : [];

        const mapped = raw.map((p) => {
          // 1) spróbuj wspólnego mappera
          let m;
          try { m = mapApiProductToCard(p); } catch { m = undefined; }

          // 2) czy mapper zwrócił sensowną cenę?
          const hasMeaningfulPrice =
            (typeof m?.price === "number" && Number.isFinite(m.price)) ||
            (typeof m?.priceCents === "number" && Number.isFinite(m.priceCents)) ||
            (typeof m?.oldPrice === "number" && Number.isFinite(m.oldPrice)) ||
            (typeof m?.oldPriceCents === "number" && Number.isFinite(m.oldPriceCents));

          // 3) baza do dalszej normalizacji
          const base = hasMeaningfulPrice ? m : (p || {});

          // 4) aliasy opinii
          const reviews =
            Number(
              base.reviewCount ??
              base.reviewsCount ??
              p?.reviewCount ??
              p?.reviewsCount ??
              0
            ) || 0;

          // 5) NORMALIZACJA RATINGU (domyślnie 5)
          const rRaw = base?.rating ?? base?.ratingAvg ?? p?.rating ?? p?.ratingAvg;
          const rNum = Number(rRaw);
          const rating = Number.isFinite(rNum) ? Math.max(0, Math.min(5, rNum)) : 5;

          return {
            ...base,
            rating,
            reviewCount: reviews,
            reviewsCount: reviews,
          };
        });

        setItems(mapped);
        setTotal(Number(data.total || mapped.length));
      } catch (e) {
        if (!aborted) setError(e?.message || "Błąd pobierania produktów inspiracji.");
      } finally {
        if (!aborted) setLoading(false);
      }
    }

    run();
    return () => {
      aborted = true;
    };
  }, [slug, take, q]);

  return { items, total, loading, error };
}
