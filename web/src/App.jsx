// src/App.jsx
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState, Suspense, lazy } from "react";

import Header from "./components/Header";
import Footer from "./components/Footer";
import ThemeSwitch from "./components/ThemeSwitch";
import Toast from "./components/Toast";
import NewsletterNotice from "./components/NewsletterNotice";

import ProductPage from "./pages/ProductPage";
import CartPage from "./pages/CartPage";
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

import AdminPage from "./pages/AdminPage";
import AdminRoute from "./components/AdminRoute";
import AdminProductsPage from "./pages/AdminProductsPage";
import AdminUsersPage from "./pages/AdminUsersPage";
import AdminLogsPage from "./pages/AdminLogsPage";
import AdminOrdersPage from "./pages/AdminOrdersPage";
import AdminOrderDetailsPage from "./pages/AdminOrderDetailsPage";
import AdminBlogPage from "./pages/AdminBlogPage";
import AdminCouponsPage from "./pages/AdminCouponsPage";

import MyOrdersPage from "./pages/MyOrdersPage";
import MyOrderDetailsPage from "./pages/MyOrderDetailsPage";

import BlogIndexPage from "./pages/BlogIndexPage";
import ArticlePage from "./pages/ArticlePage";

import HomePage from "./pages/HomePage";
import ThankYouPage from "./pages/ThankYouPage";
import CheckoutSuccessRedirectPage from "./pages/CheckoutSuccessRedirectPage"; // ⬅️ alias po Stripe

import "./App.css";
import { useAuth } from "./context/AuthContext";
import { useTheme } from "./context/ThemeContext";

const RegulaminPage = lazy(() => import("./pages/Legal/RegulaminPage"));
const PolitykaPrywatnosciPage = lazy(() => import("./pages/Legal/PolitykaPrywatnosciPage"));
const FAQPage = lazy(() => import("./pages/Legal/FAQPage"));

const GA_ID = import.meta.env?.VITE_GA_MEASUREMENT_ID;

/* ---------------- GA4 page_view listener ---------------- */
function GAListener() {
  const location = useLocation();

  useEffect(() => {
    if (!GA_ID || window.__gaInitialized) return;

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

/* ---------------- Post-login redirect ---------------- */
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

/* ---------------- App Shell ---------------- */
function AppShell({ setToast }) {
  const { theme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();

  // Toast po powrocie z linków newslettera (?newsletter=...)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const flag = params.get("newsletter");
    if (!flag) return;

    let message = "";
    if (flag === "confirmed") {
      message =
        "Dziękujemy za zapis do newslettera! ✨ Sprawdź skrzynkę – wysłaliśmy potwierdzenie.";
    } else if (flag === "unsubscribed") {
      message = "Zostałeś wypisany z newslettera. Szkoda, że odchodzisz. 🥺";
    } else if (flag === "pending") {
      message = "Sprawdź e-mail i kliknij link potwierdzający zapis. 📬";
    }

    if (message) setToast?.(message);

    // wyczyść parametr z URL
    params.delete("newsletter");
    const newSearch = params.toString();
    navigate(
      { pathname: location.pathname, search: newSearch ? `?${newSearch}` : "" },
      { replace: true }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  return (
    <div
      className={
        "min-h-screen bg-cover bg-fixed relative overflow-x-hidden " +
        (theme === "dark" ? "bg-mesh-gift-dark-pretty" : "bg-mesh-gift")
      }
    >
      {/* decorative mesh background */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            "radial-gradient(circle at 20% 10%, var(--bg-start)cc 0%, transparent 65%), " +
            "radial-gradient(circle at 90% 80%, var(--accent)22 0%, transparent 75%), " +
            "var(--pattern-url)",
          filter: "blur(22px) saturate(1.14)",
          opacity: theme === "dark" ? 0.55 : 0.7,
          zIndex: 0,
          mixBlendMode: theme === "dark" ? "screen" : "soft-light",
        }}
      />

      {/* optional SVG blob glow */}
      <svg
        className="absolute left-[-10vw] top-[-8vw] w-[70vw] h-[60vw] opacity-20 -z-10 pointer-events-none"
        viewBox="0 0 900 600"
        aria-hidden="true"
      >
        <defs>
          <radialGradient id="gold-gradient" cx="50%" cy="50%" r="70%">
            <stop offset="0%" stopColor="#fffbe8" />
            <stop offset="80%" stopColor="#ffd700" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
        </defs>
        <path
          fill="url(#gold-gradient)"
          d="M662,582Q618,684,504,653Q390,622,329,539Q268,456,226,375Q184,294,255,200Q326,106,442,96Q558,86,648,161Q738,236,744,368Q750,500,662,582Z"
        />
      </svg>

      {/* Skip link dla a11y */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-white focus:text-black focus:px-3 focus:py-2 focus:rounded-xl"
      >
        Przejdź do treści
      </a>

      <Header />

      {/* light overlay in light theme */}
      <div className="fixed inset-0 z-0 pointer-events-none select-none">
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(120deg, var(--bg-start) 0%, var(--bg-end) 100%)",
            opacity: theme === "dark" ? 0 : 0.85,
          }}
        />
      </div>

      <main
        id="main"
        className="w-full max-w-7xl mx-auto px-4 sm:px-5 md:px-6 lg:px-8 py-4 md:py-6 relative z-10"
      >
        <Suspense fallback={<div className="text-center py-12 text-muted">Ładowanie…</div>}>
          <Routes>
            {/* Auth */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot" element={<ForgotPasswordPage />} />
            <Route path="/reset" element={<ResetPasswordPage />} />
            <Route path="/magic" element={<MagicLogin />} />
            <Route path="/confirm-email-change" element={<ConfirmEmailChangePage />} />

            {/* Admin */}
            <Route path="/admin" element={<AdminRoute><AdminPage /></AdminRoute>} />
            <Route path="/admin/products" element={<AdminRoute><AdminProductsPage /></AdminRoute>} />
            <Route path="/admin/users" element={<AdminRoute><AdminUsersPage /></AdminRoute>} />
            <Route path="/admin/logs" element={<AdminRoute><AdminLogsPage /></AdminRoute>} />
            <Route path="/admin/orders" element={<AdminRoute><AdminOrdersPage /></AdminRoute>} />
            <Route path="/admin/orders/:orderId" element={<AdminRoute><AdminOrderDetailsPage /></AdminRoute>} />
            <Route path="/admin/blog" element={<AdminRoute><AdminBlogPage /></AdminRoute>} />
            <Route path="/admin/coupons" element={<AdminRoute><AdminCouponsPage /></AdminRoute>} />

            {/* Client orders */}
            <Route path="/orders" element={<MyOrdersPage />} />
            <Route path="/orders/:id" element={<MyOrderDetailsPage />} />

            {/* Home */}
            <Route path="/" element={<HomePage />} />

            {/* Shopping */}
            <Route path="/product/:slug" element={<ProductPage setToast={setToast} />} />
            <Route path="/categories/:slug" element={<CategoryPage setToast={setToast} />} />
            <Route path="/checkout" element={<CheckoutPage setToast={setToast} />} />
            <Route path="/cart" element={<CartPage />} />
            <Route path="/thank-you" element={<ThankYouPage />} />
            <Route path="/checkout/success" element={<CheckoutSuccessRedirectPage />} /> {/* alias Stripe */}

            {/* User */}
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/wishlist" element={<WishlistPage />} />
            <Route path="/search" element={<SearchResults setToast={setToast} />} />

            {/* Blog */}
            <Route path="/blog" element={<BlogIndexPage />} />
            <Route path="/blog/:slug" element={<ArticlePage />} />

            {/* Legal */}
            <Route path="/regulamin" element={<RegulaminPage />} />
            <Route path="/polityka-prywatnosci" element={<PolitykaPrywatnosciPage />} />
            <Route path="/faq" element={<FAQPage />} />
          </Routes>
        </Suspense>
      </main>

      <NewsletterNotice className="relative z-10" />

      <ThemeSwitch />
      <Footer />
    </div>
  );
}

/* ---------------- Root ---------------- */
export default function App() {
  const [toast, setToast] = useState("");

  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <GAListener />
      <PostLoginRedirect />
      <AppShell setToast={setToast} />
      <Toast message={toast} onClose={() => setToast("")} />
    </BrowserRouter>
  );
}
