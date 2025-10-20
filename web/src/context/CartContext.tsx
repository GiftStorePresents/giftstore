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

/* =========================
   Konfiguracja i stałe
   ========================= */
export const SHIPPING_BASE = 15;          // zł
export const FREE_SHIPPING_FROM = 200;    // zł

const API_URL =
  ((import.meta as any)?.env?.VITE_API_URL as string) || "http://localhost:4000";

/* =========================
   Safe JSON utils
   ========================= */
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

/* =========================
   Typy
   ========================= */
export interface CartItem {
  slug: string;
  name: string;
  /** Cena w zł (liczby całkowite lub z groszami – projekt trzyma w zł) */
  price: number;
  quantity: number;
}

export interface AddOpts {
  openDrawer?: boolean;
}

export type ServerValidateResponse = {
  ok: boolean;
  /** Rabat w groszach (format backendowy) */
  discount: number;
  code?: string;
  type?: "PERCENT" | "FIXED" | null;
  /** Kwota rabatu w groszach (dla FIXED) */
  amount?: number | null;
  /** Procent (dla PERCENT) */
  percentage?: number | null;
};

export interface CartContextProps {
  cart: CartItem[];
  addToCart: (product: CartItem, opts?: AddOpts) => void;
  removeFromCart: (slug: string) => void;
  updateQuantity: (slug: string, quantity: number) => void;
  clearCart: () => void;

  drawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;

  discountCode: string;
  setDiscountCode: (code: string) => void;
  appliedCoupon: string | null;
  /** Kwota rabatu w zł (już po konwersji z groszy) */
  discount: number;
  applyCoupon: (code: string, userId?: string) => Promise<ServerValidateResponse>;
  clearCoupon: () => void;

  /** Suma pozycji (zł, przed rabatem i dostawą) */
  subtotal: number;
  /** Koszt dostawy (zł) – 0 dla darmowej */
  shipping: number;
  /** Suma końcowa (zł) po rabacie i z dostawą */
  total: number;
  /** Suma po rabacie, przed dostawą (zł) */
  afterDiscount: number;

  SHIPPING_BASE: number;
  FREE_SHIPPING_FROM: number;
  hasFreeShipping: (sumAfterDiscountZl: number) => boolean;
}

/* =========================
   Fallback kuponów (lokalnie)
   ========================= */
function getDiscountValueFallback(subtotalZl: number, code: string) {
  if (!code) return 0;
  const c = code.trim().toUpperCase();

  // % kupony
  if (c === "ALL10" || c === "GIFT10" || c === "PROMO10") {
    return Math.round(subtotalZl * 0.1);
  }

  // Kwotowe kupony
  if (c === "WELCOME5") return Math.min(5, subtotalZl); // 5 zł, ale nie więcej niż suma
  if (c === "PROMO40") return Math.min(40, subtotalZl); // max 40 zł

  // FREESHIP nie daje rabatu kwotowego (tylko dostawa = 0)
  return 0;
}

function hasFreeShippingAfterDiscount(sumAfterDiscountZl: number, code: string | null) {
  const c = (code || "").trim().toUpperCase();
  return sumAfterDiscountZl >= FREE_SHIPPING_FROM || c === "FREESHIP";
}

/* =========================
   Context
   ========================= */
const CartContext = createContext<CartContextProps | null>(null);

type LastAction = "add" | "update" | "clear" | null;

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartItem[]>(() =>
    safeGet<CartItem[]>("cart:items", [])
  );
  const [discountCode, setDiscountCode] = useState<string>(() =>
    safeGet<string>("cart:discountCode", "")
  );
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(() =>
    safeGet<string | null>("cart:appliedCoupon", null)
  );
  /** Rabat po walidacji serwerowej, przechowywany w zł (zgodnie z UI) */
  const [serverDiscount, setServerDiscount] = useState<number>(() =>
    safeGet<number>("cart:discountValue", 0)
  );

  const [drawerOpen, setDrawerOpen] = useState(false);
  const lastActionRef = useRef<LastAction>(null);

  /* ===== Persist ===== */
  useEffect(() => {
    safeSet("cart:items", cart);
  }, [cart]);

  useEffect(() => {
    safeSet("cart:discountCode", discountCode);
  }, [discountCode]);

  useEffect(() => {
    safeSet("cart:appliedCoupon", appliedCoupon);
    safeSet("cart:discountValue", serverDiscount);
  }, [appliedCoupon, serverDiscount]);

  /* ===== Handlery koszyka ===== */
  const addToCart = useCallback((product: CartItem, opts?: AddOpts) => {
    setCart((prev) => {
      const exists = prev.find((i) => i.slug === product.slug);
      const updated = exists
        ? prev.map((i) =>
            i.slug === product.slug ? { ...i, quantity: i.quantity + 1 } : i
          )
        : [...prev, { ...product, quantity: product.quantity ?? 1 }];
      return updated;
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

  // Emituj event DOPIERO PO renderze
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

  /* ===== Suma + koszty ===== */
  const subtotal = useMemo(
    () => cart.reduce((s, i) => s + i.price * i.quantity, 0),
    [cart]
  );

  const computedDiscount = useMemo(() => {
    const byServer = Math.min(serverDiscount || 0, subtotal);
    if (byServer > 0) return byServer;
    return getDiscountValueFallback(subtotal, discountCode);
  }, [serverDiscount, subtotal, discountCode]);

  const afterDiscount = useMemo(
    () => Math.max(0, subtotal - computedDiscount),
    [subtotal, computedDiscount]
  );

  const shipping = useMemo(() => {
    if (cart.length === 0) return 0;
    return hasFreeShippingAfterDiscount(afterDiscount, appliedCoupon || discountCode)
      ? 0
      : SHIPPING_BASE;
  }, [cart.length, afterDiscount, appliedCoupon, discountCode]);

  const total = useMemo(() => afterDiscount + shipping, [afterDiscount, shipping]);

  /* ===== Walidacja kuponu (z łańcuchem fallbacków) ===== */
  async function validateViaServer(
    code: string,
    cartTotalZl: number,
    userId?: string
  ): Promise<{ data: ServerValidateResponse; source: "public" | "admin" | "local" }> {
    const cartTotalCents = Math.round(cartTotalZl * 100);

    // 1) Publiczny endpoint
    try {
      const r = await fetch(`${API_URL}/api/coupons/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code, cartTotal: cartTotalCents, userId }),
      });

      if (r.ok) {
        const data = (await r.json()) as ServerValidateResponse;
        return { data, source: "public" };
      }

      if (r.status === 404 || r.status === 405) {
        throw new Error("public-endpoint-missing");
      }

      const msg = await r.text().catch(() => "Validation failed");
      throw new Error(msg || "Validation failed");
    } catch (err: any) {
      if (err?.message === "public-endpoint-missing" || err?.name === "TypeError") {
        // lecimy do admin preview
      } else {
        throw err;
      }
    }

    // 2) Admin preview (wymaga ADMIN cookie)
    try {
      const r = await fetch(`${API_URL}/api/admin/coupons/preview-validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code, cartTotal: cartTotalCents, userId }),
      });

      if (r.ok) {
        const data = (await r.json()) as ServerValidateResponse;
        return { data, source: "admin" };
      }

      if (r.status === 401 || r.status === 403) {
        throw new Error("admin-forbidden");
      }

      const msg = await r.text().catch(() => "Preview validation failed");
      throw new Error(msg || "Preview validation failed");
    } catch (err: any) {
      if (err?.message !== "admin-forbidden") {
        throw err;
      }
      // brak uprawnień → fallback lokalny
    }

    // 3) Fallback lokalny
    const discountZl = getDiscountValueFallback(cartTotalZl, code);
    const resp: ServerValidateResponse = {
      ok: true,
      discount: discountZl * 100, // grosze
      code,
      type: null,
      amount: null,
      percentage: null,
    };
    return { data: resp, source: "local" };
  }

  async function applyCoupon(code: string, userId?: string): Promise<ServerValidateResponse> {
    const clean = String(code || "").trim();
    if (!clean) throw new Error("Podaj kod");

    const { data, source } = await validateViaServer(clean, subtotal, userId);

    // discount z backendu (lub lokalnego fallbacku) jest w GROSZACH → konwersja do zł
    const discountZl = Math.round(Number(data.discount || 0) / 100);

    setAppliedCoupon(clean.toUpperCase());
    setServerDiscount(Math.min(discountZl, subtotal));
    setDiscountCode(clean.toUpperCase());

    if (source !== "public") {
      console.debug(`[Cart] coupon validated via ${source} fallback`);
    }

    return data;
  }

  const clearCoupon = useCallback(() => {
    setAppliedCoupon(null);
    setServerDiscount(0);
    // discountCode zostawiamy w input – lepszy UX
  }, []);

  /* ===== Drawer controls ===== */
  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const toggleDrawer = useCallback(() => setDrawerOpen((v) => !v), []);

  /* ===== Value ===== */
  const value: CartContextProps = useMemo(
    () => ({
      cart,
      addToCart,
      removeFromCart,
      updateQuantity,
      clearCart,

      drawerOpen,
      openDrawer,
      closeDrawer,
      toggleDrawer,

      discountCode,
      setDiscountCode,

      appliedCoupon,
      discount: computedDiscount,
      applyCoupon,
      clearCoupon,

      subtotal,
      shipping,
      total,
      afterDiscount,

      SHIPPING_BASE,
      FREE_SHIPPING_FROM,
      hasFreeShipping: (sum) =>
        hasFreeShippingAfterDiscount(sum, appliedCoupon || discountCode),
    }),
    [
      cart,
      addToCart,
      removeFromCart,
      updateQuantity,
      clearCart,
      drawerOpen,
      openDrawer,
      closeDrawer,
      toggleDrawer,
      discountCode,
      appliedCoupon,
      computedDiscount,
      subtotal,
      shipping,
      total,
      afterDiscount,
    ]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

/* =========================
   Hook
   ========================= */
export function useCart(): CartContextProps {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error("useCart must be used within <CartProvider>");
  }
  return ctx;
}
