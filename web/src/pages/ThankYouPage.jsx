// src/pages/ThankYouPage.jsx
import { useEffect, useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { useCart } from "../context/CartContext";
import { gaEvent } from "../utils/ga";

function useQS() {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}

export default function ThankYouPage() {
  const qs = useQS();
  const orderId = qs.get("orderId") || qs.get("order") || "";
  const { clearCart } = useCart();

  useEffect(() => {
    const sentKey = `ga.purchase.sent.${orderId}`;
    if (!orderId || sessionStorage.getItem(sentKey)) return;

    const items = JSON.parse(sessionStorage.getItem("lastPurchaseItems") || "[]");
    const value = Number(sessionStorage.getItem("lastPurchaseValue") || "0");
    const shipping = Number(sessionStorage.getItem("lastPurchaseShipping") || "0");

    if (Array.isArray(items) && items.length) {
      gaEvent("purchase", {
        transaction_id: orderId,
        value,
        currency: "PLN",
        shipping,
        items,
      });
      sessionStorage.setItem(sentKey, "1");
    }

    // porządek
    sessionStorage.removeItem("lastPurchaseItems");
    sessionStorage.removeItem("lastPurchaseValue");
    sessionStorage.removeItem("lastPurchaseShipping");
    // koszyk i tak powinien być pusty – wyczyśćmy defensywnie:
    try { clearCart(); } catch {}
  }, [orderId, clearCart]);

  return (
    <section className="max-w-3xl mx-auto px-4 py-10 min-h-[50vh]">
      <div className="text-center">
        <div className="text-2xl font-bold text-emerald-700">✅ Zamówienie złożone! Sprawdź e-mail 📦</div>
        {orderId && (
          <div className="mt-3 text-gray-800">
            Numer zamówienia: <span className="font-semibold">{orderId}</span>
          </div>
        )}
        <Link to="/" className="inline-block mt-6 underline text-mainRed hover:text-gold">
          ← Wróć do sklepu
        </Link>
      </div>
    </section>
  );
}
