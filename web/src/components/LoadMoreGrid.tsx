// src/components/LoadMoreGrid.tsx
import React, { useState, useMemo } from "react";
import ProductCard from "./ProductCard";

type Item = {
  slug: string;
  name: string;
  id?: string | number;
  rating?: number | string | null;
  reviewCount?: number;
  reviewsCount?: number;
  [k: string]: any;
};

export default function LoadMoreGrid({
  products,
  step = 12,
  setToast,
}: {
  products: Item[];
  step?: number;
  setToast?: (msg: string) => void;
}) {
  const safeStep = Number.isFinite(step) && step > 0 ? step : 12;
  const [count, setCount] = useState(safeStep);

  const total = Array.isArray(products) ? products.length : 0;

  // 🔧 mini-normalizacja: rating → [0..5] (fallback 5), aliasy opinii
  const normalized = useMemo(() => {
    const arr = Array.isArray(products) ? products : [];
    return arr.map((p) => {
      const r = Number(p.rating);
      const rating =
        !Number.isFinite(r) || r <= 0 ? 5 : Math.min(5, r);

      const reviews =
        Number(p.reviewCount ?? p.reviewsCount ?? 0) || 0;

      return {
        ...p,
        rating,
        reviewCount: reviews,
        reviewsCount: reviews,
      };
    });
  }, [products]);

  const visible = normalized.slice(0, count);
  const more = count < total;

  return (
    <>
      <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
        {visible.map((p) => (
          <ProductCard key={(p.id ?? p.slug) as React.Key} product={p} setToast={setToast} />
        ))}
      </div>

      {more && (
        <div className="flex justify-center mt-6">
          <button
            className="bg-gold text-mainRed font-bold px-6 py-2 rounded-xl hover:bg-mainRed hover:text-gold transition"
            onClick={() => setCount((c) => Math.min(c + safeStep, total))}
          >
            Pokaż więcej
          </button>
        </div>
      )}
    </>
  );
}
