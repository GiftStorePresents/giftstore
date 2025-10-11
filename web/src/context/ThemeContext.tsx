import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
  MouseEvent,
} from "react";

type Theme = "light" | "dark";

type ThemeContextValue = {
  theme: Theme;
  /** Zwykły toggle bez efektów */
  toggle: () => void;
  /** Toggle z animacją (burst + natywny crossfade jeśli dostępny) */
  toggleWithFX: (e?: MouseEvent) => void;
};

const STORAGE_KEY = "theme";
const ThemeCtx = createContext<ThemeContextValue>({
  theme: "light",
  toggle: () => {},
  toggleWithFX: () => {},
});

const isBrowser = () =>
  typeof window !== "undefined" && typeof document !== "undefined";

const getSystemPrefersDark = (): boolean => {
  if (!isBrowser() || !window.matchMedia) return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
};

const readStoredTheme = (): Theme | null => {
  if (!isBrowser()) return null;
  const t = localStorage.getItem(STORAGE_KEY);
  return t === "light" || t === "dark" ? t : null;
};

const applyThemeToRoot = (theme: Theme) => {
  if (!isBrowser()) return;
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  root.classList.toggle("dark", theme === "dark");
};

export function ThemeProvider({ children }: { children: ReactNode }) {
  const stored = readStoredTheme();
  const [theme, setTheme] = useState<Theme>(() => stored ?? (getSystemPrefersDark() ? "dark" : "light"));
  const [manual, setManual] = useState<boolean>(() => !!stored);

  // Aplikacja na <html> + (opcjonalny) zapis do storage
  useEffect(() => {
    applyThemeToRoot(theme);
    if (!isBrowser()) return;
    if (manual) localStorage.setItem(STORAGE_KEY, theme);
    else localStorage.removeItem(STORAGE_KEY);
  }, [theme, manual]);

  // Reakcja na zmianę systemowego motywu gdy brak manualnego wyboru
  useEffect(() => {
    if (!isBrowser() || manual || !window.matchMedia) return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setTheme(e.matches ? "dark" : "light");
    mql.addEventListener?.("change", handler);
    return () => mql.removeEventListener?.("change", handler);
  }, [manual]);

  const doToggle = (next?: Theme) => {
    setManual(true);
    setTheme((t) => next ?? (t === "dark" ? "light" : "dark"));
  };

  /** Toggle z efektami: burst + View Transitions crossfade (Chromium) */
  const toggleWithFX = (e?: MouseEvent) => {
    if (!isBrowser()) return doToggle();

    const body = document.body;
    body.classList.add("theme-switching");

    // Burst w miejscu kliknięcia
    const burst = document.createElement("div");
    burst.className = "theme-burst";
    const x = e?.clientX ?? window.innerWidth / 2;
    const y = e?.clientY ?? window.innerHeight / 2;
    burst.style.setProperty("--burst-x", `${x}px`);
    burst.style.setProperty("--burst-y", `${y}px`);
    body.appendChild(burst);

    const cleanup = () => {
      burst.remove();
      body.classList.remove("theme-switching");
    };

    // Natywny crossfade (Chrome/Edge)
    const startViewTransition =
      (document as any).startViewTransition?.bind(document) ?? null;

    if (startViewTransition) {
      startViewTransition(() => {
        setManual(true);
        setTheme((prev) => (prev === "dark" ? "light" : "dark"));
      }).finished.finally(() => {
        setTimeout(cleanup, 80);
      });
    } else {
      // Fallback: zwykłe przełączenie + CSS transitions
      doToggle();
      setTimeout(cleanup, 560);
    }
  };

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      toggle: () => doToggle(),
      toggleWithFX,
    }),
    [theme]
  );

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export const useTheme = () => useContext(ThemeCtx);
