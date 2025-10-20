// src/components/MiniCartDrawer.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { X } from "lucide-react";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";

// ===== Bezpieczne źródło obrazka (pełny URL + fallback) =====
const SITE_ORIGIN =
  (typeof window !== "undefined" && window.location.origin) || "http://localhost:3000";
const BASE_URL =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_SITE_URL) ||
  (typeof process !== "undefined" && (process.env.REACT_APP_SITE_URL || process.env.PUBLIC_URL)) ||
  SITE_ORIGIN;

function resolveImg(src) {
  if (!src) return "/placeholder.png";
  if (/^(https?:)?\/\//i.test(src) || src.startsWith("data:")) return src;
  const base = String(BASE_URL || "").replace(/\/+$/, "");
  const path = src.startsWith("/") ? src : `/${src}`;
  return `${base}${path}`;
}
// ===========================================================

function formatEta(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("pl-PL", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
}

export default function MiniCartDrawer({ open, onClose, setToast }) {
  const {
    cart,
    updateQuantity,
    removeFromCart,
    clearCart,
    drawerOpen,
    closeDrawer,
    discountCode,
    setDiscountCode,
    subtotal,
    discount,
    shipping,
    SHIPPING_BASE,
    FREE_SHIPPING_FROM,
    hasFreeShipping,

    // ⬇ nowe z CartContext
    applyCoupon,
    appliedCoupon,
    clearCoupon,
  } = useCart();

  const { user } = useAuth();
  const [applying, setApplying] = useState(false);

  const isOpen = typeof open === "boolean" ? open : !!drawerOpen;

  // 🛠️ Poprawione handleClose — zawsze jest funkcją
  const handleClose = useMemo(() => {
    if (typeof onClose === "function") return onClose;
    if (typeof closeDrawer === "function") return closeDrawer;
    return () => {};
  }, [onClose, closeDrawer]);

  const drawerRef = useRef(null);
  const closeBtnRef = useRef(null);

  const shippingMethods = [
    { id: "kurier", label: "Kurier (1–2 dni)", etaDays: 2, priceOverride: null },
    { id: "paczkomat", label: "Paczkomat (2–3 dni)", etaDays: 3, priceOverride: 12 },
    { id: "odbior", label: "Odbiór osobisty (1–2 dni)", etaDays: 2, priceOverride: 0 },
  ];
  const [selectedShipping, setSelectedShipping] = useState(shippingMethods[0].id);

  const paymentMethods = [
    { id: "blik", label: "BLIK" },
    { id: "card", label: "Karta płatnicza" },
    { id: "transfer", label: "Przelew online" },
    { id: "cod", label: "Za pobraniem" },
  ];
  const [selectedPayment, setSelectedPayment] = useState(paymentMethods[0].id);

  // ESC + blokada scrolla + focus trap
  useEffect(() => {
    const onKeyDown = (e) => {
      if (!isOpen) return;
      if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
      }
      if (e.key === "Tab" && drawerRef.current) {
        const focusables = drawerRef.current.querySelectorAll(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const isShift = e.shiftKey;

        if (isShift && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!isShift && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", onKeyDown);
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      setTimeout(() => closeBtnRef.current?.focus(), 0);
      return () => {
        document.removeEventListener("keydown", onKeyDown);
        document.body.style.overflow = prevOverflow;
      };
    }
  }, [isOpen, handleClose]);

  const afterDiscount = Math.max(0, subtotal - discount);
  const selectedShippingDef =
    shippingMethods.find((m) => m.id === selectedShipping) || shippingMethods[0];
  const shippingLocal = hasFreeShipping(afterDiscount)
    ? 0
    : (selectedShippingDef.priceOverride ?? shipping);

  const totalLocal = afterDiscount + shippingLocal;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/40 transition-opacity duration-300 ${
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={handleClose}
        aria-hidden={!isOpen}
      />

      {/* Drawer */}
      <aside
        ref={drawerRef}
        className={`fixed right-0 top-0 h-full w-[92vw] sm:w-[440px] bg-white shadow-2xl border-l-2 border-gold z-[60]
        transition-transform duration-300 ${isOpen ? "translate-x-0" : "translate-x-full"} text-gray-800`}
        aria-hidden={!isOpen}
        aria-label="Mini koszyk"
        role="dialog"
        aria-modal="true"
      >
        <div className="p-4 border-b">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-extrabold text-mainRed">Twój koszyk</h3>
            <button
              ref={closeBtnRef}
              onClick={handleClose}
              className="p-2 rounded hover:bg-gray-100 text-mainRed"
              aria-label="Zamknij koszyk"
            >
              <X />
            </button>
          </div>
        </div>

        {cart.length === 0 ? (
          <div className="p-6 text-center">
            <div className="text-mainRed font-bold mb-2">Koszyk jest pusty</div>
            <button className="underline text-gold font-bold" onClick={handleClose}>
              Wróć do sklepu
            </button>
          </div>
        ) : (
          <>
            {/* Items */}
            <div className="p-4 space-y-4 overflow-y-auto max-h-[40vh]">
              {cart.map((item) => (
                <div key={item.slug} className="flex gap-3 items-center">
                  <img
                    src={resolveImg(item.image)}
                    alt={item.name}
                    className="w-16 h-16 rounded-lg object-cover"
                    loading="lazy"
                    onError={(e) => {
                      e.currentTarget.src = "/placeholder.png";
                    }}
                  />
                  <div className="flex-1">
                    <div className="font-bold text-mainRed">{item.name}</div>
                    <div className="text-sm text-gray-600">{item.price} zł / szt.</div>

                    {/* Ilość – jasne, z obrysem (widoczne w dark mode) */}
                    <div className="flex items-center gap-2 mt-1">
                      <button
                        onClick={() => updateQuantity(item.slug, item.quantity - 1)}
                        disabled={item.quantity <= 1}
                        className="w-8 h-8 grid place-items-center rounded-lg bg-white text-gray-900 border border-gray-300 hover:bg-mainRed hover:text-white disabled:opacity-50"
                        aria-label="Zmniejsz ilość"
                      >
                        −
                      </button>

                      <span className="w-8 h-8 grid place-items-center font-bold rounded-lg bg-white text-gray-900 border border-gray-300 select-none">
                        {item.quantity}
                      </span>

                      <button
                        onClick={() => updateQuantity(item.slug, item.quantity + 1)}
                        className="w-8 h-8 grid place-items-center rounded-lg bg-white text-gray-900 border border-gray-300 hover:bg-mainRed hover:text-white"
                        aria-label="Zwiększ ilość"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="font-extrabold text-gold">
                      {item.price * item.quantity} zł
                    </div>
                    <button
                      className="text-xs text-mainRed underline mt-1"
                      onClick={() => removeFromCart(item.slug)}
                    >
                      Usuń
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Kupon + Free shipping */}
            <div className="px-4 pt-3 border-t">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={discountCode}
                  onChange={(e) => setDiscountCode(e.target.value)}
                  placeholder="Kod rabatowy"
                  className="flex-1 border rounded-lg px-3 py-2 bg-white text-gray-800 placeholder-gray-400"
                />
                <button
                  disabled={applying}
                  className="px-3 py-2 rounded-lg bg-gold text-mainRed font-bold hover:bg-mainRed hover:text-gold transition disabled:opacity-60"
                  onClick={async () => {
                    try {
                      setApplying(true);
                      await applyCoupon(discountCode, user?.id);
                      setToast && setToast("Kod zastosowany ✅");
                    } catch (e) {
                      setToast && setToast(String(e?.message || e || "Nie udało się"));
                    } finally {
                      setApplying(false);
                    }
                  }}
                >
                  {applying ? "…" : "Zastosuj"}
                </button>
              </div>

              {(appliedCoupon || discount > 0) && (
                <div className="mt-2 flex items-center gap-2">
                  {appliedCoupon && (
                    <span className="inline-flex items-center gap-2 text-xs font-semibold bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full border border-emerald-200">
                      Kupon: {appliedCoupon}
                      {clearCoupon && (
                        <button
                          className="ml-1 underline hover:no-underline"
                          onClick={() => clearCoupon()}
                          title="Usuń kupon"
                        >
                          usuń
                        </button>
                      )}
                    </span>
                  )}
                  {discount > 0 && (
                    <span className="text-sm text-green-700">Rabat: −{discount} zł</span>
                  )}
                </div>
              )}

              {hasFreeShipping(afterDiscount) ? (
                <div className="text-sm text-green-700 mt-2">Darmowa wysyłka ✓</div>
              ) : (
                <>
                  <div className="text-sm text-gray-600 mt-2">
                    Wysyłka: {SHIPPING_BASE} zł (gratis od {FREE_SHIPPING_FROM} zł)
                  </div>
                  <div className="mt-3">
                    <div className="text-xs text-gray-600 mb-1">
                      Brakuje{" "}
                      <span className="font-bold">
                        {Math.max(0, FREE_SHIPPING_FROM - afterDiscount)} zł
                      </span>{" "}
                      do darmowej wysyłki
                    </div>
                    <div className="h-2 bg-gray-200 rounded">
                      <div
                        className="h-2 bg-gold rounded transition-all"
                        style={{
                          width: `${Math.min(
                            100,
                            (afterDiscount / FREE_SHIPPING_FROM) * 100
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Dostawa + Płatność */}
            <div className="px-4 py-6 border-t mt-3 space-y-4">
              <div>
                <div className="text-sm font-bold text-mainRed mb-2">Dostawa</div>
                <div className="space-y-2">
                  {shippingMethods.map((m) => (
                    <label key={m.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="shipping"
                        value={m.id}
                        checked={selectedShipping === m.id}
                        onChange={() => setSelectedShipping(m.id)}
                      />
                      <span className="text-sm">
                        {m.label}{" "}
                        <span className="text-gray-500">
                          (dostawa ok. {formatEta(m.etaDays)})
                        </span>
                      </span>
                      <span className="ml-auto text-sm font-bold text-mainRed">
                        {hasFreeShipping(afterDiscount)
                          ? "0 zł"
                          : (m.priceOverride ?? shipping) === 0
                          ? "0 zł"
                          : `${m.priceOverride ?? shipping} zł`}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-sm font-bold text-mainRed mb-2">Płatność</div>
                <div className="grid grid-cols-2 gap-2">
                  {paymentMethods.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedPayment(p.id)}
                      className={`px-3 py-2 rounded-xl border text-sm ${
                        selectedPayment === p.id
                          ? "border-gold bg-gold/20 text-mainRed font-bold"
                          : "border-gray-200 hover:border-gold"
                      }`}
                      aria-pressed={selectedPayment === p.id}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Podsumowanie */}
            <div className="p-4 border-t bg-white sticky bottom-0">
              <div className="flex justify-between text-sm text-gray-700">
                <span>Produkty</span>
                <span>{subtotal} zł</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-sm text-green-700">
                  <span>Rabat</span>
                  <span>−{discount} zł</span>
                </div>
              )}
              <div className="flex justify-between text-sm text-gray-700">
                <span>Wysyłka</span>
                <span>{shippingLocal} zł</span>
              </div>
              <div className="flex justify-between mt-2 text-lg font-extrabold text-mainRed">
                <span>Suma</span>
                <span>{totalLocal} zł</span>
              </div>

              {/* Przyciski akcji */}
              <div className="flex gap-2 mt-4">
                <button
                  className="btn-clear flex-1 bg-white border-2 border-gold text-mainRed font-bold px-4 py-2 rounded-xl hover:bg-gold/20 transition"
                  onClick={() => clearCart()}
                >
                  Wyczyść
                </button>

                <Link
                  to="/cart"
                  onClick={handleClose}
                  className="flex-1 flex items-center justify-center bg-white border-2 border-gray-200 text-mainRed font-bold px-4 py-2 rounded-xl hover:bg-gray-100 transition"
                >
                  Przejdź do koszyka
                </Link>

                {/* Do kasy – czerwony tekst, perfekcyjnie wycentrowany */}
                <Link
                  to={{ pathname: "/checkout" }}
                  state={{ shippingMethod: selectedShippingDef.id, paymentMethod: selectedPayment }}
                  onClick={handleClose}
                  className="flex-1 flex items-center justify-center bg-gold font-bold px-4 py-2 rounded-xl hover:bg-mainRed hover:text-gold transition checkout-btn"
                  aria-label="Przejdź do kasy"
                >
                  Do kasy
                </Link>
              </div>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
