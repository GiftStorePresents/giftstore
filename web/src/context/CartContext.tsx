// src/context/CartContext.tsx
import React, {
  createContext,
  useContext,
  useMemo,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from "react";

/* =======================================================================================
 *  CONFIG: thresholds, prices, API
 * ======================================================================================= */
export const SHIPPING_BASE = 15;        // zł – fallback kuriera
export const FREE_SHIPPING_FROM = 200;  // zł – darmowa wysyłka od
export const COD_SURCHARGE = 5;         // zł – dopłata „za pobraniem”

const API_URL =
  ((import.meta as any)?.env?.VITE_API_URL as string) || "http://localhost:4000";

/** Cennik dostaw (spójny z CartPage / CheckoutPage) */
export const SHIPPING_COSTS = {
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
  point: {
    orlen: 12.29,
    dpd_pickup: 12.16,
    pocztex_punkt: 12.66,
  },
  express: 17, // „Warszawa 24h”
} as const;

/* =======================================================================================
 *  TYPES
 * ======================================================================================= */
export interface CartItem {
  slug: string;
  price: number;      // zł
  quantity: number;
  name?: string;
  image?: string;
}

export type ShippingMethod = "standard" | "locker" | "point" | "express" | "pickup";
export type ShippingCarrier =
  | "dpd" | "dhl" | "ups" | "fedex" | "gls" | "inpost_kurier" | "pocztex"
  | "inpost" | "dhl_box" | "pocztex_automat"
  | "orlen" | "dpd_pickup" | "pocztex_punkt";

type CourierCarrier = keyof typeof SHIPPING_COSTS.courier;
type LockerCarrier  = keyof typeof SHIPPING_COSTS.locker;
type PointCarrier   = keyof typeof SHIPPING_COSTS.point;
type AnyCarrier = CourierCarrier | LockerCarrier | PointCarrier | "" | "express" | "pickup";

export type PaymentMethod = "online" | "blik" | "cod";

export interface Address {
  addr1: string;
  city: string;
  zip: string;
  country: string; // np. "PL"
}
export interface LockerSelection { code: string; name: string; }
export interface PickupSelection { code: string; name: string; }

export interface ShippingState {
  method: ShippingMethod;
  carrier: AnyCarrier;
  locker: LockerSelection;
  pickupPoint: PickupSelection;
  address: Address;
}

export type ServerValidateResponse = {
  ok: boolean;
  discount: number; // GROSZE
  code?: string;
  type?: "PERCENT" | "FIXED" | null;
  amount?: number | null;
  percentage?: number | null;
};

type LastAction = "add" | "update" | "clear" | null;

/** Odpowiedź dla helpera syncCartWithStock (na potrzeby toastów/UI) */
export type SyncCartResult = {
  changed: boolean;
  removed: string[]; // nazwy/slug pozycji usuniętych
  adjusted: Array<{ slug: string; from: number; to: number }>; // ilości skorygowane
};

/* =======================================================================================
 *  CONTEXT API
 * ======================================================================================= */
export interface CartContextProps {
  // Items
  cart: CartItem[];
  addToCart: (product: CartItem, opts?: { openDrawer?: boolean }) => void;
  removeFromCart: (slug: string) => void;
  updateQuantity: (slug: string, quantity: number) => void;
  clearCart: () => void;

  // Coupon
  discountCode: string;
  setDiscountCode: (code: string) => void;
  appliedCoupon: string | null;
  discount: number; // zł
  applyCoupon: (code: string, userId?: string) => Promise<ServerValidateResponse>;
  clearCoupon: () => void;

  // Shipping (nowy model)
  shipping: ShippingState;
  setShippingMethod: (method: ShippingMethod) => void;
  setShippingCarrier: (carrier: AnyCarrier) => void;
  setLocker: (sel: Partial<LockerSelection>) => void;
  setPickupPoint: (sel: Partial<PickupSelection>) => void;
  setAddress: (addr: Partial<Address>) => void;

  // Payment
  paymentMethod: PaymentMethod;
  setPaymentMethod: (m: PaymentMethod) => void;

  // Totals
  subtotal: number;          // zł
  afterDiscount: number;     // zł
  shippingCost: number;      // zł
  paymentSurcharge: number;  // zł
  total: number;             // zł
  hasFreeShipping: (sumAfterDiscountZl: number) => boolean;

  // Drawer
  drawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;

  // Aliasy kompatybilności (dla starszych komponentów)
  prefShippingMethod: ShippingMethod;
  setPrefShippingMethod: (m: ShippingMethod) => void;
  prefShippingCarrier: ShippingCarrier | "";
  setPrefShippingCarrier: (c: ShippingCarrier | "") => void;
  prefPaymentMethod: PaymentMethod;
  setPrefPaymentMethod: (p: PaymentMethod) => void;

  // Stałe dla UI
  SHIPPING_BASE: number;
  FREE_SHIPPING_FROM: number;

  // NEW: weryfikacja stanów i korekta koszyka
  syncCartWithStock: () => Promise<SyncCartResult>;
}

/* =======================================================================================
 *  safe localStorage
 * ======================================================================================= */
const safeGet = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return (raw ? JSON.parse(raw) : fallback) as T;
  } catch {
    return fallback;
  }
};
const safeSet = (key: string, val: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {}
};

/* =======================================================================================
 *  Helper: koszt dostawy
 * ======================================================================================= */
function computeShippingCost(s: ShippingState, afterDiscountZl: number): number {
  if (s.method === "pickup") return 0;
  if (afterDiscountZl >= FREE_SHIPPING_FROM) return 0;

  if (s.method === "express") return SHIPPING_COSTS.express;
  if (s.method === "standard") {
    const key = (s.carrier || "dpd") as CourierCarrier;
    return SHIPPING_COSTS.courier[key] ?? SHIPPING_BASE;
  }
  if (s.method === "locker") {
    const key = (s.carrier || "inpost") as LockerCarrier;
    return SHIPPING_COSTS.locker[key] ?? SHIPPING_COSTS.locker.inpost;
  }
  if (s.method === "point") {
    const key = (s.carrier || "orlen") as PointCarrier;
    return SHIPPING_COSTS.point[key] ?? 12.99;
  }
  return SHIPPING_BASE;
}

/* =======================================================================================
 *  CONTEXT
 * ======================================================================================= */
const CartContext = createContext<CartContextProps | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  /* -------- Items -------- */
  const [cart, setCart] = useState<CartItem[]>(() =>
    safeGet<CartItem[]>("cart:items", [])
  );

  /* -------- Coupon -------- */
  const [discountCode, setDiscountCode] = useState<string>(() =>
    safeGet<string>("cart:discountCode", "")
  );
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(() =>
    safeGet<string | null>("cart:appliedCoupon", null)
  );
  /** Przechowywany w zł po konwersji z groszy */
  const [serverDiscount, setServerDiscount] = useState<number>(() =>
    safeGet<number>("cart:discountValue", 0)
  );

  /* -------- Drawer -------- */
  const [drawerOpen, setDrawerOpen] = useState(false);
  const lastActionRef = useRef<LastAction>(null);

  /* -------- Shipping -------- */
  const [shipping, setShipping] = useState<ShippingState>(() =>
    safeGet<ShippingState>("cart:shipping", {
      method: "standard",
      carrier: "dpd",
      locker: { code: "", name: "" },
      pickupPoint: { code: "", name: "" },
      address: { addr1: "", city: "", zip: "", country: "PL" },
    })
  );

  /* -------- Payment -------- */
  const [paymentMethod, _setPaymentMethod] = useState<PaymentMethod>(() =>
    safeGet<PaymentMethod>("cart:payment", "online")
  );

  /* -------- Persist -------- */
  useEffect(() => safeSet("cart:items", cart), [cart]);
  useEffect(() => safeSet("cart:discountCode", discountCode), [discountCode]);
  useEffect(() => {
    safeSet("cart:appliedCoupon", appliedCoupon);
    safeSet("cart:discountValue", serverDiscount);
  }, [appliedCoupon, serverDiscount]);
  useEffect(() => safeSet("cart:shipping", shipping), [shipping]);
  useEffect(() => safeSet("cart:payment", paymentMethod), [paymentMethod]);

  /* -------- Cart handlers -------- */
  const addToCart = useCallback((product: CartItem, opts?: { openDrawer?: boolean }) => {
    setCart((prev) => {
      const found = prev.find((i) => i.slug === product.slug);
      if (found) {
        return prev.map((i) =>
          i.slug === product.slug
            ? { ...i, quantity: i.quantity + (product.quantity ?? 1) }
            : i
        );
      }
      return [...prev, { ...product, quantity: product.quantity ?? 1 }];
    });
    lastActionRef.current = "add";
    if (opts?.openDrawer) setDrawerOpen(true);
  }, []);

  const removeFromCart = useCallback((slug: string) => {
    setCart((prev) => prev.filter((i) => i.slug !== slug));
    lastActionRef.current = "update";
  }, []);

  const updateQuantity = useCallback((slug: string, quantity: number) => {
    setCart((prev) =>
      prev.map((i) =>
        i.slug === slug ? { ...i, quantity: Math.max(1, quantity) } : i
      )
    );
    lastActionRef.current = "update";
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
    lastActionRef.current = "clear";
  }, []);

  // Emit events after render (badges etc.)
  useEffect(() => {
    const act = lastActionRef.current;
    if (!act) return;
    lastActionRef.current = null;
    requestAnimationFrame(() => {
      if (act === "add") window.dispatchEvent(new Event("cart:add"));
      else if (act === "update") window.dispatchEvent(new Event("cart:update"));
      else if (act === "clear") window.dispatchEvent(new Event("cart:clear"));
    });
  }, [cart]);

  /* -------- NEW: auto-weryfikacja stanów i korekta koszyka -------- */
  const syncCartWithStock = useCallback(async (): Promise<SyncCartResult> => {
    try {
      if (!cart.length) return { changed: false, removed: [], adjusted: [] };

      const slugs = cart.map((i) => i.slug).join(",");
      const url = `${API_URL}/api/products/availability?slugs=${encodeURIComponent(slugs)}`;

      const r = await fetch(url, { credentials: "include" });

      // ŁAGODNA OBSŁUGA 404/500 — brak endpointu lub chwilowy błąd = „bez zmian”
      if (!r.ok) {
        return { changed: false, removed: [], adjusted: [] };
      }

      const data = (await r.json()) as Array<{ slug: string; stock: number }>;
      const bySlug = new Map<string, number>(data.map((d) => [d.slug, d.stock]));

      let changed = false;
      const removed: string[] = [];
      const adjusted: Array<{ slug: string; from: number; to: number }> = [];

      // najpierw usuwamy wyprzedane
      for (const item of cart) {
        const stock = bySlug.get(item.slug);
        if (typeof stock !== "number") continue;
        if (stock <= 0) {
          removeFromCart(item.slug);
          removed.push(item.name || item.slug);
          changed = true;
        }
      }
      // potem korygujemy ilości
      for (const item of cart) {
        const stock = bySlug.get(item.slug);
        if (typeof stock !== "number" || stock <= 0) continue;
        if (item.quantity > stock) {
          updateQuantity(item.slug, stock);
          adjusted.push({ slug: item.slug, from: item.quantity, to: stock });
          changed = true;
        }
      }

      return { changed, removed, adjusted };
    } catch {
      // sieciówka padła – nie przeszkadzamy użytkownikowi
      return { changed: false, removed: [], adjusted: [] };
    }
  }, [cart, removeFromCart, updateQuantity]);

  /* -------- Shipping mutators with EARLY RETURN guards -------- */
  const setShippingMethod = useCallback((method: ShippingMethod) => {
    setShipping((s) => {
      if (s.method === method) return s; // nothing changes

      let carrier = s.carrier;
      const isCourier = ["dpd","dhl","ups","fedex","gls","inpost_kurier","pocztex"] as const;
      const isLocker  = ["inpost","dhl_box","pocztex_automat"] as const;
      const isPoint   = ["orlen","dpd_pickup","pocztex_punkt"] as const;

      if (method === "standard" && !isCourier.includes(String(carrier) as any)) carrier = "dpd";
      if (method === "locker"   && !isLocker.includes(String(carrier) as any))  carrier = "inpost";
      if (method === "point"    && !isPoint.includes(String(carrier) as any))   carrier = "orlen";
      if (method === "express" || method === "pickup") carrier = "";

      return { ...s, method, carrier };
    });
  }, []);

  const setShippingCarrier = useCallback((carrier: AnyCarrier) => {
    setShipping((s) => (s.carrier === carrier ? s : { ...s, carrier }));
  }, []);

  const setAddress = useCallback((addr: Partial<Address>) => {
    setShipping((s) => {
      const next = { ...s.address, ...addr };
      if (
        next.addr1 === s.address.addr1 &&
        next.city === s.address.city &&
        next.zip === s.address.zip &&
        next.country === s.address.country
      ) return s; // no real change
      return { ...s, address: next };
    });
  }, []);

  const setLocker = useCallback((sel: Partial<LockerSelection>) => {
    setShipping((s) => {
      const next = { ...s.locker, ...sel };
      if (next.code === s.locker.code && next.name === s.locker.name) return s;
      return { ...s, locker: next };
    });
  }, []);

  const setPickupPoint = useCallback((sel: Partial<PickupSelection>) => {
    setShipping((s) => {
      const next = { ...s.pickupPoint, ...sel };
      if (next.code === s.pickupPoint.code && next.name === s.pickupPoint.name) return s;
      return { ...s, pickupPoint: next };
    });
  }, []);

  /* -------- Payment mutator with guard -------- */
  const setPaymentMethod = useCallback((m: PaymentMethod) => {
    _setPaymentMethod((prev) => (prev === m ? prev : m));
  }, []);

  /* -------- Totals -------- */
  const subtotal = useMemo(
    () => cart.reduce((s, i) => s + i.price * i.quantity, 0),
    [cart]
  );

  const discount = useMemo(
    () => Math.min(serverDiscount || 0, subtotal),
    [serverDiscount, subtotal]
  );

  const afterDiscount = useMemo(
    () => Math.max(0, subtotal - discount),
    [subtotal, discount]
  );

  const hasFreeShipping = useCallback(
    (sumAfterDiscountZl: number) => sumAfterDiscountZl >= FREE_SHIPPING_FROM,
    []
  );

  const shippingCost = useMemo(
    () => (cart.length === 0 ? 0 : computeShippingCost(shipping, afterDiscount)),
    [cart.length, shipping, afterDiscount]
  );

  const paymentSurcharge = useMemo(
    () => (paymentMethod === "cod" ? COD_SURCHARGE : 0),
    [paymentMethod]
  );

  const total = useMemo(
    () => afterDiscount + shippingCost + paymentSurcharge,
    [afterDiscount, shippingCost, paymentSurcharge]
  );

  /* -------- Coupon validate (public -> admin preview fallback) -------- */
  async function applyCoupon(code: string, userId?: string): Promise<ServerValidateResponse> {
    const clean = String(code || "").trim();
    if (!clean) throw new Error("Podaj kod rabatowy");

    const cartTotalCents = Math.round(subtotal * 100);

    // 1) publiczny endpoint
    try {
      const r = await fetch(`${API_URL}/api/coupons/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code: clean, cartTotal: cartTotalCents, userId }),
      });
      if (!r.ok) {
        const msg = await r.text().catch(() => "");
        throw new Error(msg || `HTTP ${r.status}`);
      }
      const data = (await r.json()) as ServerValidateResponse;
      const discountZl = Math.round((data.discount || 0) / 100);
      setAppliedCoupon(clean.toUpperCase());
      setDiscountCode(clean.toUpperCase());
      setServerDiscount(Math.min(discountZl, subtotal));
      return data;
    } catch {
      // 2) admin preview fallback
      const r = await fetch(`${API_URL}/api/admin/coupons/preview-validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code: clean, cartTotal: cartTotalCents, userId }),
      });
      if (!r.ok) {
        const msg = await r.text().catch(() => "");
        throw new Error(msg || "Nieprawidłowy kod rabatowy.");
      }
      const data = (await r.json()) as ServerValidateResponse;
      const discountZl = Math.round((data.discount || 0) / 100);
      setAppliedCoupon(clean.toUpperCase());
      setDiscountCode(clean.toUpperCase());
      setServerDiscount(Math.min(discountZl, subtotal));
      return data;
    }
  }

  const clearCoupon = useCallback(() => {
    setAppliedCoupon(null);
    setServerDiscount(0);
    // discountCode zostawiamy w input dla lepszego UX
  }, []);

  /* -------- Drawer -------- */
  const openDrawer  = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const toggleDrawer = useCallback(() => setDrawerOpen((v) => !v), []);

  /* -------- VALUE -------- */
  const value: CartContextProps = useMemo(
    () => ({
      // Items
      cart,
      addToCart,
      removeFromCart,
      updateQuantity,
      clearCart,

      // Coupon
      discountCode,
      setDiscountCode,
      appliedCoupon,
      discount,
      applyCoupon,
      clearCoupon,

      // Shipping
      shipping,
      setShippingMethod,
      setShippingCarrier,
      setLocker,
      setPickupPoint,
      setAddress,

      // Payment
      paymentMethod,
      setPaymentMethod,

      // Totals
      subtotal,
      afterDiscount,
      shippingCost,
      paymentSurcharge,
      total,
      hasFreeShipping,

      // Drawer
      drawerOpen,
      openDrawer,
      closeDrawer,
      toggleDrawer,

      // Aliasy kompatybilności
      prefShippingMethod: shipping.method,
      setPrefShippingMethod: setShippingMethod,
      prefShippingCarrier: (shipping.carrier as ShippingCarrier) || "",
      setPrefShippingCarrier: (c: ShippingCarrier | "") =>
        setShippingCarrier((c || "") as AnyCarrier),
      prefPaymentMethod: paymentMethod,
      setPrefPaymentMethod: setPaymentMethod,

      // Stałe
      SHIPPING_BASE,
      FREE_SHIPPING_FROM,

      // NEW
      syncCartWithStock,
    }),
    [
      // Items
      cart,
      addToCart,
      removeFromCart,
      updateQuantity,
      clearCart,
      // Coupon
      discountCode,
      appliedCoupon,
      discount,
      applyCoupon,
      clearCoupon,
      // Shipping
      shipping,
      setShippingMethod,
      setShippingCarrier,
      setLocker,
      setPickupPoint,
      setAddress,
      // Payment
      paymentMethod,
      // Totals
      subtotal,
      afterDiscount,
      shippingCost,
      paymentSurcharge,
      total,
      // Drawer
      drawerOpen,
      openDrawer,
      closeDrawer,
      toggleDrawer,
      // NEW
      syncCartWithStock,
    ]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

/* =======================================================================================
 *  HOOK
 * ======================================================================================= */
export function useCart(): CartContextProps {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within <CartProvider>");
  return ctx;
}
