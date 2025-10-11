// src/pages/CartPage.jsx
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import Recommendations from "../components/Recommendations";

export default function CartPage() {
  const {
    cart,
    removeFromCart,
    updateQuantity,
    clearCart,

    // kupony z CartContext
    discountCode,
    setDiscountCode,
    appliedCoupon,
    applyCoupon,
    clearCoupon,

    // sumy (brutto)
    subtotal,
    discount,
  } = useCart();

  const { user } = useAuth();
  const navigate = useNavigate();
  const [showGuestOrder, setShowGuestOrder] = useState(false);

  // UI dla kuponów
  const [applying, setApplying] = useState(false);
  const [couponMsg, setCouponMsg] = useState("");
  const [couponError, setCouponError] = useState("");

  // formatowanie kwot (zł, 2 miejsca)
  const fmt = (n) =>
    (Math.round(Number(n) * 100) / 100).toLocaleString("pl-PL", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  // suma po rabacie (bez kosztów wysyłki – naliczysz w checkout)
  const totalAfterDiscount = useMemo(
    () => Math.max(0, Number(subtotal || 0) - Number(discount || 0)),
    [subtotal, discount]
  );

  // === UPSSELL: dane dla rekomendacji ===
  // Minimalny pakiet info o pozycjach (slug + cena w groszach)
  const cartItemsLite = useMemo(
    () =>
      cart.map((it) => ({
        slug: it.product?.slug ?? it.slug,
        priceCents:
          it.product?.priceCents ??
          Math.round((it.product?.price ?? it.price ?? 0) * 100),
      })),
    [cart]
  );

  // Slugi z koszyka do wykluczenia w rekomendacjach
  const excludeSlugs = useMemo(
    () => cart.map((it) => it.product?.slug ?? it.slug).filter(Boolean),
    [cart]
  );

  if (cart.length === 0)
    return (
      <div className="text-center mt-20">
        <div className="text-mainRed font-bold mb-3 text-xl">Twój koszyk jest pusty</div>
        <Link to="/" className="text-mainRed underline hover:text-gold transition text-lg">
          ← Wróć do sklepu
        </Link>
      </div>
    );

  return (
    <div className="bg-white rounded-3xl shadow-xl p-8 max-w-2xl mx-auto mt-8 border-2 border-gold">
      <h2 className="text-2xl font-bold text-mainRed mb-6 text-center">Twój koszyk</h2>

      {/* Pozycje */}
      <ul>
        {cart.map((item) => (
          <li key={item.slug} className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <img
                src={item.image}
                alt={item.name}
                className="w-16 h-16 rounded-xl object-cover shadow"
              />
              <div>
                <div className="font-bold text-mainRed">{item.name}</div>
                <div className="text-gray-600 text-sm">{fmt(item.price)} zł / szt.</div>
                <div className="flex items-center mt-2 gap-2">
                  <button
                    onClick={() => updateQuantity(item.slug, item.quantity - 1)}
                    disabled={item.quantity <= 1}
                    className="px-2 font-bold rounded bg-graySoft hover:bg-mainRed hover:text-white disabled:bg-gray-200"
                  >
                    -
                  </button>
                  <span className="font-bold">{item.quantity}</span>
                  <button
                    onClick={() => updateQuantity(item.slug, item.quantity + 1)}
                    className="px-2 font-bold rounded bg-graySoft hover:bg-mainRed hover:text-white"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            <div className="text-gold font-extrabold">
              {fmt(Number(item.price) * Number(item.quantity))} zł
            </div>

            <button
              onClick={() => removeFromCart(item.slug)}
              className="text-mainRed font-bold px-3 hover:text-gold transition"
              aria-label="Usuń z koszyka"
            >
              Usuń
            </button>
          </li>
        ))}
      </ul>

      {/* Kupon */}
      <div className="mt-6">
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            inputMode="text"
            autoCapitalize="characters"
            placeholder="Kod rabatowy (np. GIFT10 / FREESHIP)"
            value={discountCode}
            onChange={(e) => setDiscountCode(e.target.value.toUpperCase())}
            className="flex-1 rounded-xl border-2 border-gold/70 px-4 py-2 outline-none focus:border-mainRed"
            aria-label="Kod rabatowy"
          />
          <button
            type="button"
            disabled={applying}
            onClick={async () => {
              setCouponMsg("");
              setCouponError("");
              const code = (discountCode || "").trim();
              if (!code) {
                setCouponError("Wpisz kod kuponu");
                return;
              }
              try {
                setApplying(true);
                await applyCoupon(code, user?.id);
                setCouponMsg("Kod zastosowany ✅");
              } catch (e) {
                setCouponError(String(e?.message || e || "Nie udało się zastosować kodu"));
              } finally {
                setApplying(false);
              }
            }}
            className="bg-mainRed text-white px-6 py-2 rounded-xl hover:bg-gold hover:text-mainRed font-bold transition disabled:opacity-60"
          >
            {applying ? "…" : "Zastosuj"}
          </button>

          {appliedCoupon && (
            <button
              type="button"
              onClick={() => {
                clearCoupon();
                setCouponMsg("");
                setCouponError("");
              }}
              className="px-4 py-2 rounded-xl border-2 border-gray-200 hover:bg-gray-50 font-semibold"
              aria-label="Usuń kupon"
            >
              Usuń kupon
            </button>
          )}
        </div>

        {couponError && <p className="mt-2 text-sm text-red-600">{couponError}</p>}
        {couponMsg && !couponError && (
          <p className="mt-2 text-sm text-green-700">{couponMsg}</p>
        )}
        {appliedCoupon && !couponError && (
          <p className="mt-2 text-xs text-emerald-700">
            Aktywny kupon: <strong>{appliedCoupon}</strong>
          </p>
        )}
      </div>

      {/* Podsumowanie */}
      <div className="mt-8 border-t pt-4">
        <div className="flex justify-between text-mainRed font-bold">
          <span>Produkty</span>
          <span>{fmt(subtotal)} zł</span>
        </div>

        {Number(discount) > 0 && (
          <div className="flex justify-between mt-2 text-emerald-700 font-semibold">
            <span>Rabat{appliedCoupon ? ` (${appliedCoupon})` : ""}</span>
            <span>-{fmt(discount)} zł</span>
          </div>
        )}

        <div className="flex justify-between mt-3 text-xl font-extrabold">
          <span className="text-mainRed">Do zapłaty (bez dostawy)</span>
          <span className="text-gold">{fmt(totalAfterDiscount)} zł</span>
        </div>
        <div className="text-xs text-gray-500 mt-1">
          Ostateczny koszt dostawy naliczymy w kroku „Zamówienie”.
        </div>
      </div>

      {/* Upsell – droższe, ale sensownie bliskie cenowo propozycje */}
      <div className="mt-10">
        <Recommendations
          title="Jeszcze lepsze propozycje"
          mode="upsell"
          cartItems={cartItemsLite}
          exclude={excludeSlugs}
          count={4}  // zmień na 8, jeśli chcesz większą siatkę
        />
      </div>

      {/* Akcje */}
      <div className="flex gap-4 mt-6 justify-end">
        <button
          onClick={clearCart}
          className="bg-mainRed text-white px-6 py-2 rounded-xl hover:bg-gold hover:text-mainRed font-bold transition"
        >
          Wyczyść koszyk
        </button>

        {user ? (
          <button
            className="bg-gold text-mainRed px-6 py-2 rounded-xl font-bold hover:bg-mainRed hover:text-gold transition"
            onClick={() => navigate("/checkout")}
          >
            Przejdź do zamówienia
          </button>
        ) : (
          showGuestOrder && (
            <button
              className="bg-gold text-mainRed px-6 py-2 rounded-xl font-bold hover:bg-mainRed hover:text-gold transition"
              onClick={() => navigate("/checkout")}
            >
              Zamów jako gość
            </button>
          )
        )}
      </div>

      {!user && !showGuestOrder && (
        <div className="mt-8 text-center flex flex-col gap-2">
          <div className="flex flex-row gap-4 justify-center">
            <Link
              to="/login"
              className="px-8 py-2 rounded-xl bg-mainRed text-white font-bold hover:bg-gold hover:text-mainRed transition"
            >
              Zaloguj się
            </Link>
            <button
              className="px-8 py-2 rounded-xl bg-gold text-mainRed font-bold hover:bg-mainRed hover:text-gold transition"
              onClick={() => setShowGuestOrder(true)}
            >
              Zamów jako gość
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
