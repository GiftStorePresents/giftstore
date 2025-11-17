// src/api.ts

// ===== Typy wspólne =====
export type User = {
  id: string;
  email: string;
  name?: string | null;
  role?: "USER" | "ADMIN";
};

export type AuthResponse =
  | { user: User }
  | { mfaRequired: true; user?: User };

export type MeResponse = {
  user: User | null;
  authenticated: boolean;
};

export type PagedProducts = {
  items: any[];
  total: number;
  page: number;
  pages: number;
};

// ----- Admin: Media/Produkty -----
export type AdminMedia = {
  id: string;
  url: string;
  kind: "image" | "video" | "spin360";
  position: number;
};

/** 🔹 Rabat na wariancie (opcjonalny) */
export type VariantDiscountFields = {
  discountActive?: boolean;
  salePriceCents?: number | null;
  showDiscountPercent?: boolean;
  /** ISO string lub null – koniec promocji */
  discountUntil?: string | null;
  /** Alias – jeśli backend używa innej nazwy */
  discountEndAt?: string | null;
};

export type AdminProductListItem = {
  id: string;
  name: string;
  slug: string;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  featured?: boolean;
  variants: Array<
    {
      id: string;
      priceCents: number;
      stock: number;
    } & VariantDiscountFields
  >;
  media?: AdminMedia[];
};

export type AdminProductFull = AdminProductListItem & {
  description?: string | null;
  brand?: string | null;
  category?: { id: string; name: string; slug: string } | null;
};

// ----- Zamówienia: typy -----
export type OrderStatus =
  | "PENDING"
  | "PAID"
  | "FULFILLED"
  | "CANCELLED"
  | "REFUNDED";

// Widok pozycji (public/my + opcjonalne snapshoty)
export type OrderItemView = {
  qty: number;
  priceCents: number;
  variant?: {
    sku?: string | null;
    priceCents?: number;
    product?: { name?: string; slug?: string; category?: string | null };
  };
  name?: string | null;
  sku?: string | null;
  category?: string | null;
};

export type AdminOrderUser =
  | {
      id: string;
      email: string | null;
      name: string | null;
    }
  | null;

export type AdminOrderListItem = {
  id: string;
  number: string;
  status: OrderStatus;
  totalCents: number;
  createdAt: string;
  user?: AdminOrderUser;
};

export type AdminOrder = AdminOrderListItem & {
  updatedAt: string;
  items?: OrderItemView[];
};

export type AdminOrdersListResponse = {
  items: AdminOrderListItem[];
  total: number;
  page: number;
  pages: number;
};

export type AdminOrderView = {
  id: string;
  number: string;
  status: OrderStatus;
  totalCents: number;
  createdAt: string;
  user?: { id: string; email: string | null; name: string | null } | null;
  items?: OrderItemView[];
};

// ===== 🚀 NOWE: typy do Admin Logs =====
export type AdminLogLevel = "INFO" | "WARN" | "ERROR" | "DEBUG";

export type AdminLog = {
  id: string;
  createdAt: string;
  level: AdminLogLevel;
  action: string;
  userId?: string | null;
  ip?: string | null;
  meta?: any;
  message?: string | null;
};

export type Paged<T> = {
  items: T[];
  total: number;
  page: number;
  pages: number;
};

// ===== CSRF cookie name =====
export const CSRF_COOKIE_NAME = "csrf";

// ===== Ustal bazowy URL API =====
function computeApiBase(): string {
  // >>> ZMIANA: najpierw VITE_API_BASE, potem dla zgodności VITE_API_URL <<<
  const envAny = (import.meta as any)?.env ?? {};
  const viteBase = (envAny.VITE_API_BASE as string | undefined)?.trim();
  if (viteBase) return viteBase.replace(/\/+$/, "");

  const viteUrl = (envAny.VITE_API_URL as string | undefined)?.trim();
  if (viteUrl) return viteUrl.replace(/\/+$/, "");

  // Dev: front na 3000/5173/4173 → API na :4000
  if (typeof window !== "undefined" && window.location) {
    const { origin, hostname, port, protocol } = window.location;
    const isDevHost = hostname === "localhost" || hostname === "127.0.0.1";
    const devPorts = new Set(["3000", "5173", "4173", ""]);
    if (isDevHost && devPorts.has(port || "")) {
      return `${protocol}//${hostname}:4000`;
    }
    return origin.replace(/\/+$/, "");
  }

  return "http://localhost:4000";
}

export const API_BASE: string = computeApiBase();

// ===== Utils =====
export function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(
      `(?:^|; )${name.replace(/([.*+?^${}()|[\\]\\\\])/g, "\\$1")}=([^;]*)`
    )
  );
  return match ? decodeURIComponent(match[1]) : null;
}

function isUnsafeMethod(method?: string) {
  const m = (method || "GET").toUpperCase();
  return ["POST", "PUT", "PATCH", "DELETE"].includes(m);
}

// ===== Helper: bogaty błąd =====
function buildHttpError(res: Response, message?: string, data?: any) {
  const err: any = new Error(message || res.statusText || `HTTP ${res.status}`);
  err.status = res.status;
  err.statusText = res.statusText;
  err.url = (res as any).url || "unknown";
  if (data !== undefined) err.data = data;
  return err;
}

async function throwFromResponse(res: Response): Promise<never> {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    const data = await res.json().catch(() => ({}));
    const msg =
      (typeof (data as any)?.error === "string" && (data as any).error) ||
      (typeof (data as any)?.message === "string" && (data as any).message);
    throw buildHttpError(res, msg, data);
  } else {
    const text = await res.text().catch(() => "");
    throw buildHttpError(res, text);
  }
}

// ===== fetch JSON z CSRF =====
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers as HeadersInit | undefined);

  if (isUnsafeMethod(init?.method)) {
    const csrf = getCookie(CSRF_COOKIE_NAME) || getCookie("XSRF-TOKEN");
    if (csrf && !headers.has("X-CSRF-Token")) {
      headers.set("X-CSRF-Token", csrf);
    }
  }

  const hasBody = init && "body" in init && init.body != null;
  if (hasBody && !(init!.body instanceof FormData)) {
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
  }

  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;

  let res: Response;
  try {
    res = await fetch(url, {
      credentials: "include",
      cache: "no-store",
      redirect: "follow",
      ...init,
      headers,
    });
  } catch (netErr) {
    console.error("[api] network error", url, netErr);
    throw netErr;
  }

  if (!res.ok) {
    try {
      await throwFromResponse(res);
    } catch (e: any) {
      if (e && typeof e === "object" && !e.url) e.url = url;
      console.error("[api] error", url, e);
      throw e;
    }
  }

  if (res.status === 204) return undefined as unknown as T;

  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    const text = await res.text();
    return text as unknown as T;
  }

  return res.json() as Promise<T>;
}

// ===== fetch do uploadu (FormData) z fallbackami =====
async function requestFormWithFallbacks<T>(
  primaryPath: string,
  altPath: string | null,
  buildForm: (fieldName: "file" | "image") => FormData,
  method: "POST" | "PUT" = "POST"
): Promise<T> {
  const csrf = getCookie(CSRF_COOKIE_NAME) || getCookie("XSRF-TOKEN");

  const once = async (path: string, fieldName: "file" | "image") => {
    const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
    const headers = new Headers();
    if (csrf) headers.set("X-CSRF-Token", csrf);

    let res: Response;
    try {
      res = await fetch(url, {
        method,
        credentials: "include",
        cache: "no-store",
        redirect: "follow",
        body: buildForm(fieldName),
        headers, // NIE ustawiamy Content-Type dla FormData
      });
    } catch (netErr) {
      console.error("[api form] network error", url, netErr);
      throw netErr;
    }
    return res;
  };

  // 1) primary z polem "file"
  let res = await once(primaryPath, "file");

  // 404/405 → alternatywna ścieżka (np. /images)
  if ((res.status === 404 || res.status === 405) && altPath) {
    res = await once(altPath, "file");
  }

  // 400/415 → to samo z polem "image"
  if (res.status === 400 || res.status === 415) {
    const lastUrl = (res as any).url as string | undefined;
    const useAlt = !!altPath && typeof lastUrl === "string" && lastUrl.includes(altPath);
    const retryPath = useAlt ? altPath! : primaryPath;
    res = await once(retryPath, "image");
  }

  if (!res.ok) {
    await throwFromResponse(res);
  }

  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    const text = await res.text();
    return text as unknown as T;
  }
  return (await res.json()) as T;
}

/** ensureCsrf – dogrzej cookie CSRF przed POST/PUT/PATCH/DELETE */
export async function ensureCsrf(): Promise<void> {
  if (getCookie(CSRF_COOKIE_NAME) || getCookie("XSRF-TOKEN")) return;

  const candidates = ["/api/auth/csrf", "/api/auth/me", "/api/health"];
  for (const path of candidates) {
    try {
      await fetch(`${API_BASE}${path}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (getCookie(CSRF_COOKIE_NAME) || getCookie("XSRF-TOKEN")) return;
    } catch {
      // ignoruj i próbuj dalej
    }
  }
}

// ===== Błędy i safe-wrapppery =====
export type ApiError = {
  ok: false;
  status?: number;
  code?: string;
  message: string;
  url?: string;
  data?: any;
};

function toApiError(e: any): ApiError {
  const status = typeof e?.status === "number" ? e.status : undefined;
  const message =
    (typeof e?.message === "string" && e.message) ||
    (typeof e === "string" && e) ||
    "Network / unknown error";
  const code = typeof e?.statusText === "string" ? e.statusText : undefined;
  const url = typeof e?.url === "string" ? e.url : undefined;
  const data = e?.data;

  // Dodatkowe podpowiedzi dla typowych przypadków
  const hint =
    status === 403 && /csrf/i.test(message)
      ? " (CSRF? Spróbuj odświeżyć stronę lub zalogować się ponownie.)"
      : status === 404
      ? " (Endpoint nie istnieje na backendzie.)"
      : "";

  return { ok: false, status, code, message: message + hint, url, data };
}

/** fetch z domyślnym timeoutem 20s */
async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit & { timeoutMs?: number }
) {
  const timeoutMs = init?.timeoutMs ?? 20_000;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: init?.signal ?? controller.signal });
  } finally {
    clearTimeout(t);
  }
}

/** Kopia request() z timeoutem (używana przez requestSafe) */
async function requestWithTimeout<T>(
  path: string,
  init?: RequestInit & { timeoutMs?: number }
): Promise<T> {
  const headers = new Headers(init?.headers as HeadersInit | undefined);

  if (isUnsafeMethod(init?.method)) {
    const csrf = getCookie(CSRF_COOKIE_NAME) || getCookie("XSRF-TOKEN");
    if (csrf && !headers.has("X-CSRF-Token")) {
      headers.set("X-CSRF-Token", csrf);
    }
  }

  const hasBody = init && "body" in init && init.body != null;
  if (hasBody && !(init!.body instanceof FormData)) {
    if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  }

  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;

  let res: Response;
  try {
    res = await fetchWithTimeout(url, {
      credentials: "include",
      cache: "no-store",
      redirect: "follow",
      ...init,
      headers,
    });
  } catch (netErr: any) {
    const isAbort = netErr?.name === "AbortError";
    console.error("[api] network error", url, netErr);
    const err = new Error(isAbort ? "Request timeout" : "Network error") as any;
    err.url = url;
    throw err;
  }

  if (!res.ok) {
    try {
      await throwFromResponse(res);
    } catch (e: any) {
      if (e && typeof e === "object" && !e.url) e.url = url;
      console.error("[api] error", url, e);
      throw e;
    }
  }

  if (res.status === 204) return undefined as unknown as T;

  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    const text = await res.text();
    return text as unknown as T;
  }

  return res.json() as Promise<T>;
}

/** Safe-odpowiednik: zamiast throw → zwraca ApiError */
export async function requestSafe<T>(
  path: string,
  init?: RequestInit & { timeoutMs?: number }
): Promise<{ ok: true; data: T } | ApiError> {
  try {
    const data = await requestWithTimeout<T>(path, init);
    return { ok: true, data };
  } catch (e: any) {
    return toApiError(e);
  }
}

/* =======================
 *  🚀 PUBLIC HELPER: adminLogs (z filtrami)
 *  (nic nie koliduje ze starym api.admin.logs(page,limit))
 * ======================= */
export async function adminLogs(params: {
  page?: number;
  limit?: number;
  q?: string;
  level?: AdminLogLevel | string;
  action?: string;
}): Promise<Paged<AdminLog>> {
  const p = new URLSearchParams();
  if (params.page) p.set("page", String(params.page));
  if (params.limit) p.set("limit", String(params.limit));
  if (params.q) p.set("q", params.q);
  if (params.level) p.set("level", String(params.level));
  if (params.action) p.set("action", params.action);
  return request<Paged<AdminLog>>(`/api/admin/logs?${p.toString()}`);
}

// ===== API =====
export const api = {
  // Healthcheck
  health: () => request<{ ok: boolean }>("/api/health"),

  // Produkty (publiczne)
  products: (page?: number) =>
    request<PagedProducts>(`/api/products${page ? `?page=${page}` : ""}`),

  /** Surowy dostęp do listy produktów z własnymi query-stringami */
  productsRaw: (qs: string) => {
    const suffix = !qs ? "" : qs.startsWith("?") ? qs : `?${qs}`;
    return request<PagedProducts>(`/api/products${suffix}`);
  },

  product: (slug: string) => request(`/api/products/${slug}`),

  // Koszyk
  cart: {
    get: () => request("/api/cart"),
    add: (variantId: string, qty = 1) =>
      request("/api/cart", {
        method: "POST",
        body: JSON.stringify({ variantId, qty }),
      }),
    update: (itemId: string, qty: number) =>
      request("/api/cart", {
        method: "PATCH",
        body: JSON.stringify({ itemId, qty }),
      }),
    clear: () =>
      request("/api/cart", {
        method: "DELETE",
      }),
  },

  // ===== Auth =====
  auth: {
    register: (email: string, password: string, name?: string) =>
      request<{ ok: boolean; needVerification?: boolean; message?: string }>(
        "/api/auth/register",
        {
          method: "POST",
          body: JSON.stringify({ email, password, name }),
        }
      ),

    verifyEmail: (email: string, code: string) =>
      request<{ ok: boolean; user?: User }>("/api/auth/verify-email", {
        method: "POST",
        body: JSON.stringify({ email, code }),
      }),

    login: (email: string, password: string) =>
      request<AuthResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      }),

    profile: {
      get: () => request<{ user: User }>("/api/auth/profile"),
      update: (data: { name?: string | null }) =>
        request<{ user: User }>("/api/auth/profile", {
          method: "PUT",
          body: JSON.stringify(data),
        }),
    },

    changePassword: (currentPassword: string | null, newPassword: string) =>
      request<{ ok: boolean }>("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      }),

    me: async (): Promise<MeResponse> => {
      const url = `${API_BASE}/api/auth/me`;
      let res: Response;
      try {
        res = await fetch(url, {
          credentials: "include",
          cache: "no-store",
          redirect: "follow",
        });
      } catch (netErr) {
        console.error("[api] network error /api/auth/me", netErr);
        throw netErr;
      }

      if (res.status === 401) {
        return { user: null, authenticated: false };
      }
      if (!res.ok) {
        await throwFromResponse(res);
      }

      const data = (await res.json()) as Partial<MeResponse> & {
        user?: User | null;
        authenticated?: boolean;
      };
      return {
        user: data.user ?? null,
        authenticated:
          typeof data.authenticated === "boolean" ? data.authenticated : !!data.user,
      };
    },

    forgot: (email: string) =>
      request<{ ok: boolean }>("/api/auth/forgot", {
        method: "POST",
        body: JSON.stringify({ email }),
      }),

    reset: (token: string, password: string) =>
      request<{ ok: boolean }>("/api/auth/reset", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      }),

    logout: () => request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
    logoutAll: () =>
      request<{ ok: boolean }>("/api/auth/logout-all", { method: "POST" }),

    resendCode: (email: string) =>
      request<{ ok: boolean; message?: string }>("/api/auth/resend-code", {
        method: "POST",
        body: JSON.stringify({ email }),
      }),

    changeEmail: {
      start: (newEmail: string) =>
        request<{ ok: boolean; message?: string }>(
          "/api/auth/change-email/start",
          {
            method: "POST",
            body: JSON.stringify({ newEmail }),
          }
        ),
      confirm: (token: string) =>
        request<{ ok: boolean; message?: string }>(
          "/api/auth/change-email/confirm",
          {
            method: "POST",
            body: JSON.stringify({ token }),
          }
        ),
    },

    // 2FA
    mfa: {
      phoneStart: (phone: string) =>
        request<{ ok: boolean; message?: string }>(
          "/api/auth/2fa/phone/start",
          {
            method: "POST",
            body: JSON.stringify({ phone }),
          }
        ),
      phoneVerify: (code: string) =>
        request<{ ok: boolean; message?: string }>(
          "/api/auth/2fa/phone/verify",
          {
            method: "POST",
            body: JSON.stringify({ code }),
          }
        ),
      enable: () =>
        request<{ ok: boolean; message?: string }>("/api/auth/2fa/enable", {
          method: "POST",
        }),
      disable: () =>
        request<{ ok: boolean; message?: string }>("/api/auth/2fa/disable", {
          method: "POST",
        }),
      start: (email: string) =>
        request<{ ok: boolean; ticket: string }>("/api/auth/mfa/start", {
          method: "POST",
          body: JSON.stringify({ email }),
        }),
      complete: (ticket: string, code: string) =>
        request<{ ok: boolean }>("/api/auth/mfa/complete", {
          method: "POST",
          body: JSON.stringify({ ticket, code }),
        }),
    },

    magic: {
      start: (email: string) =>
        request<{ ok: boolean; message?: string }>("/api/auth/magic/start", {
          method: "POST",
          body: JSON.stringify({ email }),
        }),
      consume: (token: string) =>
        request<{ user: User }>("/api/auth/magic/consume", {
          method: "POST",
          body: JSON.stringify({ token }),
        }),
    },
  },

  // ===== Public: Zamówienia =====
  orders: {
    create: async (payload: {
      items: (
        | { variantId: string; qty: number; slug?: never }
        | { slug: string; qty: number; variantId?: never }
      )[];
      shippingMethod: "standard" | "locker" | "express" | "pickup";
      paymentMethod: "online" | "blik" | "cod";
      discountCode?: string | null;
      guestInfo?: { name: string; email: string; address: string };
      summary?: {
        subtotalCents: number;
        discountCents: number;
        shippingCents: number;
        paymentSurchargeCents: number;
        totalCents: number;
      };
    }): Promise<{
      ok: boolean;
      id: string;
      number: string;
      status?: OrderStatus;
      totalCents?: number;
    }> => {
      await ensureCsrf();

      const once = async (path: string) => {
        const url = `${API_BASE}${path}`;
        const res = await fetch(url, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token":
              getCookie(CSRF_COOKIE_NAME) || getCookie("XSRF-TOKEN") || "",
          },
          body: JSON.stringify(payload),
        });
        return res;
      };

      const candidates = ["/api/orders", "/api/order", "/api/checkout"];
      let last: Response | null = null;
      for (const p of candidates) {
        try {
          const res = await once(p);
          last = res;
          if (res.status === 404 || res.status === 405) continue;
          if (!res.ok) await throwFromResponse(res);

          const ct = res.headers.get("content-type") || "";
          const data: any = ct.includes("application/json")
            ? await res.json()
            : await res.text();

          const id =
            data?.order?.id ??
            data?.id ??
            data?.orderId ??
            "";

          const number =
            data?.order?.number ??
            data?.number ??
            data?.orderNumber ??
            id ??
            "";

          return {
            ok: true,
            id: String(id),
            number: String(number),
            status: (data?.order?.status || data?.status) as
              | OrderStatus
              | undefined,
            totalCents:
              (data?.order?.totalCents as number) ??
              (data?.totalCents as number) ??
              undefined,
          };
        } catch (e: any) {
          if (!last || (last.status !== 404 && last.status !== 405)) {
            throw e;
          }
        }
      }

      throw new Error(
        "Endpoint tworzenia zamówień nie istnieje (sprawdź /api/orders na backendzie)."
      );
    },

    my: {
      list: () =>
        request<{
          items: Array<{
            id: string;
            number: string;
            status: OrderStatus | string;
            totalCents: number;
            createdAt: string;
          }>;
        }>(`/api/my/orders`),

      get: (id: string) =>
        request<{ order: AdminOrderView }>(
          `/api/my/orders/${encodeURIComponent(id)}`
        ),
    },
  },

  // ===== Admin =====
  admin: {
    // Lista użytkowników itd.
    users: (
      page = 1,
      limit = 20,
      query = "",
      role?: "USER" | "ADMIN",
      verified?: "true" | "false"
    ) =>
      request<{
        items: Array<{
          id: string;
          email: string;
          name: string | null;
          role: "USER" | "ADMIN";
          createdAt: string;
          verifiedAt: string | null;
          disabledAt: string | null;
        }>;
        total: number;
        page: number;
        pages: number;
      }>(
        `/api/admin/users?page=${page}&limit=${limit}` +
          (query ? `&query=${encodeURIComponent(query)}` : "") +
          (role ? `&role=${role}` : "") +
          (verified ? `&verified=${verified}` : "")
      ),

    setRole: (userId: string, role: "USER" | "ADMIN") =>
      request<{ ok: boolean; user: User }>(`/api/admin/set-role`, {
        method: "POST",
        body: JSON.stringify({ userId, role }),
      }),

    softBan: (userId: string, disabled: boolean) =>
      request<{ ok: boolean }>(`/api/admin/soft-ban`, {
        method: "POST",
        body: JSON.stringify({ userId, disabled }),
      }),

    metrics: () =>
      request<{
        totalUsers: number;
        verifiedUsers: number;
        admins: number;
        banned: number;
      }>(`/api/admin/metrics`),

    // ⬇⬇⬇ ISTNIEJĄCY — nie zmieniam
    logs: (page = 1, limit = 20) =>
      request<{ items: any[]; total: number; page: number; pages: number }>(
        `/api/admin/logs?page=${page}&limit=${limit}`
      ),

    // ⬇⬇⬇ NOWY: z filtrami (q/level/action/page/limit) i poprawnymi typami
    logsSearch: (opts?: {
      page?: number;
      limit?: number;
      q?: string;
      level?: AdminLogLevel | string;
      action?: string;
    }) => {
      const p = new URLSearchParams();
      p.set("page", String(opts?.page ?? 1));
      p.set("limit", String(opts?.limit ?? 25));
      if (opts?.q) p.set("q", opts.q);
      if (opts?.level) p.set("level", String(opts.level));
      if (opts?.action) p.set("action", opts.action);
      return request<Paged<AdminLog>>(`/api/admin/logs?${p.toString()}`);
    },

    // ----- Produkty (ADMIN) -----

    // === LISTA ADMIN: GET /api/admin/products ===
    products: (
      page = 1,
      limit = 20,
      q = "",
      withDeleted = false,
      opts?: {
        category?: string;
        featured?: boolean;
      }
    ) => {
      const p = new URLSearchParams();
      p.set("page", String(page));
      p.set("limit", String(limit));
      if (q) p.set("q", q);
      if (withDeleted) p.set("withDeleted", "true");
      if (opts?.category) p.set("category", opts.category);
      if (opts?.featured) p.set("featured", "true");
      return request<{
        items: AdminProductListItem[];
        total: number;
        page: number;
        pages: number;
      }>(`/api/admin/products?${p.toString()}`);
    },

    // === GET /api/admin/products/:id ===
    productById: (id: string) =>
      request<{ product: AdminProductFull } | AdminProductFull>(
        `/api/admin/products/${id}`
      ),

    // === PATCH /api/admin/products/:id (edycja) ===
    updateProduct: (
      id: string,
      payload: Partial<{
        name: string;
        slug: string;
        description: string | null;
        brand: string | null;
        category: string | { slug: string } | ""; // slug lub "" (wyczyść)
        featured: boolean;
        undelete: boolean; // przywrócenie po soft-delete
      }>
    ) =>
      request<{ product: any }>(`/api/admin/products/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),

    // === DELETE /api/admin/products/:id (soft/hard) ===
    deleteProduct: async (id: string, opts?: { hard?: boolean }) => {
      await ensureCsrf();
      const qs = opts?.hard ? "?hard=1" : "";
      return request<{ ok: true }>(`/api/admin/products/${id}${qs}`, {
        method: "DELETE",
      });
    },

    // === BULK DELETE: DELETE /api/admin/products (soft/hard) ===
    deleteProductsBulk: async (ids: string[], opts?: { hard?: boolean }) => {
      await ensureCsrf();
      return request<{ ok: true; hard: boolean; count: number }>(
        `/api/admin/products`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids, force: !!opts?.hard }),
        }
      );
    },

    /** Utworzenie nowego produktu (z jednym wariantem) */
    createProduct: (payload: {
      name: string;
      slug: string;
      description?: string | null;
      brand?: string | null;
      category?: string | { slug: string } | "";
      featured?: boolean;
      variant: {
        sku?: string;
        priceCents: number;
        stock?: number;
        color?: string | null;
        size?: string | null;
        personalize?: boolean;
      } & VariantDiscountFields;
    }) =>
      request<{ product: any }>(`/api/admin/products`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),

    /** Aktualizacja wariantu (PATCH) – ze zniżkami */
    updateVariant: (
      variantId: string,
      payload: {
        sku?: string | null;
        priceCents?: number;
        stock?: number;
        color?: string | null;
        size?: string | null;
        personalize?: boolean;
      } & VariantDiscountFields
    ) =>
      request<{ variant: any }>(
        `/api/admin/variants/${variantId}`,
        {
          method: "PATCH",
          body: JSON.stringify(payload),
        }
      ),

    /**
     * Upload obrazka (FormData)
     */
    uploadProductImage: async (productId: string, file: File) => {
      const buildForm = (field: "file" | "image") => {
        const fd = new FormData();
        fd.append(field, file);
        return fd;
      };
      const primary = `/api/admin/products/${encodeURIComponent(
        productId
      )}/upload-image`;
      const alt = `/api/admin/products/${encodeURIComponent(productId)}/images`;

      const out =
        await requestFormWithFallbacks<
          { media: AdminMedia } | { ok: true; media: AdminMedia }
        >(primary, alt, buildForm, "POST");
      return ("media" in out ? out.media : (out as any).media) as AdminMedia;
    },

    /** Usunięcie obrazka */
    deleteProductImage: (mediaId: string) =>
      request<{ ok: true }>(
        `/api/admin/media/${encodeURIComponent(mediaId)}`,
        {
          method: "DELETE",
        }
      ),

    /**
     * Seed popularnych produktów – POST { mode } (insert|upsert|create->insert)
     * Zwraca co najmniej { createdCount, created }, niektóre backendy dodają { updatedCount }.
     */

    /** Seed popularnych produktów – wariant SAFE (nie rzuca, tylko zwraca ApiError) */
    seedPopularSafe: async (mode?: "insert" | "upsert" | "create") => {
      type SeedPopularResponse = {
        createdCount?: number;
        updatedCount?: number;
        created?: Array<{ id: string; slug: string }>;
        ok?: boolean;
      };
      await ensureCsrf();
      const realMode = mode === "create" ? "insert" : mode || "insert";
      const res = await requestSafe<SeedPopularResponse>(
        `/api/admin/seed/popular`,
        {
          method: "POST",
          body: JSON.stringify({ mode: realMode }),
          timeoutMs: 60_000,
        }
      );
      return res;
    },

    seedPopular: async (mode?: "insert" | "upsert" | "create") => {
      type SeedPopularResponse = {
        createdCount?: number;
        updatedCount?: number;
        created?: Array<{ id: string; slug: string }>;
      };
      await ensureCsrf();
      const realMode = mode === "create" ? "insert" : mode || "insert";
      return request<SeedPopularResponse>(`/api/admin/seed/popular`, {
        method: "POST",
        body: JSON.stringify({ mode: realMode }),
      });
    },

    // ----- Zamówienia (admin) -----
    orders: {
      list: (opts?: {
        page?: number;
        limit?: number;
        q?: string;
        status?: OrderStatus | "";
      }) => {
        const p = new URLSearchParams();
        p.set("page", String(opts?.page ?? 1));
        p.set("limit", String(opts?.limit ?? 20));
        if (opts?.q) p.set("q", opts.q);
        if (opts?.status) p.set("status", opts?.status);
        return request<AdminOrdersListResponse>(
          `/api/admin/orders?${p.toString()}`
        );
      },

      get: (orderId: string) =>
        request<{ order: AdminOrder } | AdminOrder>(
          `/api/admin/orders/${encodeURIComponent(orderId)}`
        ),

      updateStatus: (orderId: string, status: OrderStatus) =>
        request<{ ok: true }>(
          `/api/admin/orders/${encodeURIComponent(orderId)}/status`,
          {
            method: "PATCH",
            body: JSON.stringify({ status }),
          }
        ),

      exportCsvUrl: () => `${API_BASE}/api/admin/orders/export.csv`,
    },
  },
};
