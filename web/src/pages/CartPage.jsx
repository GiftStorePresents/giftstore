// src/pages/CartPage.jsx
import { useMemo, useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import Recommendations from "../components/Recommendations";
import { SHIPPING_BASE, FREE_SHIPPING_FROM } from "../context/CartContext";

/* ---------------- helpers ---------------- */
const fmt = (n) =>
  (Math.round(Number(n) * 100) / 100).toLocaleString("pl-PL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/* --- obrazki: preferuj /og-image.jpg, potem wbudowany SVG --- */
const SITE_ORIGIN =
  (typeof window !== "undefined" && window.location.origin) || "http://localhost:3000";
const BASE_URL =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_SITE_URL) ||
  (typeof process !== "undefined" &&
    (process.env.REACT_APP_SITE_URL || process.env.PUBLIC_URL)) ||
  SITE_ORIGIN;

function resolveImg(src) {
  if (!src) return "/og-image.jpg"; // domyślny fallback z public/
  if (/^(https?:)?\/\//i.test(src) || src.startsWith("data:")) return src;
  const base = String(BASE_URL || "").replace(/\/+$/, "");
  const path = src.startsWith("/") ? src : `/${src}`;
  return `${base}${path}`;
}

const FALLBACK_SRC = resolveImg("/og-image.jpg");
const FALLBACK_IMG =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="112" height="112" viewBox="0 0 112 112"><rect width="112" height="112" rx="12" fill="%23f1f5f9"/><path d="M20 74l16-16 12 12 20-20 24 24v12H20z" fill="%23cbd5e1"/><circle cx="38" cy="38" r="10" fill="%23e2e8f0"/></svg>';

/** Dostępne opcje dostawy – spójne z CheckoutPage */
const SHIPPING_OPTIONS = {
  courier: [
    ["dpd", "DPD (ok. 1–3 dni)"],
    ["dhl", "DHL (ok. 1–3 dni)"],
    ["ups", "UPS (ok. 1–3 dni)"],
    ["fedex", "FedEx (ok. 1–3 dni)"],
    ["gls", "GLS (ok. 1–3 dni)"],
    ["inpost_kurier", "InPost Kurier (ok. 1–3 dni)"],
    ["pocztex", "Pocztex (ok. 1–3 dni)"],
  ],
  locker: [
    ["inpost", "Paczkomat InPost (1–3 dni)"],
    ["dhl_box", "DHL Box (automat) (1–3 dni)"],
    ["pocztex_automat", "Pocztex Automat (1–3 dni)"],
  ],
  point: [
    ["orlen", "ORLEN Paczka (1–3 dni)"],
    ["dpd_pickup", "DPD Pickup (1–3 dni)"],
    ["pocztex_punkt", "Pocztex Punkt (1–3 dni)"],
  ],
};

function pickBtn(selected) {
  const base =
    "rounded-xl px-4 py-2 font-bold border transition select-none focus:outline-none";
  const on =
    "border-gold/70 ring-2 ring-gold/30 bg-mainRed/5 text-mainRed dark:text-gold dark:bg-white/5";
  const off =
    "border-black/10 dark:border-white/10 text-slate-700 dark:text-white hover:bg-black/5 dark:hover:bg-white/10";
  return `${base} ${selected ? on : off}`;
}

/* mały helper do wiadomości o synchronizacji */
function buildStockMsg(res) {
  if (!res) return "";
  const parts = [];
  if (Array.isArray(res.removed) && res.removed.length) {
    parts.push(`Usunięto z koszyka: ${res.removed.join(", ")}`);
  }
  if (Array.isArray(res.adjusted) && res.adjusted.length) {
    const list = res.adjusted.map((a) => `${a.slug}: ${a.from}→${a.to}`).join(", ");
    parts.push(`Dostosowano ilości (${list})`);
  }
  return parts.join(" • ") || "Zaktualizowano koszyk wg dostępności";
}

/* =============================== */
export default function CartPage() {
  const {
    cart,
    removeFromCart,
    updateQuantity,
    clearCart,

    // kupony
    discountCode,
    setDiscountCode,
    appliedCoupon,
    applyCoupon,
    clearCoupon,

    // sumy
    subtotal,
    discount,

    // preferencje (z CartContext – muszą istnieć)
    prefShippingMethod,
    setPrefShippingMethod,
    prefShippingCarrier,
    setPrefShippingCarrier,
    prefPaymentMethod,
    setPrefPaymentMethod,

    // NEW: helper do weryfikacji stanów koszyka
    syncCartWithStock,
  } = useCart();

  const { user } = useAuth();
  const navigate = useNavigate();

  const [showGuestOrder, setShowGuestOrder] = useState(false);
  const [applying, setApplying] = useState(false);
  const [couponMsg, setCouponMsg] = useState("");
  const [couponError, setCouponError] = useState("");

  // NEW: komunikat po sync + flaga blokady przy przejściu do kasy
  const [stockMsg, setStockMsg] = useState("");
  const [syncing, setSyncing] = useState(false);

  const [pickupCode, setPickupCode] = useState(""); // kod punktu/automatu (opcjonalny preview)

  // NEW: flaga aktywności strony koszyka (na wszelki wypadek, jeśli masz routing-guards)
  const activeRef = useRef(true);
  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
    };
  }, []);

  /* ------- kwoty ------- */
  const afterDiscount = useMemo(
    () => Math.max(0, Number(subtotal || 0) - Number(discount || 0)),
    [subtotal, discount]
  );

  const freeship =
    afterDiscount >= FREE_SHIPPING_FROM ||
    (appliedCoupon || "").trim().toUpperCase() === "FREESHIP";

  // Podgląd kosztu wysyłki – koszyk to „preview” (finalnie policzy Checkout)
  const shippingPreview = freeship
    ? 0
    : prefShippingMethod === "pickup"
    ? 0
    : SHIPPING_BASE;

  // dane do rekomendacji
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
  const excludeSlugs = useMemo(
    () => cart.map((it) => it.product?.slug ?? it.slug).filter(Boolean),
    [cart]
  );

  // NEW: auto-weryfikacja po wejściu na CartPage
  useEffect(() => {
    (async () => {
      if (!cart.length || typeof syncCartWithStock !== "function") return;
      setSyncing(true);
      const res = await syncCartWithStock();
      setSyncing(false);
      if (res?.changed) {
        const msg = buildStockMsg(res);
        setStockMsg(msg);
        setTimeout(() => setStockMsg(""), 5000);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // tylko na mount

  // NEW: autopolling co 20 s — tylko gdy strona jest aktywna i karta przeglądarki widoczna
  useEffect(() => {
    if (!cart.length || typeof syncCartWithStock !== "function") return;

    let stop = false;
    const visible = () => document.visibilityState === "visible";
    const tick = async () => {
      if (stop || !activeRef.current || !visible()) return;
      const res = await syncCartWithStock();
      if (res?.changed) {
        const msg = buildStockMsg(res);
        setStockMsg(msg);
        setTimeout(() => setStockMsg(""), 5000);
      }
    };

    // pierwszy „cichy” tick po 12 s, potem co 20 s
    const first = setTimeout(tick, 12000);
    const id = setInterval(tick, 20000);

    // pauza/wznowienie na zmianę widoczności karty
    const onVis = () => {
      if (visible()) tick();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      stop = true;
      clearTimeout(first);
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [cart.length, syncCartWithStock]);

  if (cart.length === 0)
    return (
      <div className="text-center mt-20">
        <div className="text-mainRed font-bold mb-3 text-xl">
          Twój koszyk jest pusty
        </div>
        <Link
          to="/"
          className="text-mainRed underline hover:text-gold transition text-lg"
        >
          ← Wróć do sklepu
        </Link>
      </div>
    );

  return (
    <div className="max-w-3xl mx-auto mt-8 p-6 sm:p-7 rounded-3xl border-2 border-gold bg-white/90 dark:bg-[#0f1524]/95 shadow-2xl">
      <h2 className="text-2xl font-extrabold text-mainRed dark:text-gold text-center mb-6">
        Twój koszyk
      </h2>

      {/* Pozycje */}
      <ul>
        {cart.map((item) => (
          <li
            key={item.slug}
            className="flex items-start justify-between gap-4 py-4 border-b border-black/5 dark:border-white/10"
          >
            <div className="flex items-start gap-3">
              <img
                src={item.image ? resolveImg(item.image) : FALLBACK_SRC}
                alt={item.name}
                className="w-16 h-16 rounded-xl object-cover shadow"
                loading="lazy"
                decoding="async"
                onError={(e) => {
                  // unikamy pętli i ikony błędu
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = FALLBACK_IMG;
                }}
              />
              <div>
                <div className="font-bold text-mainRed dark:text-gold">
                  {item.name}
                </div>
                <div className="text-gray-600 dark:text-white/70 text-sm">
                  {fmt(item.price)} zł / szt.
                </div>

                <div className="flex items-center mt-2 gap-2">
                  <button
                    onClick={() =>
                      updateQuantity(item.slug, item.quantity - 1)
                    }
                    disabled={item.quantity <= 1}
                    className="px-2 font-bold rounded bg-gray-100 dark:bg-white/10 hover:bg-mainRed hover:text-white disabled:opacity-40"
                  >
                    –
                  </button>
                  <span className="font-bold dark:text-white">
                    {item.quantity}
                  </span>
                  <button
                    onClick={() =>
                      updateQuantity(item.slug, item.quantity + 1)
                    }
                    className="px-2 font-bold rounded bg-gray-100 dark:bg-white/10 hover:bg-mainRed hover:text-white"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            <div className="text-gold font-extrabold whitespace-nowrap">
              {fmt(Number(item.price) * Number(item.quantity))} zł
            </div>

            <button
              onClick={() => removeFromCart(item.slug)}
              className="text-mainRed dark:text-gold font-bold px-2 hover:opacity-80"
              aria-label="Usuń z koszyka"
              title="Usuń"
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
            placeholder="Kod rabatowy"
            value={discountCode}
            onChange={(e) => setDiscountCode(e.target.value.toUpperCase())}
            className="flex-1 rounded-xl border-2 border-gold/60 px-4 py-2 outline-none focus:border-mainRed dark:bg-[#0f172a] dark:border-white/10 dark:text-white"
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
                setCouponError(
                  String(e?.message || e || "Nie udało się zastosować kodu")
                );
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
              className="px-4 py-2 rounded-xl border-2 border-black/10 dark:border-white/20 hover:bg-black/5 dark:hover:bg-white/10 font-semibold"
              aria-label="Usuń kupon"
            >
              Usuń kupon
            </button>
          )}
        </div>

        {couponError && (
          <p className="mt-2 text-sm text-red-600">{couponError}</p>
        )}
        {couponMsg && !couponError && (
          <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-400">
            {couponMsg}
          </p>
        )}
        {appliedCoupon && !couponError && (
          <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-400">
            Aktywny kupon: <strong>{appliedCoupon}</strong>{" "}
            {freeship && <span className="ml-2">· Darmowa wysyłka ✔</span>}
          </p>
        )}
      </div>

      {/* DOSTAWA */}
      <div className="mt-8 rounded-xl border-2 border-black/5 dark:border-white/10 p-4 bg-white/70 dark:bg-[#0b1220]/80">
        <div className="font-bold text-mainRed dark:text-gold mb-3">
          Metoda dostawy
        </div>

        {/* Kurier */}
        <div className="mb-4">
          <div className="font-semibold text-gray-800 dark:text-white mb-1">
            Kurier
          </div>
          <div className="space-y-2 text-sm">
            {SHIPPING_OPTIONS.courier.map(([key, label]) => (
              <label
                key={key}
                className="flex items-center gap-2 text-gray-800 dark:text-white/90"
              >
                <input
                  type="radio"
                  name="ship"
                  checked={
                    prefShippingMethod === "standard" &&
                    prefShippingCarrier === key
                  }
                  onChange={() => {
                    setPrefShippingMethod("standard");
                    setPrefShippingCarrier(key);
                  }}
                />
                <span>
                  {label}{" "}
                  {!freeship ? `· ${fmt(SHIPPING_BASE)} zł` : "· 0 zł (darmowa)"}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Automat paczkowy */}
        <div className="mb-4">
          <div className="font-semibold text-gray-800 dark:text-white mb-1">
            Automat paczkowy
          </div>
          <div className="space-y-2 text-sm">
            {SHIPPING_OPTIONS.locker.map(([key, label]) => (
              <label
                key={key}
                className="flex items-center gap-2 text-gray-800 dark:text-white/90"
              >
                <input
                  type="radio"
                  name="ship"
                  checked={
                    prefShippingMethod === "locker" &&
                    prefShippingCarrier === key
                  }
                  onChange={() => {
                    setPrefShippingMethod("locker");
                    setPrefShippingCarrier(key);
                  }}
                />
                <span>
                  {label}{" "}
                  {!freeship ? `· ${fmt(SHIPPING_BASE)} zł` : "· 0 zł (darmowa)"}
                </span>
              </label>
            ))}

            {prefShippingMethod === "locker" && (
              <div className="pl-6 mt-2 flex flex-col sm:flex-row gap-2">
                <input
                  className="rounded-lg border px-3 py-2 flex-1 bg-white dark:bg-[#0f172a] dark:border-white/10 dark:text-white dark:placeholder-white/50"
                  type="text"
                  placeholder={
                    prefShippingCarrier === "inpost"
                      ? "Kod Paczkomatu"
                      : "Kod automatu"
                  }
                  value={pickupCode}
                  onChange={(e) => setPickupCode(e.target.value.toUpperCase())}
                />
              </div>
            )}
          </div>
        </div>

        {/* Punkt odbioru */}
        <div className="mb-4">
          <div className="font-semibold text-gray-800 dark:text-white mb-1">
            Punkt odbioru
          </div>
          <div className="space-y-2 text-sm">
            {SHIPPING_OPTIONS.point.map(([key, label]) => (
              <label
                key={key}
                className="flex items-center gap-2 text-gray-800 dark:text-white/90"
              >
                <input
                  type="radio"
                  name="ship"
                  checked={
                    prefShippingMethod === "point" &&
                    prefShippingCarrier === key
                  }
                  onChange={() => {
                    setPrefShippingMethod("point");
                    setPrefShippingCarrier(key);
                  }}
                />
                <span>
                  {label}{" "}
                  {!freeship ? `· ${fmt(SHIPPING_BASE)} zł` : "· 0 zł (darmowa)"}
                </span>
              </label>
            ))}

            {prefShippingMethod === "point" && (
              <div className="pl-6 mt-2 flex flex-col sm:flex-row gap-2">
                <input
                  className="rounded-lg border px-3 py-2 flex-1 bg-white dark:bg-[#0f172a] dark:border-white/10 dark:text-white dark:placeholder-white/50"
                  type="text"
                  placeholder="Kod punktu (opcjonalnie)"
                  value={pickupCode}
                  onChange={(e) => setPickupCode(e.target.value.toUpperCase())}
                />
              </div>
            )}
          </div>
        </div>

        {/* Ekspres / Odbiór */}
        <div className="space-y-2 text-sm">
          <label className="flex items-center gap-2 text-gray-800 dark:text-white/90">
            <input
              type="radio"
              name="ship"
              checked={prefShippingMethod === "express"}
              onChange={() => {
                setPrefShippingMethod("express");
                setPrefShippingCarrier("");
              }}
            />
            <span>Kurier Warszawa (24h) · {fmt(SHIPPING_BASE)} zł</span>
          </label>

          <label className="flex items-center gap-2 text-gray-800 dark:text-white/90">
            <input
              type="radio"
              name="ship"
              checked={prefShippingMethod === "pickup"}
              onChange={() => {
                setPrefShippingMethod("pickup");
                setPrefShippingCarrier("");
              }}
            />
            <span>Odbiór osobisty · 0 zł</span>
          </label>
        </div>
      </div>

      {/* PŁATNOŚĆ */}
      <div className="mt-6 rounded-xl border-2 border-black/5 dark:border-white/10 p-4 bg-white/70 dark:bg-[#0b1220]/80">
        <div className="font-bold text-mainRed dark:text-gold mb-3">
          Metoda płatności
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            onClick={() => setPrefPaymentMethod("online")}
            className={pickBtn(prefPaymentMethod === "online")}
          >
            Przelew online / karta
          </button>

          <button
            onClick={() => setPrefPaymentMethod("blik")}
            className={pickBtn(prefPaymentMethod === "blik")}
          >
            BLIK
          </button>

          <button
            onClick={() => setPrefPaymentMethod("cod")}
            className={pickBtn(prefPaymentMethod === "cod")}
          >
            Za pobraniem
          </button>
        </div>
      </div>

      {/* Podsumowanie */}
      <div className="mt-8 rounded-xl border-2 border-black/5 dark:border-white/10 p-4 bg-white/70 dark:bg-[#0b1220]/80">
        <div className="flex justify-between text-sm">
          <span className="font-semibold dark:text-white">Produkty</span>
          <span className="font-semibold dark:text-white">
            {fmt(subtotal)} zł
          </span>
        </div>

        {Number(discount) > 0 && (
          <div className="flex justify-between mt-1 text-emerald-700 dark:text-emerald-400">
            <span>Rabat{appliedCoupon ? ` (${appliedCoupon})` : ""}</span>
            <span>-{fmt(discount)} zł</span>
          </div>
        )}

        <div className="flex justify-between mt-1 text-sm">
          <span className="dark:text-white">Szacowana dostawa</span>
          <span className="dark:text-white">
            {fmt(shippingPreview)} zł {freeship && "(darmowa)"}
          </span>
        </div>

        <div className="flex justify-between mt-3 text-xl font-extrabold">
          <span className="text-mainRed dark:text-gold">Suma</span>
          <span className="text-mainRed dark:text-gold">
            {fmt(afterDiscount + shippingPreview)} zł
          </span>
        </div>

        {/* NEW: delikatny komunikat o korektach koszyka */}
        {stockMsg && (
          <div className="mt-3 text-sm text-amber-700 dark:text-amber-300">
            {stockMsg}
          </div>
        )}

        <div className="text-xs text-gray-500 dark:text-white/60 mt-1">
          Finalna cena i adres będą potwierdzone w kolejnym kroku.
        </div>
      </div>

      {/* Rekomendacje */}
      <div className="mt-10">
        <Recommendations
          title="Jeszcze lepsze propozycje"
          mode="upsell"
          cartItems={cartItemsLite}
          exclude={excludeSlugs}
          count={4}
        />
      </div>

      {/* Akcje */}
      <div className="flex flex-wrap gap-3 mt-8 justify-end">
        <button
          onClick={clearCart}
          className="bg-mainRed text-white px-6 py-2 rounded-xl font-bold hover:bg-gold hover:text-mainRed transition"
        >
          Wyczyść koszyk
        </button>

        {/* NEW: weryfikacja przed przejściem do kasy */}
        <button
          disabled={syncing}
          className="bg-gold text-mainRed px-6 py-2 rounded-xl font-bold hover:bg-mainRed hover:text-gold transition disabled:opacity-60"
          onClick={async () => {
            if (typeof syncCartWithStock === "function") {
              setSyncing(true);
              const res = await syncCartWithStock();
              setSyncing(false);
              if (res?.changed) {
                setStockMsg(buildStockMsg(res));
                setTimeout(() => setStockMsg(""), 5000);
                // zatrzymujemy się na stronie koszyka — użytkownik akceptuje zmiany
                return;
              }
            }
            // jeśli bez zmian — przejście dalej
            if (user) {
              navigate("/checkout");
            } else if (showGuestOrder) {
              navigate("/checkout");
            } else {
              setShowGuestOrder(true);
            }
          }}
          title={syncing ? "Sprawdzanie dostępności…" : "Przejdź do zamówienia"}
        >
          {syncing ? "Sprawdzam…" : "Przejdź do zamówienia"}
        </button>
      </div>

      {!user && showGuestOrder && (
        <div className="mt-5 flex flex-wrap items-center gap-3 justify-end">
          <Link
            to="/login"
            className="px-6 py-2 rounded-xl bg-mainRed text-white font-bold hover:bg-gold hover:text-mainRed transition"
          >
            Zaloguj się
          </Link>
          <button
            className="px-6 py-2 rounded-xl bg-black/5 dark:bg-white/10 font-bold hover:opacity-80 dark:text-white"
            onClick={() => navigate("/checkout")}
          >
            Zamów jako gość
          </button>
        </div>
      )}
    </div>
  );
}
