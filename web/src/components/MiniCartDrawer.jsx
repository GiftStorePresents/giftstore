// src/components/MiniCartDrawer.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { X, Truck, Package, MapPin, Zap, Hand } from "lucide-react";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import {
  SHIPPING_COSTS,
  SHIPPING_BASE,
  FREE_SHIPPING_FROM,
} from "../context/CartContext";

/* helpers */
const SITE_ORIGIN =
  (typeof window !== "undefined" && window.location.origin) || "http://localhost:3000";
const BASE_URL =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_SITE_URL) ||
  (typeof process !== "undefined" &&
    (process.env.REACT_APP_SITE_URL || process.env.PUBLIC_URL)) ||
  SITE_ORIGIN;

function resolveImg(src) {
  if (!src) return "/og-image.jpg"; // ⬅️ domyślnie kierujemy na og-image.jpg
  if (/^(https?:)?\/\//i.test(src) || src.startsWith("data:")) return src;
  const base = String(BASE_URL || "").replace(/\/+$/, "");
  const path = src.startsWith("/") ? src : `/${src}`;
  return `${base}${path}`;
}

/* ⬇️ FALLBACKI OBRAZKA (bez-plikowy SVG na koniec) */
const FALLBACK_IMG =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="112" height="112" viewBox="0 0 112 112"><rect width="112" height="112" rx="12" fill="%23f1f5f9"/><path d="M20 74l16-16 12 12 20-20 24 24v12H20z" fill="%23cbd5e1"/><circle cx="38" cy="38" r="10" fill="%23e2e8f0"/></svg>';
const FALLBACK_SRC = resolveImg("/og-image.jpg"); // ⬅️ preferowany fallback z public/

/* formatowanie ceny */
const fmt = (n) =>
  (Math.round(Number(n) * 100) / 100).toLocaleString("pl-PL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/* --- zbuduj krótką wiadomość do toasta po syncu --- */
function buildToastMsg(res) {
  if (!res) return "";
  const parts = [];
  if (Array.isArray(res.removed) && res.removed.length) {
    parts.push(`Usunięto: ${res.removed.join(", ")}`);
  }
  if (Array.isArray(res.adjusted) && res.adjusted.length) {
    const list = res.adjusted.map((a) => `${a.slug}: ${a.from}→${a.to}`).join(", ");
    parts.push(`Dostosowano ilości (${list})`);
  }
  return parts.join(" • ") || "Zaktualizowano koszyk wg dostępności";
}

/* mini UI */
function SectionTitle({ icon: Icon, children }) {
  return (
    <div className="flex items-center gap-2 text-[13px] font-bold text-mainRed mb-2">
      {Icon && <Icon size={15} className="opacity-80" />}
      <span>{children}</span>
    </div>
  );
}
function RadioRow({ name, checked, onChange, left, right }) {
  return (
    <label className="group grid grid-cols-[18px_1fr_auto] items-center gap-2 rounded-lg border border-gray-200/80 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-1.5 hover:border-mainRed/50 transition cursor-pointer">
      <input type="radio" name={name} checked={checked} onChange={onChange} className="peer sr-only" />
      <span
        className={[
          "relative h-[16px] w-[16px] rounded-full border",
          "border-gray-300 bg-white shadow-inner",
          "dark:bg-transparent dark:border-white/30",
          "peer-checked:border-mainRed peer-checked:shadow-[0_0_0_3px_rgba(215,38,61,0.18)]",
          "after:absolute after:inset-[3px] after:rounded-full after:bg-mainRed after:scale-0 peer-checked:after:scale-100 after:transition-transform",
        ].join(" ")}
      />
      <div className="text-[13px] text-gray-800 dark:text-gray-200">{left}</div>
      <div className="ml-auto text-[13px] font-semibold text-mainRed tabular-nums">{right}</div>
    </label>
  );
}
function Pill({ children }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold
      bg-emerald-100 text-emerald-900 border-emerald-300
      dark:bg-emerald-500/15 dark:text-emerald-200 dark:border-emerald-600/40">
      {children}
    </span>
  );
}

export default function MiniCartDrawer({ open, onClose, setToast }) {
  const navigate = useNavigate();
  const {
    cart, updateQuantity, removeFromCart, clearCart,
    drawerOpen, closeDrawer,
    subtotal, discount, afterDiscount, shippingCost, hasFreeShipping,
    discountCode, setDiscountCode, applyCoupon, appliedCoupon, clearCoupon,
    shipping, setShippingMethod, setShippingCarrier,
    paymentMethod, setPaymentMethod,
    /* NEW: helper do weryfikacji stanów */
    syncCartWithStock, // NEW
  } = useCart();
  const { user } = useAuth();

  const [applying, setApplying] = useState(false);
  const [syncing, setSyncing] = useState(false); // NEW: guard stanu przy przycisku „Do kasy”
  const isOpen = typeof open === "boolean" ? open : !!drawerOpen;

  const drawerRef = useRef(null);
  const closeBtnRef = useRef(null);
  const lastFocusRef = useRef(null);

  const handleCloseBase = useMemo(() => {
    if (typeof onClose === "function") return onClose;
    if (typeof closeDrawer === "function") return closeDrawer;
    return () => {};
  }, [onClose, closeDrawer]);

  const handleClose = () => {
    try { document.activeElement?.blur?.(); } catch {}
    handleCloseBase();
    setTimeout(() => { try { lastFocusRef.current?.focus?.(); } catch {} }, 50);
  };

  useEffect(() => {
    const el = drawerRef.current;
    const onKey = (e) => {
      if (!isOpen) return;
      if (e.key === "Escape") { e.preventDefault(); handleClose(); }
      if (e.key === "Tab" && el) {
        const focusables = el.querySelectorAll(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    const prevOverflow = document.body.style.overflow;
    if (isOpen) {
      lastFocusRef.current = document.activeElement;
      document.body.style.overflow = "hidden";
      document.addEventListener("keydown", onKey);
      el?.removeAttribute("aria-hidden");
      el?.removeAttribute("inert");
      setTimeout(() => closeBtnRef.current?.focus(), 0);
    } else {
      el?.setAttribute("aria-hidden", "true");
      el?.setAttribute("inert", "");
    }
    return () => { document.body.style.overflow = prevOverflow; document.removeEventListener("keydown", onKey); };
  }, [isOpen]);

  /* =======================
   * NEW: SYNC PRZY OTWARCIU
   * ======================= */
  useEffect(() => {
    (async () => {
      if (!isOpen || typeof syncCartWithStock !== "function" || !cart.length) return;
      const res = await syncCartWithStock();
      if (res?.changed && typeof setToast === "function") {
        setToast(buildToastMsg(res));
      }
    })();
    // tylko przy otwieraniu
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  /* ========================================
   * NEW: AUTOPOLLING tylko gdy drawer otwarty
   * ======================================== */
  useEffect(() => {
    if (!isOpen || typeof syncCartWithStock !== "function" || !cart.length) return;
    let stop = false;
    const id = setInterval(async () => {
      if (stop) return;
      const res = await syncCartWithStock();
      if (res?.changed && typeof setToast === "function") {
        setToast(buildToastMsg(res));
      }
    }, 15000); // 15 s
    return () => { stop = true; clearInterval(id); };
  }, [isOpen, cart.length, syncCartWithStock, setToast]);

  /* opcje wysyłki (Twoje wartości/styl zostawione jak były) */
  const courierOptions = [
    ["dpd", "DPD", SHIPPING_COSTS.courier.dpd],
    ["dhl", "DHL", SHIPPING_COSTS.courier.dhl],
    ["ups", "UPS", SHIPPING_COSTS.courier.ups],
    ["fedex", "FedEx", SHIPPING_COSTS.courier.fedex],
    ["gls", "GLS", SHIPPING_COSTS.courier.gls],
    ["inpost_kurier", "InPost Kurier", SHIPPING_COSTS.courier.inpost_kurier],
    ["pocztex", "Pocztex", SHIPPING_COSTS.courier.pocztex],
  ];
  const lockerOptions = [
    ["inpost", "Paczkomat InPost", SHIPPING_COSTS.locker.inpost],
    ["dhl_box", "DHL Box (automat)", SHIPPING_COSTS.locker.dhl_box],
    ["pocztex_automat", "Pocztex Automat", SHIPPING_COSTS.locker.pocztex_automat],
  ];
  const pointOptions = [
    ["orlen", "ORLEN Paczka", SHIPPING_COSTS.point.orlen],
    ["dpd_pickup", "DPD Pickup", SHIPPING_COSTS.point.dpd_pickup],
    ["pocztex_punkt", "Pocztex Punkt", SHIPPING_COSTS.point.pocztex_punkt],
  ];

  const free = hasFreeShipping(afterDiscount);
  const localShippingCost = free ? 0 : shippingCost;
  const totalLocal = Math.max(0, afterDiscount) + Math.max(0, localShippingCost);

  // Fallbacki dla płatności
  const payMethod = paymentMethod || "online";
  const setPayMethod = typeof setPaymentMethod === "function" ? setPaymentMethod : () => {};

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-[9997] bg-black/45 dark:bg-black/60 backdrop-blur-[1px] transition-opacity duration-300 ${
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <aside
        ref={drawerRef}
        className={`fixed right-0 top-0 z-[9998] h-full w-[92vw] sm:w-[480px]
        bg-white text-gray-900 dark:bg-[#0f1424] dark:text-gray-50 shadow-2xl border-l border-gold
        transition-transform duration-300 ${isOpen ? "translate-x-0" : "translate-x-full"}
        overflow-y-auto overscroll-contain`}
        role="dialog"
        aria-modal="true"
        aria-label="Mini koszyk"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-black/10 dark:border-white/10 sticky top-0 bg-inherit">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-extrabold text-mainRed">Twój koszyk</h3>
            <button
              ref={closeBtnRef}
              onClick={handleClose}
              className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 text-mainRed"
              aria-label="Zamknij koszyk"
            >
              <X />
            </button>
          </div>
        </div>

        {/* Produkty */}
        {cart.length === 0 ? (
          <div className="p-6 text-center">
            <div className="text-mainRed font-bold mb-2">Koszyk jest pusty</div>
            <button className="underline text-gold font-bold" onClick={handleClose}>
              Wróć do sklepu
            </button>
          </div>
        ) : (
          <>
            <div className="px-5 py-4 space-y-4 overflow-y-auto max-h-[32vh] nice-scroll">
              {cart.map((item) => (
                <div key={item.slug} className="flex gap-3 items-center">
                  <img
                    src={item.image ? resolveImg(item.image) : FALLBACK_SRC}
                    alt={item.name}
                    className="w-14 h-14 rounded-lg object-cover ring-1 ring-black/5 dark:ring-white/10"
                    loading="lazy"
                    decoding="async"
                    onError={(e) => {
                      // ⬇️ unikamy pętli: zdejmujemy handler i dajemy bez-plikowy SVG
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = FALLBACK_IMG;
                    }}
                  />
                  <div className="flex-1">
                    <div className="font-semibold text-mainRed leading-tight text-[14px]">{item.name}</div>
                    <div className="text-[12px] text-gray-600 dark:text-gray-300">
                      {fmt(item.price)} zł / szt.
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <button
                        onClick={() => updateQuantity(item.slug, item.quantity - 1)}
                        disabled={item.quantity <= 1}
                        className="w-7 h-7 grid place-items-center rounded-lg bg-white text-gray-900 border border-gray-300 hover:bg-mainRed hover:text-white disabled:opacity-50 dark:bg:white/10 dark:text-gray-100 dark:border-white/20 dark:hover:bg-mainRed"
                        aria-label="Zmniejsz ilość"
                      >−</button>
                      <span className="w-8 h-7 grid place-items-center font-bold rounded-lg bg-white text-gray-900 border border-gray-300 select-none dark:bg-white/10 dark:text-gray-100 dark:border-white/20">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateQuantity(item.slug, item.quantity + 1)}
                        className="w-7 h-7 grid place-items-center rounded-lg bg-white text-gray-900 border border-gray-300 hover:bg-mainRed hover:text-white dark:bg-white/10 dark:text-gray-100 dark:border-white/20 dark:hover:bg-mainRed"
                        aria-label="Zwiększ ilość"
                      >+</button>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-extrabold text-gold text-[15px]">{fmt(item.price * item.quantity)} zł</div>
                    <button className="text-[11px] text-mainRed underline mt-1" onClick={() => removeFromCart(item.slug)}>
                      Usuń
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Kupon */}
            <div className="px-5 pt-3 pb-3 border-t border-black/10 dark:border-white/10">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={discountCode}
                  onChange={(e) => setDiscountCode(e.target.value.toUpperCase())}
                  placeholder="Kod rabatowy"
                  aria-label="Kod rabatowy"
                  className="flex-1 px-3 py-2 rounded-xl bg-white placeholder-gray-400 outline-none border border-gray-300 focus:border-mainRed focus:ring-0 shadow-none dark:bg:white/10 dark:border-white/20 dark:placeholder-gray-400"
                />
                <button
                  disabled={applying}
                  className="px-4 py-2 rounded-xl bg-mainRed text-white font-bold hover:bg-gold hover:text-mainRed transition disabled:opacity-60"
                  onClick={async () => {
                    try { setApplying(true); await applyCoupon(discountCode, user?.id); setToast && setToast("Kod zastosowany ✅"); }
                    catch (e) { setToast && setToast(String(e?.message || e || "Nie udało się")); }
                    finally { setApplying(false); }
                  }}
                >
                  {applying ? "…" : "Zastosuj"}
                </button>
              </div>

              {(appliedCoupon || Number(discount) > 0) && (
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  {appliedCoupon && (
                    <Pill>
                      <span className="opacity-80">Kupon:</span>
                      <span className="font-bold tracking-wide">{appliedCoupon}</span>
                      {clearCoupon && (
                        <button onClick={() => clearCoupon()} title="Usuń kupon"
                          className="underline decoration-1 underline-offset-2">usuń</button>
                      )}
                    </Pill>
                  )}
                  {Number(discount) > 0 && (
                    <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                      Rabat: −{fmt(discount)} zł
                    </span>
                  )}
                </div>
              )}

              {free ? (
                <div className="text-sm mt-2 text-emerald-700 dark:text-emerald-300">Darmowa wysyłka ✓</div>
              ) : (
                <>
                  <div className="text-sm text-gray-700 dark:text-gray-300 mt-2">
                    Wysyłka: {fmt(SHIPPING_BASE)} zł (gratis od {fmt(FREE_SHIPPING_FROM)} zł)
                  </div>
                  <div className="mt-3">
                    <div className="text-xs text-gray-600 dark:text-gray-300 mb-1">
                      Brakuje <span className="font-bold">
                        {fmt(Math.max(0, FREE_SHIPPING_FROM - afterDiscount))}
                      </span> zł do darmowej wysyłki
                    </div>
                    <div className="h-2 rounded bg-gray-200 dark:bg-white/10">
                      <div className="h-2 rounded bg-gold transition-all"
                           style={{ width: `${Math.min(100, (afterDiscount / FREE_SHIPPING_FROM) * 100)}%` }} />
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Dostawa */}
            <div className="px-5 py-4 border-t border-black/10 dark:border-white/10">
              <SectionTitle icon={Truck}>Dostawa</SectionTitle>
              <div className="max-h-[42vh] overflow-y-auto pr-1 -mr-1 nice-scroll space-y-3">
                {/* Kurier */}
                <div>
                  <div className="text-[12px] font-semibold text-gray-700 dark:text-gray-300 mb-1.5 flex items-center gap-1">
                    <Package size={13} /> Kurier
                  </div>
                  <div className="grid grid-cols-1 gap-1.5">
                    {courierOptions.map(([key, label, price]) => (
                      <RadioRow
                        key={key}
                        name="ship"
                        checked={shipping.method === "standard" && shipping.carrier === key}
                        onChange={() => { setShippingMethod("standard"); setShippingCarrier(key); }}
                        left={label}
                        right={free ? "0 zł" : `${fmt(price)} zł`}
                      />
                    ))}
                  </div>
                </div>

                {/* Automat */}
                <div>
                  <div className="text-[12px] font-semibold text-gray-700 dark:text-gray-300 mb-1.5 flex items-center gap-1">
                    <MapPin size={13} /> Automat paczkowy
                  </div>
                  <div className="grid grid-cols-1 gap-1.5">
                    {lockerOptions.map(([key, label, price]) => (
                      <RadioRow
                        key={key}
                        name="ship"
                        checked={shipping.method === "locker" && shipping.carrier === key}
                        onChange={() => { setShippingMethod("locker"); setShippingCarrier(key); }}
                        left={label}
                        right={free ? "0 zł" : `${fmt(price)} zł`}
                      />
                    ))}
                  </div>
                </div>

                {/* Punkt */}
                <div>
                  <div className="text-[12px] font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                    Punkt odbioru
                  </div>
                  <div className="grid grid-cols-1 gap-1.5">
                    {pointOptions.map(([key, label, price]) => (
                      <RadioRow
                        key={key}
                        name="ship"
                        checked={shipping.method === "point" && shipping.carrier === key}
                        onChange={() => { setShippingMethod("point"); setShippingCarrier(key); }}
                        left={label}
                        right={free ? "0 zł" : `${fmt(price)} zł`}
                      />
                    ))}
                  </div>
                </div>

                {/* Express / Odbiór */}
                <div className="grid grid-cols-1 gap-1.5">
                  <RadioRow
                    name="ship"
                    checked={shipping.method === "express"}
                    onChange={() => { setShippingMethod("express"); setShippingCarrier(""); }}
                    left={<span className="inline-flex items-center gap-1"><Zap size={13}/>Kurier Warszawa (24h)</span>}
                    right={free ? "0 zł" : `${fmt(SHIPPING_COSTS.express)} zł`}
                  />
                  <RadioRow
                    name="ship"
                    checked={shipping.method === "pickup"}
                    onChange={() => { setShippingMethod("pickup"); setShippingCarrier(""); }}
                    left={<span className="inline-flex items-center gap-1"><Hand size={13}/>Odbiór osobisty</span>}
                    right={"0 zł"}
                  />
                  <div className="h-6" aria-hidden="true" />
                </div>
              </div>
            </div>

            {/* Podsumowanie / sticky bottom */}
            <div className="p-5 border-t border-black/10 dark:border-white/10 bg-inherit sticky bottom-0">
              <div className="flex justify-between text-sm text-gray-700 dark:text-gray-200">
                <span>Produkty</span><span>{fmt(subtotal)} zł</span>
              </div>
              {Number(discount) > 0 && (
                <div className="flex justify-between text-sm text-emerald-700 dark:text-emerald-300">
                  <span>Rabat</span><span>−{fmt(discount)} zł</span>
                </div>
              )}
              <div className="flex justify-between text-sm text-gray-700 dark:text-gray-200">
                <span>Wysyłka</span><span>{fmt(localShippingCost)} zł</span>
              </div>
              <div className="flex justify-between mt-2 text-lg font-extrabold text-mainRed">
                <span>Suma</span><span>{fmt(totalLocal)} zł</span>
              </div>

              <div className="flex gap-2 mt-4">
                <button
                  className="flex-1 bg-white dark:bg-white/10 border-2 border-mainRed/20 text-mainRed font-bold px-4 py-2 rounded-xl hover:bg-mainRed/5 transition"
                  onClick={() => clearCart()}
                >
                  Wyczyść
                </button>

                {/*
                <Link
                  to="/cart"
                  onClick={handleClose}
                  className="flex-1 flex items-center justify-center bg-white dark:bg-white/10 border-2 border-gray-200 dark:border-white/15 text-mainRed font-bold px-4 py-2 rounded-xl hover:bg-gray-100 dark:hover:bg:white/15 transition"
                >
                  Przejdź do koszyka
                </Link>
                */}

                {/* NEW: kontrola przejścia do checkoutu z natychmiastowym sync */}
                <button
                  type="button"
                  disabled={syncing}
                  onClick={async () => {
                    if (typeof syncCartWithStock !== "function") {
                      handleClose();
                      navigate("/checkout");
                      return;
                    }
                    setSyncing(true);
                    const res = await syncCartWithStock();
                    setSyncing(false);
                    if (res?.changed) {
                      setToast && setToast(buildToastMsg(res));
                      // zostań w koszyku – użytkownik musi zaakceptować zmiany
                      return;
                    }
                    handleClose();
                    navigate("/checkout");
                  }}
                  className="checkout-btn flex-1 flex items-center justify-center bg-gold !text-mainRed font-bold px-4 py-2 rounded-xl hover:bg-mainRed hover:text-gold transition disabled:opacity-60"
                  aria-label="Przejdź do kasy"
                  title={syncing ? "Sprawdzanie dostępności…" : "Przejdź do kasy"}
                >
                  {syncing ? "Sprawdzam…" : "Do kasy"}
                </button>
              </div>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
