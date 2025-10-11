// src/lib/totals.ts
export const FREE_SHIPPING_THRESHOLD_CENTS = 19900;

type ItemForTotals = {
  qty: number;
  Variant: { priceCents: number };
};

export function calcTotals(items: ItemForTotals[]) {
  const subtotalCents = items.reduce(
    (sum, it) => sum + it.qty * it.Variant.priceCents,
    0
  );
  const freeShipping = subtotalCents >= FREE_SHIPPING_THRESHOLD_CENTS;
  return { subtotalCents, freeShipping };
}
