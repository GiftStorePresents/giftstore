// =======================================================================
// src/main.jsx — Gift Store
// Wersja: 2025-10-23 (clean build ready)
// - uporządkowane importy i provider hierarchy
// - inicjalizacja Fuse.js datasetu z obsługą błędów
// - PWA service worker (prod only)
// - pełna zgodność z React 18 / Vite
// =======================================================================

import React from "react";
import ReactDOM from "react-dom/client";

// Globalne style
import "./index.css";

// Aplikacja
import App from "./App";

// Context providers
import { HelmetProvider } from "react-helmet-async";
import { ThemeProvider } from "./context/ThemeContext";
import { AuthProvider } from "./context/AuthContext";
import { CartProvider } from "./context/CartContext";
import { WishlistProvider } from "./context/WishlistContext";

// Search utils (Fuse.js dataset init)
import { updateSearchDataset } from "./utils/searchUtils";
import { api } from "./api";

// Web vitals (opcjonalne)
import reportWebVitals from "./reportWebVitals";

// =======================================================================
// Inicjalizacja wyszukiwarki (Fuse.js)
// =======================================================================
(async function initSearch() {
  try {
    const resp = await api.products(1); // pobranie pierwszej strony produktów
    const items = (resp?.items || []).map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description || "",
      tags: [p.category, p.brand, p.slug].filter(Boolean).map(String),
      slug: p.slug,
      image: (p.media && p.media[0]?.url) || "",
    }));

    updateSearchDataset(items);
    console.info(`[search init] dataset loaded (${items.length} items)`);
  } catch (err) {
    console.warn("[search init] failed:", err);
  }
})();

// =======================================================================
// Root render — pełna hierarchia providerów
// =======================================================================
const rootEl = document.getElementById("root");
const root = ReactDOM.createRoot(rootEl);

root.render(
  <React.StrictMode>
    <HelmetProvider>
      <ThemeProvider>
        <AuthProvider>
          <WishlistProvider>
            <CartProvider>
              <App />
            </CartProvider>
          </WishlistProvider>
        </AuthProvider>
      </ThemeProvider>
    </HelmetProvider>
  </React.StrictMode>
);

// =======================================================================
// Report Web Vitals (opcjonalne)
// =======================================================================
if (typeof reportWebVitals === "function") {
  try {
    reportWebVitals();
  } catch (err) {
    console.warn("[web-vitals] skipped:", err);
  }
}

// =======================================================================
// PWA — rejestracja Service Workera (tylko w produkcji)
// =======================================================================
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) =>
        console.info("[PWA] Service Worker zarejestrowany:", reg.scope)
      )
      .catch((err) =>
        console.error("[PWA] Rejestracja Service Workera nie powiodła się:", err)
      );
  });
}

// =======================================================================
// Koniec pliku
// =======================================================================
