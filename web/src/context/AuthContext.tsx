// src/context/AuthContext.tsx
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { api, type User } from "../api";

declare global {
  interface Window {
    /** Gdy true, odświeżanie /me po focusie jest pomijane (np. podczas natywnego pickera plików) */
    __suppressFocusRefresh?: boolean;
  }
}

export type RegisterResult = {
  ok: boolean;
  needVerification?: boolean;
  message?: string;
};

export type AuthContextType = {
  user: User | null;
  /** Ładowanie stanu sesji (/me) – istotne dla tras chronionych */
  authLoading: boolean;
  /** Busy dla akcji (login/rejestracja/wylogowanie) */
  loading: boolean;
  error: string | null;

  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<RegisterResult | void>;
  logout: () => Promise<void>;
  /** Ręczne odświeżenie sesji z backendu */
  refresh: () => Promise<void>;
  /** Bezpośrednia modyfikacja usera (np. po edycji profilu) */
  setUser: (u: User | null) => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// jak często wolno odświeżać /me na eventach okienka
const FOCUS_REFRESH_COOLDOWN_MS = 5000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  // authLoading = stan wczytywania /me (sesji). Używane przez Route guardy.
  const [authLoading, setAuthLoading] = useState<boolean>(true);

  // loading = krótki busy dla akcji (login/register/logout)
  const [loading, setLoading] = useState<boolean>(false);

  const [error, setError] = useState<string | null>(null);

  // throttling dla odświeżania na focus/visibilitychange
  const refreshingRef = useRef(false);
  const lastRefreshAtRef = useRef(0);

  // 1) Hydratacja z localStorage dla szybkiego wstępnego UI
  useEffect(() => {
    const stored = localStorage.getItem("user");
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as User | null;
        setUser(parsed ?? null);
      } catch {
        localStorage.removeItem("user");
      }
    }
  }, []);

  // 2) Twarde sprawdzenie sesji po stronie backendu (cookie httpOnly)
  const refresh = useCallback(async () => {
    // explicit refresh – nie podlega throttlingowi (ale ustawia authLoading)
    try {
      setAuthLoading(true);
      const me = await api.auth.me();
      const next = me.user ?? null;
      setUser(next);
      if (next) localStorage.setItem("user", JSON.stringify(next));
      else localStorage.removeItem("user");
      setError(null);
    } catch (e: any) {
      // 401 → po prostu brak sesji; 429 → ignorujemy; reszta – nie wylogowuje
      if (e?.status === 401) {
        setUser(null);
        localStorage.removeItem("user");
      } else if (e?.status === 429) {
        // throttle serwera – zignoruj, nie zmieniaj usera
        // opcjonalnie: console.warn("[auth.me] 429 throttled – ignoruję");
      } else {
        // inne błędy – nie kasujemy usera
        // opcjonalnie: console.warn("[auth.me] non-fatal:", e?.message || e);
      }
    } finally {
      setAuthLoading(false);
    }
  }, []);

  // dedykowane odświeżenie na event (focus/visibilitychange) z throttlingiem
  const refreshOnWindowEvent = useCallback(async (reason: string) => {
    // jeśli otwarty natywny picker – pomiń odświeżanie
    if (window.__suppressFocusRefresh) return;

    const now = Date.now();
    if (refreshingRef.current || now - lastRefreshAtRef.current < FOCUS_REFRESH_COOLDOWN_MS) {
      return;
    }

    refreshingRef.current = true;
    lastRefreshAtRef.current = now;

    try {
      const me = await api.auth.me();
      const next = me.user ?? null;
      setUser(next);
      if (next) localStorage.setItem("user", JSON.stringify(next));
      else localStorage.removeItem("user");
      setError(null);
    } catch (e: any) {
      if (e?.status === 401) {
        setUser(null);
        localStorage.removeItem("user");
      } else if (e?.status === 429) {
        // ignorujemy
      } else {
        // nie fatal
      }
    } finally {
      refreshingRef.current = false;
      // authLoading tu nie dotyczy – to „miękkie” odświeżenie
    }
  }, []);

  // Wywołaj na starcie + dołóż „miękkie” odświeżanie po powrocie do karty
  useEffect(() => {
    void refresh();
    const onFocus = () => void refreshOnWindowEvent("focus");
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void refreshOnWindowEvent("visibilitychange");
      }
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh, refreshOnWindowEvent]);

  const login = async (email: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.auth.login(email, password);
      // data ma typ: { user: User } | { mfaRequired: true; user?: User }
      if ("mfaRequired" in data && data.mfaRequired) {
        // tu NIE ustawiamy usera – UI powinno przejść w krok MFA
        setUser(null);
        localStorage.removeItem("user");
        // (opcjonalnie można tu emitować stan MFA w innym kontekście)
      } else if ("user" in data && data.user) {
        setUser(data.user as User);
        localStorage.setItem("user", JSON.stringify(data.user));
      } else {
        // bezpieczeństwo na wypadek nietypowej odpowiedzi
        setUser(null);
        localStorage.removeItem("user");
      }
    } catch (err: any) {
      setError(err?.message || "Błąd logowania");
      setUser(null);
      localStorage.removeItem("user");
    } finally {
      setLoading(false);
    }
  };

  // Rejestracja — backend odsyła tylko { ok, needVerification, message }
  const register = async (
    email: string,
    password: string,
    name?: string
  ): Promise<RegisterResult | void> => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.auth.register(email, password, name);
      // NIE ustawiamy usera (konto niezweryfikowane)
      return data;
    } catch (err: any) {
      setError(err?.message || "Błąd rejestracji");
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    setLoading(true);
    try {
      await api.auth.logout();
    } catch {
      // ignorujemy — i tak czyścimy klienta
    } finally {
      setLoading(false);
      setUser(null);
      localStorage.removeItem("user");
    }
  };

  const value: AuthContextType = {
    user,
    authLoading,
    loading,
    error,
    login,
    register,
    logout,
    refresh,
    setUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
