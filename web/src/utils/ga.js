// src/utils/ga.js
export function gaEvent(event, params = {}) {
  try {
    if (typeof window !== "undefined" && window.gtag) {
      window.gtag("event", event, params);
    }
  } catch {}
}

export function mapProductsToGAItems(products = []) {
  return products
    .filter(Boolean)
    .map((p) => ({
      item_id: p.slug || p.id || "",
      item_name: p.name || "",
      price: Number(p.price ?? p.pricePLN ?? 0),
      item_category: p.category || "",
      item_brand: p.brand || "",
    }));
}

export function mapCartToGAItems(cart = []) {
  return cart
    .filter(Boolean)
    .map((it) => {
      const p = it.product || it;
      return {
        item_id: p.slug || p.id || "",
        item_name: p.name || "",
        price: Number(p.price ?? p.pricePLN ?? 0),
        quantity: Number(it.quantity || 1),
        item_category: p.category || "",
        item_brand: p.brand || "",
      };
    });
}
