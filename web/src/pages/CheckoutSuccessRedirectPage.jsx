import { useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useCart } from "../context/CartContext";

function useQS() {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}

export default function CheckoutSuccessRedirect() {
  const qs = useQS();
  const navigate = useNavigate();
  const { clearCart } = useCart();

  useEffect(() => {
    const order = qs.get("order") || qs.get("orderId") || "";
    // dla bezpieczeństwa wyczyść koszyk również tutaj
    try { clearCart(); } catch {}

    // przekierowanie na właściwą stronę „Dziękujemy”
    navigate(`/thank-you?orderId=${encodeURIComponent(order)}`, { replace: true });
  }, [qs, navigate, clearCart]);

  return null; // lub spinner
}
