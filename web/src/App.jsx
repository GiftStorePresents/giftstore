// =======================================================================
// src/App.jsx — Gift Store
// Wersja: 2025-11-10
// Zmiany w tej wersji:
// - ✅ Dodano InspirationPage + trasy /inspiracje/:slug i /inspirations/:slug
// - ✅ ScrollToTop po zmianie trasy
// - ✅ GA4 page_view listener
// - ✅ NotFound 404 fallback
// - ✅ Zachowane AdminRoute i reszta istniejących tras
// Uwaga: ten plik to czysty JSX (bez TS), zgodny z Vite + React Router 6/7.
// =======================================================================

import { BrowserRouter, Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState, Suspense, lazy } from "react";

// ───────────────────────────────────────────────────────────────────────────────
// Layout & UI
// ───────────────────────────────────────────────────────────────────────────────
import Header from "./components/Header";
import Footer from "./components/Footer";
import ThemeSwitch from "./components/ThemeSwitch";
import Toast from "./components/Toast";
import NewsletterNotice from "./components/NewsletterNotice";
import LaunchCountdown from "./components/LaunchCountdown";

// ───────────────────────────────────────────────────────────────────────────────
// Pages (eager-loaded — kluczowe widoki)
// ───────────────────────────────────────────────────────────────────────────────
import ProductPage from "./pages/ProductPage";
// import CartPage from "./pages/CartPage"; // ⛔ wyłączone – idziemy bezpośrednio do checkout
import CategoryPage from "./pages/CategoryPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import CheckoutPage from "./pages/CheckoutPage";
import ProfilePage from "./pages/ProfilePage";
import WishlistPage from "./pages/WishlistPage";
import SearchResults from "./pages/SearchResults";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import MagicLogin from "./pages/MagicLogin";
import ConfirmEmailChangePage from "./pages/ConfirmEmailChangePage";
import InspirationPage from "./pages/InspirationPage"; // ✅ NOWE

import AdminPage from "./pages/AdminPage";
import AdminRoute from "./components/AdminRoute";
import AdminProductsPage from "./pages/AdminProductsPage";
import AdminUsersPage from "./pages/AdminUsersPage";
import AdminLogsPage from "./pages/AdminLogsPage";
import AdminOrdersPage from "./pages/AdminOrdersPage";
import AdminOrderDetailsPage from "./pages/AdminOrderDetailsPage";
import AdminBlogPage from "./pages/AdminBlogPage";
import AdminCouponsPage from "./pages/AdminCouponsPage";
import AdminInspirationsPage from "./pages/AdminInspirationsPage"; // panel inspiracji
import AdminCategoriesPage from "./pages/AdminCategoriesPage";
import AdminProductDetailsPage from "./pages/AdminProductDetailsPage";
import AdminHeroPage from "./pages/AdminHeroPage";

import ReviewLandingPage from "./pages/ReviewLandingPage";
import ReviewThanksPage from "./pages/ReviewThanksPage";

import MyOrdersPage from "./pages/MyOrdersPage";
import MyOrderDetailsPage from "./pages/MyOrderDetailsPage";

import BlogIndexPage from "./pages/BlogIndexPage";
import ArticlePage from "./pages/ArticlePage";

import HomePage from "./pages/HomePage";
import ThankYouPage from "./pages/ThankYouPage";
import CheckoutSuccessRedirectPage from "./pages/CheckoutSuccessRedirectPage";
import ContactPage from "./pages/ContactPage";

// ───────────────────────────────────────────────────────────────────────────────
// Lazy pages (legal) — oszczędzamy chunk początkowy
// ───────────────────────────────────────────────────────────────────────────────
const RegulaminPage = lazy(() => import("./pages/Legal/RegulaminPage"));
const PolitykaPrywatnosciPage = lazy(() => import("./pages/Legal/PolitykaPrywatnosciPage"));
const FAQPage = lazy(() => import("./pages/Legal/FAQPage"));

// ───────────────────────────────────────────────────────────────────────────────
import "./App.css";
import { useAuth } from "./context/AuthContext";
// Opcjonalna inicjalizacja indeksu wyszukiwania (z API)
import SearchDatasetBootstrapper from "./context/SearchDatasetBootstrapper";

// Konfiguracja GA4
const GA_ID = import.meta.env?.VITE_GA_MEASUREMENT_ID;

// =======================================================================
// Drobne komponenty pomocnicze w jednym pliku
// =======================================================================

/** GA4 page_view listener */
function GAListener() {
  const location = useLocation();

  useEffect(() => {
    if (!GA_ID || window.__gaInitialized) return;

    // wstrzyknięcie gtag
    const s = document.createElement("script");
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
    document.head.appendChild(s);

    window.dataLayer = window.dataLayer || [];
    function gtag() {
      window.dataLayer.push(arguments);
    }
    window.gtag = gtag;

    gtag("js", new Date());
    gtag("config", GA_ID, { send_page_view: false });

    window.__gaInitialized = true;
  }, []);

  useEffect(() => {
    if (!GA_ID || !window.gtag) return;
    window.gtag("event", "page_view", {
      page_title: document.title,
      page_location: typeof window !== "undefined" ? window.location.href : "",
      page_path: location.pathname + location.search,
    });
  }, [location]);

  return null;
}

/** Przydatne przy SPA — przewija do góry po każdej zmianie trasy */
function ScrollToTop() {
  const location = useLocation();
  useEffect(() => {
    try {
      window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
    } catch {
      window.scrollTo(0, 0);
    }
  }, [location.pathname, location.search]);
  return null;
}

/** Prymitywny 404 fallback */
function NotFound() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 text-center">
      <h1 className="text-3xl font-bold mb-3">404 — Nic tu nie ma</h1>
      <p className="text-muted-foreground">
        Sprawdź adres lub wróć na{" "}
        <a className="underline" href="/">
          stronę główną
        </a>
        .
      </p>
    </div>
  );
}

/** Po zalogowaniu wracamy tam, gdzie użytkownik chciał wejść */
const REDIRECT_KEY = "postLoginRedirect";
function PostLoginRedirect() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;
    const target = sessionStorage.getItem(REDIRECT_KEY);
    if (!target) return;

    const current = location.pathname + location.search;
    if (current !== target) navigate(target, { replace: true });

    sessionStorage.removeItem(REDIRECT_KEY);
  }, [user, navigate, location.pathname, location.search]);

  return null;
}

// =======================================================================
// Główna powłoka aplikacji (layout + routing)
// =======================================================================
function AppShell({ setToast }) {
  const location = useLocation();
  const navigate = useNavigate();

  // Newsletter (?newsletter=confirmed/unsubscribed/pending)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const flag = params.get("newsletter");
    if (!flag) return;

    let message = "";
    if (flag === "confirmed") {
      message = "Dziękujemy za zapis do newslettera! ✨ Sprawdź skrzynkę – wysłaliśmy potwierdzenie.";
    } else if (flag === "unsubscribed") {
      message = "Zostałeś wypisany z newslettera. Szkoda, że odchodzisz. 🥺";
    } else if (flag === "pending") {
      message = "Sprawdź e-mail i kliknij link potwierdzający zapis. 📬";
    }

    if (message) setToast?.(message);

    // Czyścimy query param i odświeżamy URL bez nawigacji
    params.delete("newsletter");
    const newSearch = params.toString();
    navigate(
      { pathname: location.pathname, search: newSearch ? `?${newSearch}` : "" },
      { replace: true }
    );
  }, [location.key]);

  return (
    <div
      id="app-shell"
      className="
        min-h-screen relative
        overflow-x-hidden overflow-y-visible
        transition-colors duration-300
        bg-gift-wrap dark:bg-aurora-dark
      "
    >
      {/* Skip link dla dostępności */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-white focus:text-black focus:px-3 focus:py-2 focus:rounded-xl"
      >
        Przejdź do treści
      </a>

      {/* Opcjonalna inicjalizacja indeksu wyszukiwarki z API */}
      <SearchDatasetBootstrapper />

      {/* Nagłówek */}
      <Header />

      {/* Licznik otwarcia sklepu — tylko na stronie głównej */}
      {location.pathname === "/" && (
        <section className="container mx-auto mt-4 md:mt-6 px-4 sm:px-5 md:px-6 lg:px-8">
          <LaunchCountdown />
        </section>
      )}

      {/* Główna kolumna treści */}
      <main
        id="main"
        className="
          container mx-auto w-full
          px-4 sm:px-5 md:px-6 lg:px-8
          py-4 md:py-6
          pb-16 md:pb-24
          relative z-10
          overflow-visible
        "
      >
        <Suspense fallback={<div className="text-center py-12 text-muted">Ładowanie…</div>}>
          <Routes>
            {/* ───────────────────── Auth ───────────────────── */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot" element={<ForgotPasswordPage />} />
            <Route path="/reset" element={<ResetPasswordPage />} />
            <Route path="/magic" element={<MagicLogin />} />
            <Route path="/confirm-email-change" element={<ConfirmEmailChangePage />} />

            {/* ───────────────────── Admin ───────────────────── */}
            <Route path="/admin" element={<AdminRoute><AdminPage /></AdminRoute>} />
            <Route path="/admin/products" element={<AdminRoute><AdminProductsPage /></AdminRoute>} />
            <Route path="/admin/users" element={<AdminRoute><AdminUsersPage /></AdminRoute>} />
            <Route path="/admin/logs" element={<AdminRoute><AdminLogsPage /></AdminRoute>} />
            <Route path="/admin/orders" element={<AdminRoute><AdminOrdersPage /></AdminRoute>} />
            <Route path="/admin/orders/:orderId" element={<AdminRoute><AdminOrderDetailsPage /></AdminRoute>} />
            <Route path="/admin/blog" element={<AdminRoute><AdminBlogPage /></AdminRoute>} />
            <Route path="/admin/coupons" element={<AdminRoute><AdminCouponsPage /></AdminRoute>} />
            <Route path="/admin/inspirations" element={<AdminRoute><AdminInspirationsPage /></AdminRoute>} />
            <Route path="/admin/categories" element={<AdminRoute><AdminCategoriesPage /></AdminRoute>} />
            <Route path="/admin/products/:id" element={<AdminProductDetailsPage />} />
            <Route path="/admin/hero" element={<AdminRoute><AdminHeroPage /></AdminRoute>} />

            {/* ───────────────────── Client orders ───────────────────── */}
            <Route path="/orders" element={<MyOrdersPage />} />
            <Route path="/orders/:id" element={<MyOrderDetailsPage />} />

            {/* ───────────────────── Public ───────────────────── */}
            <Route path="/" element={<HomePage />} />

            {/* Shopping */}
            <Route path="/product/:slug" element={<ProductPage />} />
            <Route path="/categories/:slug" element={<CategoryPage />} />
            <Route path="/checkout" element={<CheckoutPage />} />
            {/* <Route path="/cart" element={<CartPage />} /> */} {/* ⛔ wyłączone – bezpośrednio do checkout */}
            <Route path="/thank-you" element={<ThankYouPage />} />
            <Route path="/checkout/success" element={<CheckoutSuccessRedirectPage />} />

            {/* ✅ Inspiracje — obie wersje ścieżki */}
            <Route path="/inspiracje/:slug" element={<InspirationPage />} />
            <Route path="/inspirations/:slug" element={<InspirationPage />} />

            {/* ───────────────────── User ───────────────────── */}
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/wishlist" element={<WishlistPage />} />
            <Route path="/search" element={<SearchResults />} />

            {/* ───────────────────── Blog ───────────────────── */}
            <Route path="/blog" element={<BlogIndexPage />} />
            <Route path="/blog/:slug" element={<ArticlePage />} />

            {/* ───────────────────── Legal ───────────────────── */}
            <Route path="/regulamin" element={<RegulaminPage />} />
            <Route path="/polityka-prywatnosci" element={<PolitykaPrywatnosciPage />} />
            <Route path="/faq" element={<FAQPage />} />
            <Route path="/contact" element={<ContactPage />} />

            {/* ───────────────────── Public: ocena zamówienia ───────────────────── */}
            <Route path="/review/:orderId/:token" element={<ReviewLandingPage />} />
            <Route path="/review/thanks" element={<ReviewThanksPage />} />

            {/* ───────────────────── 404 ───────────────────── */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </main>

      {/* Stopka + dodatki */}
      <NewsletterNotice className="relative z-10" />
      <ThemeSwitch />
      <Footer />
    </div>
  );
}

// =======================================================================
// Root App (shell + globalne akcesoria)
// =======================================================================
export default function App() {
  const [toast, setToast] = useState("");

  // Odświeżenie listy kategorii po powrocie do zakładki (jeśli UI nasłuchuje)
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") {
        window.dispatchEvent(new CustomEvent("categories:refresh"));
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  return (
    <BrowserRouter
      basename={import.meta.env.BASE_URL}           
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <GAListener />
      <ScrollToTop />
      <PostLoginRedirect />
      <AppShell setToast={setToast} />
      <Toast message={toast} onClose={() => setToast("")} />
    </BrowserRouter>
  );
}
