// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import reportWebVitals from "./reportWebVitals";

// Providers
import { HelmetProvider } from "react-helmet-async";
import { AuthProvider } from "./context/AuthContext";
import { CartProvider } from "./context/CartContext";
import { WishlistProvider } from "./context/WishlistContext";
import { ThemeProvider } from "./context/ThemeContext";

// 🔎 Fuse.js – inicjalizacja datasetu wyszukiwarki
import { updateSearchDataset } from "./utils/searchUtils";
import { api } from "./api";

// ✅ Jednorazowa inicjalizacja indeksu wyszukiwarki przy starcie aplikacji
(async () => {
  try {
    const resp = await api.products(1); // pobieramy pierwszą stronę
    const items = (resp?.items || []).map((p) => ({
      name: p.name,
      description: p.description || "",
      tags: [p.category, p.brand, p.slug].filter(Boolean).map(String),
      slug: p.slug,
      id: p.id,
      image: (p.media && p.media[0]?.url) || "",
    }));
    updateSearchDataset(items);
    console.info("[search init] dataset loaded:", items.length);
  } catch (e) {
    console.error("[search init] failed", e);
  }
})();

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

// Opcjonalnie – niech nie wywali, jeśli raportowanie nie jest podpięte
reportWebVitals?.();

/* -------------------------------
   PWA: rejestracja Service Workera
   - działa tylko w buildzie PROD
   - SW musi być dostępny pod /sw.js
-------------------------------- */
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        console.info("[PWA] Service Worker zarejestrowany:", reg.scope);
      })
      .catch((err) => {
        console.error("[PWA] Rejestracja SW nie powiodła się:", err);
      });
  });
}
