// src/components/LoadMoreGrid.tsx
import React, { useState } from "react";
import ProductCard from "./ProductCard";

type Item = {
  slug: string;
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
  const [count, setCount] = useState(step);
  const visible = products.slice(0, count);
  const more = count < products.length;

  return (
    <>
      <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
        {visible.map((p) => (
          <ProductCard key={p.slug} product={p} setToast={setToast} />
        ))}
      </div>
      {more && (
        <div className="flex justify-center mt-6">
          <button
            className="bg-gold text-mainRed font-bold px-6 py-2 rounded-xl hover:bg-mainRed hover:text-gold transition"
            onClick={() => setCount((c) => c + step)}
          >
            Pokaż więcej
          </button>
        </div>
      )}
    </>
  );
}