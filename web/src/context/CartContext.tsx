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

const CartContext = createContext<any>(null);

// Konfiguracja kosztów dostawy (w zł)
export const SHIPPING_BASE = 15;
export const FREE_SHIPPING_FROM = 200;

// API base
const API_URL =
  ((import.meta as any)?.env?.VITE_API_URL as string) || "http://localhost:4000";

// ===== helpers (fallback – gdy API niedostępne) =====
// Uwaga: ceny w koszyku trzymasz w zł (liczby całkowite).
function getDiscountValueFallback(subtotalZl: number, code: string) {
  if (!code) return 0;
  const c = code.trim().toUpperCase();

  // % kupony
  if (c === "ALL10" || c === "GIFT10" || c === "PROMO10")
    return Math.round(subtotalZl * 0.1);

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

// ===== safe JSON utils =====
const safeGet = <T,>(key: string, fallback: T) => {
  try {
    return (JSON.parse(localStorage.getItem(key) || "null") ?? fallback) as T;
  } catch {
    return fallback;
  }
};
const safeSet = (key: string, val: any) => {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {}
};

// ===== types =====
interface CartItem {
  slug: string;
  name: string;
  price: number; // w zł (liczby całkowite)
  quantity: number;
}
interface AddOpts {
  openDrawer?: boolean;
}

type ServerValidateResponse = {
  ok: boolean;
  discount: number; // grosze
  code?: string;
  type?: "PERCENT" | "FIXED";
  amount?: number; // grosze
  percentage?: number | null;
};

interface CartContextProps {
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
  discount: number; // zł (to co realnie obniża sumę)
  applyCoupon: (
    code: string,
    userId?: string
  ) => Promise<ServerValidateResponse>;
  clearCoupon: () => void;

  subtotal: number; // zł
  shipping: number; // zł
  total: number; // zł
  afterDiscount: number; // zł

  SHIPPING_BASE: number;
  FREE_SHIPPING_FROM: number;
  hasFreeShipping: (sumAfterDiscountZl: number) => boolean;
}

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
  // serverDiscount przechowujemy w ZŁ (bo koszyk liczysz w zł)
  const [serverDiscount, setServerDiscount] = useState<number>(() =>
    safeGet<number>("cart:discountValue", 0)
  );

  const [drawerOpen, setDrawerOpen] = useState(false);
  const lastActionRef = useRef<LastAction>(null);

  // ===== persist =====
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

  // ===== Handlery koszyka =====
  const addToCart = useCallback((product: CartItem, opts?: AddOpts) => {
    setCart((prev) => {
      const exists = prev.find((i) => i.slug === product.slug);
      const updated = exists
        ? prev.map((i) =>
            i.slug === product.slug ? { ...i, quantity: i.quantity + 1 } : i
          )
        : [...prev, { ...product, quantity: 1 }];
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

  // ===== Suma + koszty =====
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

  // ===== walidacja po serwerze z łańcuchem fallbacków =====
  async function validateViaServer(code: string, cartTotalZl: number, userId?: string) {
    const cartTotalCents = Math.round(cartTotalZl * 100);

    // 1) Publiczny endpoint (jeśli istnieje po Twojej stronie API)
    try {
      const r = await fetch(`${API_URL}/api/coupons/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code, cartTotal: cartTotalCents, userId }),
      });

      if (r.ok) {
        const data = (await r.json()) as ServerValidateResponse;
        return { data, source: "public" as const };
      }

      // 404/405 – przełączamy się na admin preview
      if (r.status === 404 || r.status === 405) {
        throw new Error("public-endpoint-missing");
      }

      // inne błędy – przekaż informację
      const msg = await r.text().catch(() => "Validation failed");
      throw new Error(msg || "Validation failed");
    } catch (err: any) {
      // przechodzimy do adminowego tylko dla brakującego public endpointu / braku sieci
      if (
        err?.message === "public-endpoint-missing" ||
        err?.name === "TypeError" /* np. network */
      ) {
        // fall through → admin preview
      } else {
        // inny błąd — pokaż i przerwij
        throw err;
      }
    }

    // 2) Adminowy preview-validate (działa tylko gdy user ma ADMIN cookie)
    try {
      const r = await fetch(`${API_URL}/api/admin/coupons/preview-validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code, cartTotal: cartTotalCents, userId }),
      });

      if (r.ok) {
        const data = (await r.json()) as ServerValidateResponse;
        return { data, source: "admin" as const };
      }

      // brak uprawnień – przejdziemy do fallbacku lokalnego
      if (r.status === 401 || r.status === 403) {
        throw new Error("admin-forbidden");
      }

      // inne błędy – wyrzuć treść
      const msg = await r.text().catch(() => "Preview validation failed");
      throw new Error(msg || "Preview validation failed");
    } catch (err: any) {
      if (err?.message !== "admin-forbidden") {
        // jeśli to nie brak uprawnień – przekaż błąd użytkownikowi
        // (np. "Kupon wygasł", "Za niski koszyk", itp. – backend zwraca 400 z tekstem)
        throw err;
      }
      // admin-forbidden -> spadamy do fallbacku lokalnego
    }

    // 3) Fallback lokalny – bez żądania do API
    const discountZl = getDiscountValueFallback(cartTotalZl, code);
    const resp: ServerValidateResponse = {
      ok: true,
      discount: discountZl * 100, // zwrot w groszach dla spójności typu
      code,
      type: null as any,
      amount: null as any,
      percentage: null,
    };
    return { data: resp, source: "local" as const };
  }

  // ===== Kupony – API (grosze <-> zł) =====
  async function applyCoupon(code: string, userId?: string) {
    const clean = String(code || "").trim();
    if (!clean) throw new Error("Podaj kod");

    const { data, source } = await validateViaServer(clean, subtotal, userId);

    // discount z backendu (lub lokalnego fallbacku) jest w GROSZACH
    const discountZl = Math.round(Number(data.discount || 0) / 100);

    // w UI przechowujemy w zł
    setAppliedCoupon(clean.toUpperCase());
    setServerDiscount(Math.min(discountZl, subtotal));
    setDiscountCode(clean.toUpperCase());

    if (source !== "public") {
      // podpowiedź w devtools, dlaczego nie uderzyło w publiczny endpoint
      // (nie wpływa na UI)
      console.debug(`[Cart] coupon validated via ${source} fallback`);
    }

    return data;
  }

  const clearCoupon = useCallback(() => {
    setAppliedCoupon(null);
    setServerDiscount(0);
    // discountCode (pole input) nie czyszczę – lepszy UX
  }, []);

  // ===== Drawer controls =====
  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const toggleDrawer = useCallback(() => setDrawerOpen((v) => !v), []);

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
      hasFreeShipping: (sum) => hasFreeShippingAfterDiscount(sum, appliedCoupon || discountCode),
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

export function useCart() {
  return useContext(CartContext) as CartContextProps;
}
