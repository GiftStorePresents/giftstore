// src/pages/CheckoutPage.jsx
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import { api, API_BASE } from "../api";
import { gaEvent, mapCartToGAItems } from "../utils/ga";

/* ---------------- helpers ---------------- */
function addBusinessDays(date, days) {
  const d = new Date(date);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay(); // 0=nd, 6=sb
    if (day !== 0 && day !== 6) added++;
  }
  return d;
}
function fmtAmount(n) {
  return (Math.round(Number(n) * 100) / 100).toLocaleString("pl-PL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
const PL_ZIP = /^\d{2}-?\d{3}$/;
const PHONE_RE = /^[0-9+().\-\s]{6,}$/;

/* ---------------- cennik ---------------- */
const COSTS = {
  courier: {
    dhl: 21.79,
    dpd: 12.16,
    ups: 23.79,
    fedex: 17.7,
    gls: 17.47,
    inpost_kurier: 15.83,
    pocztex: 12.66,
  },
  locker: {
    inpost: 15.83,
    dhl_box: 14.99,
    pocztex_automat: 12.99,
  },
  point: { orlen: 12.29, dpd_pickup: 12.16, pocztex_punkt: 12.66 },
  express: 17,
};

/* ==================================================================
 *  InPost SDK (easypack24) — single init (minimalny, bezpieczny CSS)
 * ================================================================== */
const INPOST_HOST = "https://geowidget.easypack24.net";

function ensureInpostSDK() {
  return new Promise((resolve, reject) => {
    // minimalny, bezpieczny CSS dla modala
    if (!document.getElementById("inpost-zfix")) {
      const st = document.createElement("style");
      st.id = "inpost-zfix";
      st.textContent = `
        .easypack-modal {
          z-index: 2147483000 !important;
          position: fixed !important;
          color-scheme: light !important;
        }
        .easypack-modal .leaflet-container,
        .easypack-modal .leaflet-pane { filter:none !important; mix-blend-mode:normal !important; }

        /* NIE resetujemy background/border — zostawiamy ich skórkę */
        .easypack-modal .btn,
        .easypack-modal button.btn {
          font: inherit;
          line-height: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 10px 14px;
          border-radius: 12px;
          cursor: pointer;
        }
        .easypack-modal .btn:hover,
        .easypack-modal button.btn:hover { filter: brightness(.98); }

        /* input */
        .easypack-modal .search-group input[type="text"] {
          color: #222 !important;
          border-radius: 12px !important;
        }
        .easypack-modal .search-group input::placeholder { color: #7a7a7a !important; }

        /* scrollbar */
        .easypack-modal ::-webkit-scrollbar { width: 10px; }
        .easypack-modal ::-webkit-scrollbar-thumb { background: #101524; border-radius: 10px; }
        .easypack-modal ::-webkit-scrollbar-track { background: #f0f0f0; }

        /* 🛡️ Fix na mnożenie lupy: NIE powtarzaj tła ikony */
        .easypack-modal .search-group-btn .btn {
          background-repeat: no-repeat !important;
          background-position: center !important;
          background-size: 16px auto !important;
        }
      `;
      document.head.appendChild(st);
    }

    if (window.easyPack?.mapWidget && window.__inpostReady) return resolve(window.easyPack);

    const oldJs = document.getElementById("inpost-js");
    const oldCss = document.getElementById("inpost-css");
    if (oldJs && !window.__inpostReady) oldJs.remove();
    if (oldCss && !window.__inpostReady) oldCss.remove();

    if (!document.getElementById("inpost-css")) {
      const link = document.createElement("link");
      link.id = "inpost-css";
      link.rel = "stylesheet";
      link.href = `${INPOST_HOST}/css/easypack.css`;
      link.onerror = () => reject(new Error("Nie udało się załadować CSS InPost."));
      document.head.appendChild(link);
    }

    if (typeof window.easyPackAsyncInit !== "function") {
      window.easyPackAsyncInit = function () {
        try {
          if (window.__inpostReady) return;
          if (window.easyPack && !window.__inpostInitedOnce) {
            window.easyPack.init({
              defaultLocale: "pl",
              mapType: "osm",
              points: { types: ["parcel_locker"] },
            });
            window.__inpostInitedOnce = true;
          }
          window.__inpostReady = true;
        } catch (e) {
          console.error("[InPost] init failed:", e);
        }
      };
    }

    if (!document.getElementById("inpost-js")) {
      const s = document.createElement("script");
      s.id = "inpost-js";
      s.src = `${INPOST_HOST}/js/sdk-for-javascript.js`;
      s.defer = true;
      s.async = true;
      s.onload = () => {
        try {
          if (!window.__inpostReady) window.easyPackAsyncInit?.();
        } catch (e) {
          console.error(e);
        }
      };
      s.onerror = () => reject(new Error("Nie udało się załadować JS InPost."));
      document.head.appendChild(s);
    } else {
      try { if (!window.__inpostReady) window.easyPackAsyncInit?.(); } catch {}
    }

    let tries = 0;
    const t = setInterval(() => {
      tries++;
      if (window.easyPack?.mapWidget && window.__inpostReady) {
        clearInterval(t);
        resolve(window.easyPack);
      } else if (tries > 100) {
        clearInterval(t);
        reject(new Error("InPost SDK nie zainicjalizował mapWidget (timeout)."));
      }
    }, 120);
  });
}

/* ---------------- blokada scrolla przy modalu ---------------- */
function useBodyScrollLock(locked) {
  useEffect(() => {
    if (!locked) return;
    const { style } = document.body;
    const prev = style.overflow;
    style.overflow = "hidden";
    return () => { style.overflow = prev; };
  }, [locked]);
}

/* ---------------- Modal: InPost mapWidget ---------------- */
function LockerDialog({ open, onClose, onPick }) {
  useBodyScrollLock(open);

  const containerIdRef = useRef(`inpost-map-${Math.random().toString(36).slice(2)}`);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    let mounted = true;
    let mo = null;

    (async () => {
      setBusy(true);
      setMsg("");
      try {
        const ep = await ensureInpostSDK();
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        if (!mounted) return;

        const container = document.getElementById(containerIdRef.current);
        if (!container) throw new Error("Brak kontenera InPost.");
        if (typeof ep.mapWidget !== "function") throw new Error("mapWidget nie jest funkcją.");

        ep.mapWidget(
          containerIdRef.current,
          (point) => {
            if (!mounted) return;
            onPick?.(point);
            onClose?.();
          },
          { type: "parcel_locker" }
        );

        // —— OPCJA B: dolep klasę Tailwindową do guzika „Szukaj”
        const applyBtnClass = () => {
          const btn = document.querySelector(".easypack-modal .search-group-btn .btn");
          if (!btn) return false;
          btn.classList.add("btn-search");
          // btn.classList.add("btn-search-sm"); // jeśli masz wariant
          // NIE tykamy backgroundImage — tylko pilnujemy, żeby się nie powtarzał (CSS wyżej)
          return true;
        };

        let applied = applyBtnClass();

        // Obserwuj TYLKO modal (widget podmienia DOM)
        const host =
          document.querySelector(".easypack-modal") ||
          document.getElementById(containerIdRef.current);

        if (!applied && host) {
          mo = new MutationObserver(() => { applyBtnClass(); });
          mo.observe(host, { childList: true, subtree: true });
        }
      } catch (e) {
        console.error("[InPost] mapWidget error:", e);
        setMsg("Nie udało się załadować mapy InPost. Spróbuj ponownie.");
      } finally {
        setBusy(false);
      }
    })();

    return () => {
      mounted = false;
      try {
        const el = document.getElementById(containerIdRef.current);
        if (el) el.innerHTML = "";
      } catch {}
      try { mo?.disconnect(); } catch {}
    };
  }, [open, onClose, onPick]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      className="fixed inset-0 flex items-center justify-center p-3"
      style={{ background: "rgba(0,0,0,.55)", zIndex: 2147483647, pointerEvents: "auto" }}
    >
      <div
        className="relative w-[min(1000px,96vw)] h-[min(720px,86vh)] bg-white rounded-2xl shadow-2xl border-2 border-gold overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
        style={{ zIndex: 2147483648 }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Zamknij"
          style={{ zIndex: 2147483649 }}
          className="absolute top-2 right-2 w-10 h-10 rounded-full border bg-white/95 hover:bg-white shadow flex items-center justify-center text-xl"
        >
          ✕
        </button>

        <div id={containerIdRef.current} style={{ width: "100%", height: "100%" }} />

        {(busy || msg) && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="pointer-events-auto bg-white/90 rounded-lg px-4 py-2 border">
              {busy ? "Ładowanie mapy…" : msg}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- component ---------------- */
export default function CheckoutPage() {
  const navigate = useNavigate();

  // KONTEKST KOSZYKA
  const cartCtx = useCart();
  const {
    cart,
    discountCode,
    setDiscountCode,
    appliedCoupon,
    applyCoupon,
    subtotal,
    discount,
    FREE_SHIPPING_FROM,
    hasFreeShipping,

    // Opcjonalne pola (różne wersje kontekstu)
    prefShippingMethod,
    setPrefShippingMethod,
    prefShippingCarrier,
    setPrefShippingCarrier,
    prefPaymentMethod,
    setPrefPaymentMethod,

    shipping,
    setShippingMethod: ctxSetShipMethod,
    setShippingCarrier: ctxSetShipCarrier,
    setLocker: ctxSetLocker,
    setPickupPoint: ctxSetPickup,
    setAddress: ctxSetAddress,

    paymentMethod: ctxPaymentMethod,
    setPaymentMethod: ctxSetPaymentMethod,
  } = cartCtx;

  const { user } = useAuth();

  // Kontakt — telefon OBOWIĄZKOWY
  const [contactName, setContactName] = useState(user?.displayName || user?.name || "");
  const [contactEmail, setContactEmail] = useState(user?.email || "");
  const [contactPhone, setContactPhone] = useState(user?.phone || "");

  // Adres (wymagany zawsze – do dokumentów)
  const [shippingInfo, setShippingInfo] = useState({
    addr1: "",
    city: "",
    zip: "",
    country: "PL",
  });

  // Odbiór w automacie InPost
  const [locker, setLocker] = useState({ code: "", name: "" });

  // Odbiór/punkty/automaty innych przewoźników — BEZ MAPY
  const [pickupPoint, setPickupPoint] = useState({ code: "", name: "" });

  // Wybory dostawy (lokalnie)
  const [shippingMethod, setShippingMethod] = useState("standard"); // standard | locker | point | express | pickup
  const [shippingCarrier, setShippingCarrier] = useState("dpd");     // nazwa przewoźnika

  // Płatność
  const [paymentMethod, setPaymentMethod] = useState("online"); // online | blik | cod

  // Modale
  const [lockerOpen, setLockerOpen] = useState(false);

  // reszta UI
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [applying, setApplying] = useState(false);
  const [couponMsg, setCouponMsg] = useState("");
  const [wantInvoice, setWantInvoice] = useState(false);
  const [invoice, setInvoice] = useState({
    companyName: "",
    nip: "",
    email: "",
    addr1: "",
    city: "",
    zip: "",
    country: "PL",
  });

  /* -------------------- SYNC z CartContext (init) -------------------- */
  useEffect(() => {
    // Wersja z 'shipping' (nowsza)
    if (shipping?.method) {
      setShippingMethod(shipping.method);
      if (shipping.carrier) setShippingCarrier(shipping.carrier);
      if (shipping.address) {
        setShippingInfo((s) => ({
          addr1: shipping.address.addr1 || s.addr1,
          city: shipping.address.city || s.city,
          zip: shipping.address.zip || s.zip,
          country: shipping.address.country || s.country || "PL",
        }));
      }
      if (shipping.locker?.code) setLocker({ code: shipping.locker.code, name: shipping.locker.name || "" });
      if (shipping.pickupPoint?.code)
        setPickupPoint({ code: shipping.pickupPoint.code, name: shipping.pickupPoint.name || "" });
    } else {
      // Starsza wersja z pref*
      if (prefShippingMethod) setShippingMethod(prefShippingMethod);
      if (prefShippingCarrier) setShippingCarrier(prefShippingCarrier);
    }

    // Płatność
    if (ctxPaymentMethod) setPaymentMethod(ctxPaymentMethod);
    else if (prefPaymentMethod) setPaymentMethod(prefPaymentMethod);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // tylko raz na start

  /* -------------------- SYNC do CartContext (write-back) -------------------- */
  useEffect(() => {
    ctxSetShipMethod?.(shippingMethod);
    setPrefShippingMethod?.(shippingMethod);
  }, [shippingMethod, ctxSetShipMethod, setPrefShippingMethod]);

  useEffect(() => {
    ctxSetShipCarrier?.(shippingCarrier);
    setPrefShippingCarrier?.(shippingCarrier);
  }, [shippingCarrier, ctxSetShipCarrier, setPrefShippingCarrier]);

  useEffect(() => {
    if (locker?.code) ctxSetLocker?.({ code: locker.code, name: locker.name || "" });
  }, [locker?.code, locker?.name, ctxSetLocker]);

  useEffect(() => {
    if (pickupPoint?.code) ctxSetPickup?.({ code: pickupPoint.code, name: pickupPoint.name || "" });
  }, [pickupPoint?.code, pickupPoint?.name, ctxSetPickup]);

  useEffect(() => {
    ctxSetAddress?.(shippingInfo);
  }, [shippingInfo, ctxSetAddress]);

  useEffect(() => {
    ctxSetPaymentMethod?.(paymentMethod);
    setPrefPaymentMethod?.(paymentMethod);
  }, [paymentMethod, ctxSetPaymentMethod, setPrefPaymentMethod]);

  // kwoty
  const afterDiscount = Math.max(0, Number(subtotal || 0) - Number(discount || 0));
  const shippingCost = useMemo(() => {
    const free = hasFreeShipping(afterDiscount);
    if (shippingMethod === "pickup") return 0;
    if (shippingMethod === "express") return COSTS.express;
    if (free) return 0;

    if (shippingMethod === "standard") {
      const c = COSTS.courier[shippingCarrier] ?? 15;
      return c;
    }
    if (shippingMethod === "locker") {
      const c = COSTS.locker[shippingCarrier] ?? COSTS.locker.inpost;
      return c;
    }
    if (shippingMethod === "point") {
      const c = COSTS.point[shippingCarrier] ?? 12.99;
      return c;
    }
    return 15;
  }, [shippingMethod, shippingCarrier, afterDiscount, hasFreeShipping]);

  const paymentSurcharge = paymentMethod === "cod" ? 5 : 0;
  const total = afterDiscount + shippingCost + paymentSurcharge;

  useEffect(() => { window.scrollTo(0, 0); }, []);
  useEffect(() => {
    if (user?.email) setInvoice((iv) => ({ ...iv, email: iv.email || user.email }));
  }, [user?.email]);

  // GA begin_checkout
  useEffect(() => {
    if (!cart?.length) return;
    const key = "ga.begin_checkout.sent";
    if (sessionStorage.getItem(key)) return;
    gaEvent("begin_checkout", { currency: "PLN", value: Number(subtotal || 0), items: mapCartToGAItems(cart) });
    sessionStorage.setItem(key, "1");
  }, [cart, subtotal]);

  // pick z mapy InPost
  const handleLockerPick = useCallback((point) => {
    const code = point?.name || point?.id || "";
    const line1 = point?.address?.line1 || point?.address_details || "";
    const line2 = point?.address?.line2 || point?.city || "";
    const name = [line1, line2].filter(Boolean).join(" ");
    setLocker({ code: (code || "").toUpperCase(), name });
  }, []);

  /* ---------------- walidacja ---------------- */
  function validate() {
    const name = (contactName || "").trim();
    const email = (contactEmail || "").trim();
    const phone = (contactPhone || "").trim();

    if (!name) return "Podaj imię i nazwisko.";
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Podaj poprawny adres e-mail.";
    if (!phone) return "Podaj numer telefonu.";
    if (!PHONE_RE.test(phone)) return "Telefon wygląda niepoprawnie.";

    if (!shippingInfo.addr1.trim()) return "Podaj ulicę i numer domu (wymagane do dokumentów).";
    if (!shippingInfo.city.trim()) return "Podaj miasto (wymagane do dokumentów).";
    if (!shippingInfo.zip.trim() || !PL_ZIP.test(shippingInfo.zip)) {
      return "Podaj poprawny kod pocztowy (np. 00-000).";
    }
    if (!shippingInfo.country.trim()) return "Podaj kraj.";

    if (shippingMethod === "locker") {
      if (shippingCarrier === "inpost") {
        if (!locker.code.trim()) return "Wybierz Paczkomat InPost (kod punktu jest wymagany).";
      } else {
        if (!pickupPoint.code.trim()) return "Podaj kod automatu (bez mapy).";
      }
    } else if (shippingMethod === "point") {
      if (!pickupPoint.code.trim()) return "Podaj kod punktu (bez mapy).";
    }

    if (wantInvoice) {
      if (!invoice.companyName || !invoice.addr1 || !invoice.city || !invoice.zip) {
        return "Do faktury uzupełnij nazwę/firmę oraz pełny adres (ulica, miasto, kod).";
      }
      if (invoice.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invoice.email)) {
        return "E-mail do faktury wygląda niepoprawnie.";
      }
      if (invoice.nip && !/^\d{10}$/.test(invoice.nip.replace(/\D/g, ""))) {
        return "NIP wygląda niepoprawnie (oczekiwane 10 cyfr).";
      }
    }

    return "";
  }

  /* ---------------- kupon ---------------- */
  async function handleApplyCoupon() {
    setError("");
    setCouponMsg("");
    try {
      setApplying(true);
      await applyCoupon(discountCode, user?.id);
      setCouponMsg(`Kod zastosowany: ${String(discountCode).trim().toUpperCase()} ✅`);
    } catch (e) {
      setError(String(e?.message || "Nie udało się zastosować kodu."));
    } finally {
      setApplying(false);
    }
  }

  /* ---------------- submit ---------------- */
  const handleOrder = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setError("");

    const v = validate();
    if (v) {
      setError(v);
      return;
    }

    const items = cart
      .map((i) => {
        if (i.variantId) return { variantId: i.variantId, qty: i.quantity };
        if (i.slug) return { slug: i.slug, qty: i.quantity };
        return null;
      })
      .filter(Boolean);

    if (!items.length) {
      setError("Koszyk nie zawiera poprawnych pozycji. Dodaj produkty ponownie.");
      return;
    }

    const subtotalCents = Math.round(Number(subtotal || 0) * 100);
    const discountCents = Math.round(Number(discount || 0) * 100);
    const shippingCents = Math.round(Number(shippingCost || 0) * 100);
    const paymentSurchargeCents = Math.round(Number(paymentSurcharge || 0) * 100);
    const totalCents = Math.round(Number(total || 0) * 100);

    const email = contactEmail;
    const name = contactName;

    const shippingName = name;

    let shippingAddr1 = shippingInfo.addr1;
    let shippingCity = shippingInfo.city;
    let shippingZip = shippingInfo.zip;
    let shippingCountry = shippingInfo.country || "PL";
    let shippingLockerCode = null;
    let shippingLockerName = null;
    let shippingPointCode = null;
    let shippingPointName = null;

    if (shippingMethod === "pickup") {
      shippingAddr1 = `${shippingAddr1} (Odbiór osobisty)`;
    } else if (shippingMethod === "locker") {
      if (shippingCarrier === "inpost") {
        shippingAddr1 = `${shippingAddr1} (Paczkomat InPost: ${locker.code}${locker.name ? `, ${locker.name}` : ""})`;
        shippingLockerCode = locker.code;
        shippingLockerName = locker.name || null;
      } else {
        const label =
          shippingCarrier === "dhl_box" ? "DHL Box" :
          shippingCarrier === "pocztex_automat" ? "Pocztex Automat" : "Automat";
        shippingAddr1 = `${shippingAddr1} (${label}: ${pickupPoint.code}${pickupPoint.name ? `, ${pickupPoint.name}` : ""})`;
        shippingPointCode = pickupPoint.code;
        shippingPointName = pickupPoint.name || null;
      }
    } else if (shippingMethod === "point") {
      const label =
        shippingCarrier === "orlen" ? "ORLEN Paczka" :
        shippingCarrier === "dpd_pickup" ? "DPD Pickup" : "Pocztex Punkt";
      shippingAddr1 = `${shippingAddr1} (${label}: ${pickupPoint.code}${pickupPoint.name ? `, ${pickupPoint.name}` : ""})`;
      shippingPointCode = pickupPoint.code;
      shippingPointName = pickupPoint.name || null;
    }

    setSubmitting(true);
    try {
      const payload = {
        email,
        name,
        phone: contactPhone,

        items,

        subtotalCents,
        discountCents,
        shippingCents,
        paymentSurchargeCents,
        totalCents,

        code: appliedCoupon || null,

        shippingMethod,
        shippingCarrier,

        paymentMethod,
        shippingName,
        shippingAddr1,
        shippingCity,
        shippingZip,
        shippingCountry,

        shippingLockerCode,
        shippingLockerName,

        shippingPointCode,
        shippingPointName,

        invoiceRequested: wantInvoice,
        invoiceCompanyName: wantInvoice ? invoice.companyName : null,
        invoiceNip: wantInvoice ? invoice.nip || null : null,
        invoiceAddr1: wantInvoice ? invoice.addr1 : null,
        invoiceCity: wantInvoice ? invoice.city : null,
        invoiceZip: wantInvoice ? invoice.zip : null,
        invoiceCountry: wantInvoice ? invoice.country || "PL" : null,
        invoiceEmail: wantInvoice ? invoice.email || email : null,
      };

      const result = await api.orders.create(payload);
      const createdOrderId = result?.order?.id || result?.id || "";
      const createdOrderNumber = result?.order?.number || result?.number || createdOrderId || "";
      if (!createdOrderId) throw new Error("Brak ID zamówienia w odpowiedzi API.");

      sessionStorage.setItem("lastPurchaseItems", JSON.stringify(mapCartToGAItems(cart)));
      sessionStorage.setItem("lastPurchaseValue", String(afterDiscount));
      sessionStorage.setItem("lastPurchaseShipping", String(shippingCost));

      const isOnline = paymentMethod === "online" || paymentMethod === "blik";
      if (isOnline && totalCents > 0) {
        const res = await fetch(`${API_BASE}/api/payments/stripe/session`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: createdOrderId }),
        });
        if (!res.ok) {
          const msg = await res.text().catch(() => "");
          throw new Error(msg || "Nie udało się utworzyć sesji płatności.");
        }
        const data = await res.json();
        if (!data?.url) throw new Error("Brak URL Checkout z backendu.");

        try {
          gaEvent("add_payment_info", {
            currency: "PLN",
            value: total,
            payment_type: paymentMethod,
            items: mapCartToGAItems(cart),
          });
        } catch {}

        window.location.href = data.url;
        return;
      }

      navigate(`/thank-you?orderId=${encodeURIComponent(createdOrderNumber)}`);
    } catch (err) {
      console.error("[Checkout] submit failed:", err);
      setError((err && err.message) || "Nie udało się złożyć zamówienia. Spróbuj ponownie za chwilę.");
    } finally {
      setSubmitting(false);
    }
  };

  if (cart.length === 0)
    return (
      <div className="text-center mt-20">
        <div className="text-mainRed font-bold mb-3 text-xl">Koszyk jest pusty</div>
        <Link to="/" className="text-mainRed underline hover:text-gold transition text-lg">
          ← Wróć do sklepu
        </Link>
      </div>
    );

  return (
    <>
      {/* Modal InPost */}
      <LockerDialog
        open={shippingMethod === "locker" && shippingCarrier === "inpost" && lockerOpen}
        onClose={() => setLockerOpen(false)}
        onPick={handleLockerPick}
      />

      {/* Karta zamówienia */}
      <div className="rounded-3xl shadow-xl p-6 sm:p-8 max-w-xl mx-auto mt-8 border-2 border-gold bg-white/90 dark:bg-[#0f1524]/95">
        <h2 className="text-2xl font-extrabold text-center text-mainRed dark:text-mainRed mb-6">
          Zamówienie
        </h2>

        {/* Podsumowanie koszyka */}
        <div className="mb-6 rounded-xl border p-4 bg-white dark:bg-[#0b1220] dark:border-white/10">
          <div className="flex justify-between text-sm font-semibold text-gray-900 dark:text-white">
            <span>Produkty</span>
            <span>{fmtAmount(subtotal)} zł</span>
          </div>
          <div className="flex justify-between text-sm font-semibold text-gray-900 mt-1 dark:text-white">
            <span>Dostawa</span>
            <span>{fmtAmount(shippingCost)} zł</span>
          </div>
          {Number(discount) > 0 && (
            <div className="flex justify-between text-sm text-green-700 dark:text-green-400 mt-1">
              <span>Rabat{appliedCoupon ? ` (${appliedCoupon})` : ""}</span>
              <span>-{fmtAmount(discount)} zł</span>
            </div>
          )}

          <div className="flex justify-between mt-3 text-lg font-extrabold">
            <span className="text-mainRed dark:text-mainRed">Suma</span>
            <span className="text-mainRed dark:text-mainRed">{fmtAmount(total)} zł</span>
          </div>

          {(shippingMethod === "standard" || shippingMethod === "locker" || shippingMethod === "point") &&
            !hasFreeShipping(afterDiscount) && (
              <div className="mt-3">
                <div className="text-xs text-gray-600 dark:text-white/70 mb-1">
                  Brakuje{" "}
                  <span className="font-bold">
                    {fmtAmount(Math.max(0, FREE_SHIPPING_FROM - afterDiscount))}
                  </span>{" "}
                  zł do darmowej wysyłki
                </div>
                <div className="h-2 rounded bg-gray-200 dark:bg:white/10">
                  <div
                    className="h-2 bg-gold rounded transition-all"
                    style={{ width: `${Math.min(100, (afterDiscount / FREE_SHIPPING_FROM) * 100)}%` }}
                  />
                </div>
              </div>
            )}
        </div>

        {/* Dane kontaktowe */}
        <div className="mb-6 rounded-xl border p-4 bg-white dark:bg-[#0b1220] dark:border-white/10">
          <div className="font-bold text-mainRed dark:text-mainRed mb-2">Dane kontaktowe</div>
          <div className="grid gap-3">
            <input
              className="rounded-lg border p-2 bg-white dark:bg-[#0f172a] dark:border-white/10 dark:text-white dark:placeholder-white/50"
              required
              type="text"
              placeholder="Imię i nazwisko"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              autoComplete="name"
            />
            <input
              className="rounded-lg border p-2 bg-white dark:bg-[#0f172a] dark:border-white/10 dark:text-white dark:placeholder-white/50"
              required
              type="email"
              placeholder="E-mail"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              autoComplete="email"
            />
            <input
              className="rounded-lg border p-2 bg-white dark:bg-[#0f172a] dark:border-white/10 dark:text-white dark:placeholder-white/50"
              required
              type="tel"
              inputMode="tel"
              pattern="[0-9+().\\-\\s]{6,}"
              placeholder="Telefon"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              autoComplete="tel"
              title="Podaj numer telefonu (min. 6 znaków, cyfry i + ( ) - . i spacje dozwolone)."
            />
          </div>
        </div>

        {/* Metoda dostawy */}
        <div className="mb-6 rounded-xl border p-4 bg-white dark:bg-[#0b1220] dark:border-white/10">
          <div className="font-bold text-mainRed dark:text-mainRed mb-3">Metoda dostawy</div>

          {/* Kurierzy */}
          <div className="space-y-2 text-sm mb-4">
            <div className="font-semibold text-gray-800 dark:text-white">Kurier</div>
            {[
              ["dpd", "DPD"],
              ["dhl", "DHL"],
              ["ups", "UPS"],
              ["fedex", "FedEx"],
              ["gls", "GLS"],
              ["inpost_kurier", "InPost Kurier"],
              ["pocztex", "Pocztex"],
            ].map(([key, label]) => (
              <label className="flex items-center gap-2 text-gray-800 dark:text-white/90" key={key}>
                <input
                  type="radio"
                  name="shipping"
                  value={`standard:${key}`}
                  checked={shippingMethod === "standard" && shippingCarrier === key}
                  onChange={() => {
                    setShippingMethod("standard");
                    setShippingCarrier(key);
                  }}
                />
                <span>
                  {label} (ok. 1–3 dni)
                  {COSTS.courier[key] ? ` · ${fmtAmount(COSTS.courier[key])} zł` : ""}
                </span>
              </label>
            ))}
          </div>

          {/* Automaty paczkowe */}
          <div className="space-y-2 text-sm mb-4">
            <div className="font-semibold text-gray-800 dark:text-white">Automat paczkowy</div>

            {[
              ["inpost", "Paczkomat InPost"],
              ["dhl_box", "DHL Box (automat)"],
              ["pocztex_automat", "Pocztex Automat"],
            ].map(([key, label]) => (
              <label className="flex items-center gap-2 text-gray-800 dark:text-white/90" key={key}>
                <input
                  type="radio"
                  name="shipping"
                  value={`locker:${key}`}
                  checked={shippingMethod === "locker" && shippingCarrier === key}
                  onChange={() => {
                    setShippingMethod("locker");
                    setShippingCarrier(key);
                  }}
                />
                <span>
                  {label} (1–3 dni)
                  {COSTS.locker[key] ? ` · ${fmtAmount(COSTS.locker[key])} zł` : ""}
                </span>
              </label>
            ))}

            {shippingMethod === "locker" && (
              <div className="grid gap-2 pl-6">
                {shippingCarrier === "inpost" ? (
                  <>
                    <div className="flex gap-2">
                      <input
                        className="rounded-lg border p-2 flex-1 bg-white dark:bg-[#0f172a] dark:border-white/10 dark:text-white dark:placeholder-white/50"
                        type="text"
                        placeholder="Kod Paczkomatu, np. WAW01A"
                        value={locker.code}
                        onChange={(e) =>
                          setLocker((s) => ({ ...s, code: e.target.value.toUpperCase() }))
                        }
                      />
                      <button
                        type="button"
                        onClick={() => setLockerOpen(true)}
                        className="shrink-0 px-3 py-2 rounded-lg border-2 border-gold font-semibold text-mainRed hover:bg-gold/20"
                      >
                        Mapa InPost
                      </button>
                    </div>
                    {locker.name && (
                      <span className="text-xs text-gray-600 dark:text-white/70">
                        Wybrany: {locker.name}
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <div className="flex gap-2">
                      <input
                        className="rounded-lg border p-2 flex-1 bg-white dark:bg-[#0f172a] dark:border-white/10 dark:text-white dark:placeholder-white/50"
                        type="text"
                        placeholder="Kod automatu (np. z potwierdzenia przewoźnika)"
                        value={pickupPoint.code}
                        onChange={(e) =>
                          setPickupPoint((s) => ({ ...s, code: e.target.value.toUpperCase() }))
                        }
                      />
                      <input
                        className="rounded-lg border p-2 flex-1 bg-white dark:bg-[#0f172a] dark:border-white/10 dark:text-white dark:placeholder-white/50"
                        type="text"
                        placeholder="Nazwa / adres automatu"
                        value={pickupPoint.name}
                        onChange={(e) =>
                          setPickupPoint((s) => ({ ...s, name: e.target.value }))
                        }
                      />
                    </div>
                    <p className="text-xs text-gray-500 dark:text-white/60">
                      (Wpisz ręcznie kod i nazwę/adres automatu. Mapa jest dostępna tylko dla InPost.)
                    </p>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Punkty odbioru */}
          <div className="space-y-2 text-sm mb-4">
            <div className="font-semibold text-gray-800 dark:text-white">Punkt odbioru</div>
            {[
              ["orlen", "ORLEN Paczka"],
              ["dpd_pickup", "DPD Pickup"],
              ["pocztex_punkt", "Pocztex Punkt"],
            ].map(([key, label]) => (
              <label className="flex items-center gap-2 text-gray-800 dark:text-white/90" key={key}>
                <input
                  type="radio"
                  name="shipping"
                  value={`point:${key}`}
                  checked={shippingMethod === "point" && shippingCarrier === key}
                  onChange={() => {
                    setShippingMethod("point");
                    setShippingCarrier(key);
                  }}
                />
                <span>
                  {label} (1–3 dni)
                  {COSTS.point[key] ? ` · ${fmtAmount(COSTS.point[key])} zł` : ""}
                </span>
              </label>
            ))}

            {shippingMethod === "point" && (
              <div className="grid gap-2 pl-6">
                <div className="flex gap-2">
                  <input
                    className="rounded-lg border p-2 flex-1 bg-white dark:bg-[#0f172a] dark:border-white/10 dark:text-white dark:placeholder-white/50"
                    type="text"
                    placeholder="Kod punktu (np. z potwierdzenia przewoźnika)"
                    value={pickupPoint.code}
                    onChange={(e) =>
                      setPickupPoint((s) => ({ ...s, code: e.target.value.toUpperCase() }))
                    }
                  />
                  <input
                    className="rounded-lg border p-2 flex-1 bg-white dark:bg-[#0f172a] dark:border-white/10 dark:text-white dark:placeholder-white/50"
                    type="text"
                    placeholder="Nazwa / adres punktu"
                    value={pickupPoint.name}
                    onChange={(e) =>
                      setPickupPoint((s) => ({ ...s, name: e.target.value }))
                    }
                  />
                </div>
                <p className="text-xs text-gray-500 dark:text-white/60">
                  (Wpisz ręcznie kod i nazwę/adres punktu. Mapa jest dostępna tylko dla InPost.)
                </p>
              </div>
            )}
          </div>

          {/* Express i Odbiór */}
          <div className="space-y-2 text-sm text-gray-800 dark:text-white/90">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="shipping"
                value="express"
                checked={shippingMethod === "express"}
                onChange={() => setShippingMethod("express")}
              />
              <span>Kurier Warszawa (24h) · {fmtAmount(COSTS.express)} zł</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="shipping"
                value="pickup"
                checked={shippingMethod === "pickup"}
                onChange={() => setShippingMethod("pickup")}
              />
              <span>Odbiór osobisty (0 zł)</span>
            </label>
          </div>
        </div>

        {/* Adres — wymagany zawsze */}
        <div className="mb-6 rounded-xl border p-4 bg-white dark:bg-[#0b1220] dark:border-white/10">
          <div className="font-bold text-mainRed dark:text-mainRed mb-2">Adres</div>
          <div className="grid gap-3">
            <input
              className="rounded-lg border p-2 bg-white dark:bg-[#0f172a] dark:border-white/10 dark:text-white dark:placeholder-white/50"
              type="text"
              placeholder="Ulica i numer *"
              value={shippingInfo.addr1}
              onChange={(e) => setShippingInfo((s) => ({ ...s, addr1: e.target.value }))}
              autoComplete="address-line1"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                className="rounded-lg border p-2 bg-white dark:bg-[#0f172a] dark:border-white/10 dark:text-white dark:placeholder-white/50"
                type="text"
                placeholder="Miasto *"
                value={shippingInfo.city}
                onChange={(e) => setShippingInfo((s) => ({ ...s, city: e.target.value }))}
                autoComplete="address-level2"
              />
              <input
                className="rounded-lg border p-2 bg-white dark:bg-[#0f172a] dark:border-white/10 dark:text-white dark:placeholder-white/50"
                type="text"
                placeholder="Kod pocztowy * (np. 00-000)"
                value={shippingInfo.zip}
                onChange={(e) => setShippingInfo((s) => ({ ...s, zip: e.target.value }))}
                autoComplete="postal-code"
              />
            </div>
            <input
              className="rounded-lg border p-2 bg-white dark:bg-[#0f172a] dark:border-white/10 dark:text-white dark:placeholder-white/50"
              type="text"
              placeholder="Kraj *"
              value={shippingInfo.country}
              onChange={(e) => setShippingInfo((s) => ({ ...s, country: e.target.value }))}
              autoComplete="country"
            />
          </div>
        </div>

        {/* Płatność */}
        <div className="mb-6 rounded-xl border p-4 bg-white dark:bg-[#0b1220] dark:border-white/10">
          <div className="font-bold text-mainRed dark:text-mainRed mb-2">Metoda płatności</div>
          <div className="space-y-2 text-sm text-gray-800 dark:text:white/90">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="payment"
                value="online"
                checked={paymentMethod === "online"}
                onChange={() => setPaymentMethod("online")}
              />
              <span>Przelew online / karta</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="payment"
                value="blik"
                checked={paymentMethod === "blik"}
                onChange={() => setPaymentMethod("blik")}
              />
              <span>BLIK</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="payment"
                value="cod"
                checked={paymentMethod === "cod"}
                onChange={() => setPaymentMethod("cod")}
              />
              <span>Za pobraniem (+5 zł)</span>
            </label>
          </div>
        </div>

        {/* Kod rabatowy */}
        <div className="mb-6 rounded-xl border p-4 bg-white dark:bg-[#0b1220] dark:border-white/10">
          <div className="font-bold text-mainRed dark:text-mainRed mb-2">Kod rabatowy</div>
          <div className="flex gap-2">
            <input
              type="text"
              value={discountCode}
              onChange={(e) => {
                setError("");
                setCouponMsg("");
                setDiscountCode(e.target.value.toUpperCase());
              }}
              placeholder="Wpisz kod"
              className="flex-1 border rounded-lg px-3 py-2 bg-white dark:bg-[#0f172a] dark:border-white/10 dark:text-white dark:placeholder-white/50"
            />
            <button
              type="button"
              disabled={applying}
              onClick={async () => {
                try { document.activeElement?.blur?.(); } catch {}
                await handleApplyCoupon();
              }}
              className="px-3 py-2 rounded-lg bg-gold text-mainRed font-bold hover:bg-mainRed hover:text-gold transition disabled:opacity-60"
            >
              {applying ? "…" : "Zastosuj"}
            </button>
          </div>
          {couponMsg && <div className="text-sm text-green-700 dark:text-green-400 mt-2">{couponMsg}</div>}
        </div>

        {/* Faktura */}
        <div className="mb-6 rounded-xl border p-4 bg-white dark:bg-[#0b1220] dark:border-white/10">
          <label className="flex items-center gap-2 font-bold text-mainRed dark:text-mainRed">
            <input
              type="checkbox"
              checked={wantInvoice}
              onChange={(e) => setWantInvoice(e.target.checked)}
            />
            <span>Chcę fakturę</span>
          </label>

          {wantInvoice && (
            <div className="mt-3 grid gap-3">
              <input
                className="rounded-lg border p-2 bg-white dark:bg-[#0f172a] dark:border-white/10 dark:text-white dark:placeholder-white/50"
                type="text"
                placeholder="Nazwa firmy / Imię i nazwisko (na fakturze) *"
                value={invoice.companyName}
                onChange={(e) => setInvoice((iv) => ({ ...iv, companyName: e.target.value }))}
              />
              <input
                className="rounded-lg border p-2 bg-white dark:bg-[#0f172a] dark:border-white/10 dark:text-white dark:placeholder-white/50"
                type="text"
                placeholder="NIP (opcjonalnie, 10 cyfr)"
                value={invoice.nip}
                onChange={(e) => setInvoice((iv) => ({ ...iv, nip: e.target.value }))}
              />
              <input
                className="rounded-lg border p-2 bg-white dark:bg-[#0f172a] dark:border-white/10 dark:text-white dark:placeholder-white/50"
                type="email"
                placeholder="E-mail do faktury (opcjonalnie)"
                value={invoice.email}
                onChange={(e) => setInvoice((iv) => ({ ...iv, email: e.target.value }))}
              />
              <input
                className="rounded-lg border p-2 bg-white dark:bg-[#0f172a] dark:border-white/10 dark:text-white dark:placeholder-white/50"
                type="text"
                placeholder="Ulica i numer *"
                value={invoice.addr1}
                onChange={(e) => setInvoice((iv) => ({ ...iv, addr1: e.target.value }))}
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  className="rounded-lg border p-2 bg-white dark:bg-[#0f172a] dark:border-white/10 dark:text-white dark:placeholder-white/50"
                  type="text"
                  placeholder="Miasto *"
                  value={invoice.city}
                  onChange={(e) => setInvoice((iv) => ({ ...iv, city: e.target.value }))}
                />
                <input
                  className="rounded-lg border p-2 bg-white dark:bg-[#0f172a] dark:border-white/10 dark:text-white dark:placeholder-white/50"
                  type="text"
                  placeholder="Kod pocztowy *"
                  value={invoice.zip}
                  onChange={(e) => setInvoice((iv) => ({ ...iv, zip: e.target.value }))}
                />
              </div>
              <input
                className="rounded-lg border p-2 bg-white dark:bg-[#0f172a] dark:border-white/10 dark:text-white dark:placeholder-white/50"
                type="text"
                placeholder="Kraj"
                value={invoice.country}
                onChange={(e) => setInvoice((iv) => ({ ...iv, country: e.target.value }))}
              />
              <div className="text-xs text-gray-600 dark:text-white/60">* pola wymagane do wystawienia faktury</div>
            </div>
          )}
        </div>

        {/* Submit */}
        {error && <div className="text-red-600 dark:text-red-400 text-sm mb-4">{error}</div>}
        <form onSubmit={handleOrder} className="flex flex-col gap-4">
          <button
            type="submit"
            disabled={submitting}
            className="bg-gold text-mainRed px-8 py-2 rounded-xl font-bold hover:bg-mainRed hover:text-gold transition disabled:opacity-60"
          >
            {submitting ? "Przetwarzanie..." : "Złóż zamówienie"}
          </button>

          <Link to="/cart" className="text-center text-mainRed dark:text-gold underline hover:text-gold dark:hover:text-white transition">
            ← Wróć do koszyka
          </Link>
        </form>
      </div>
    </>
  );
}
