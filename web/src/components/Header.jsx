// src/components/Header.jsx
import { FaGift, FaShoppingCart, FaHeart } from "react-icons/fa";
import { Link, useLocation } from "react-router-dom";
import { useState, useRef, useEffect, useCallback } from "react";
import {
  ChevronDown,
  Search as SearchIcon,
  X as CloseIcon,
  Newspaper,
  UserCircle2,
  LogIn,
  UserPlus,
} from "lucide-react";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import SearchBar from "./SearchBar";
import MiniCartDrawer from "./MiniCartDrawer";
import { API_BASE } from "../api";

/** Normalizacja odpowiedzi API -> jednolity kształt kategorii */
function normalizeCategories(payload) {
  const arr = Array.isArray(payload)
    ? payload
    : payload?.items || payload?.categories || [];
  return (arr || []).map((c) => ({
    id: c.id || c.slug,
    name: c.name,
    slug: c.slug,
    showInHeader: c.showInHeader !== false,
  }));
}

export default function Header() {
  const { cart, drawerOpen, openDrawer, closeDrawer } = useCart();
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const { user, logout } = useAuth();
  const location = useLocation();

  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [authMenuOpen, setAuthMenuOpen] = useState(false);
  const [cats, setCats] = useState([]);

  const menuRef = useRef(null);
  const firstCatRef = useRef(null);
  const triggerRef = useRef(null);
  const authRef = useRef(null);
  const cartIconRef = useRef(null);

  // === Pobieranie dynamicznych kategorii (header) ===
  const fetchHeaderCats = useCallback(async () => {
    const commonInit = { credentials: "include", cache: "no-store" };
    try {
      const r = await fetch(`${API_BASE}/api/categories`, commonInit);
      if (r.ok) {
        const data = normalizeCategories(await r.json());
        setCats(
          data.filter(
            (c) => c.showInHeader && c.slug && c.slug !== "bez-kategorii"
          )
        );
        return;
      }
    } catch {}
    try {
      const r2 = await fetch(`${API_BASE}/api/admin/categories`, commonInit);
      if (r2.ok) {
        const data = normalizeCategories(await r2.json());
        setCats(
          data.filter(
            (c) => c.showInHeader && c.slug && c.slug !== "bez-kategorii"
          )
        );
        return;
      }
    } catch {}
    setCats([]); // w ostateczności pusto
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      await fetchHeaderCats();
      if (!alive) return;
    })();
    return () => {
      alive = false;
    };
  }, [fetchHeaderCats]);

  // 🔄 Miękkie odświeżanie z App.jsx lub innych miejsc
  useEffect(() => {
    const reload = () => fetchHeaderCats();
    window.addEventListener("categories:refresh", reload);
    return () => window.removeEventListener("categories:refresh", reload);
  }, [fetchHeaderCats]);

  // zamykanie dropdownów poza kliknięciem
  useEffect(() => {
    const onClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
      if (authRef.current && !authRef.current.contains(e.target)) setAuthMenuOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  // ESC zamyka mobile search i dropdowny
  useEffect(() => {
    const onEsc = (e) => {
      if (e.key === "Escape") {
        setSearchOpen(false);
        setMenuOpen(false);
        setAuthMenuOpen(false);
      }
    };
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, []);

  // klawiatura dla kategorii
  const onCategoriesKeyDown = useCallback(
    (e) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        triggerRef.current?.focus();
      }
      if ((e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") && !menuOpen) {
        e.preventDefault();
        setMenuOpen(true);
        setTimeout(() => firstCatRef.current?.focus(), 0);
      }
    },
    [menuOpen]
  );

  // animacja koszyka po dodaniu
  useEffect(() => {
    const boop = () => {
      const el = cartIconRef.current;
      if (!el) return;
      try {
        el.classList.remove("animate-bounce");
        // wymuszenie reflow
        // eslint-disable-next-line no-unused-expressions
        el.offsetWidth;
        el.classList.add("animate-bounce");
        setTimeout(() => el.classList.remove("animate-bounce"), 1000);
      } catch {}
    };
    window.addEventListener("cart:add", boop);
    return () => window.removeEventListener("cart:add", boop);
  }, []);

  const isActive = (pathPrefix) => location.pathname.startsWith(pathPrefix);

  return (
    <header className="sticky top-0 z-50 bg-mainRed text-white shadow-lg">
      <div className="w-full px-3 xs:px-3.5 sm:px-4 lg:px-6 max-[379px]:px-2.5">
        {/* pasek: logo — search — akcje */}
        <div className="h-14 xs:h-[3.6rem] md:h-16 flex items-center gap-2 xs:gap-3 md:gap-4 max-[379px]:h-13 max-[379px]:gap-1.5">
          {/* Logo */}
          <Link
            to="/"
            className="logo flex items-center gap-2 text-[20px] xs:text-[22px] md:text-2xl font-bold hover:text-gold transition shrink-0"
          >
            <FaGift className="logo-icon text-gold max-[379px]:w-[22px] max-[379px]:h-[22px]" size={26} />
            <span className="logo-text">Gift Store</span>
          </Link>

          {/* Search desktop */}
          <div className="hidden lg:flex flex-1 mx-2 md:mx-4 header-search min-w-0">
            <SearchBar />
          </div>

          {/* NAV / akcje */}
          <nav className="ml-auto flex items-center min-w-0 gap-3 xs:gap-3 md:gap-4 font-semibold relative max-[379px]:gap-2">
            {/* Mobile: przycisk szukaj */}
            <button
              type="button"
              className="lg:hidden inline-flex items-center justify-center rounded-xl p-2 max-[379px]:p-1.5 hover:text-gold transition shrink-0"
              aria-label="Szukaj"
              onClick={() => setSearchOpen(true)}
              title="Szukaj"
            >
              <SearchIcon className="w-[20px] h-[20px] xs:w-[22px] xs:h-[22px] max-[379px]:w-[18px] max-[379px]:h-[18px]" />
            </button>

            {/* Mobile: Blog ikona (ukryj < 380px) */}
            <Link
              to="/blog"
              className="lg:hidden inline-flex items-center justify-center rounded-xl p-2 hover:text-gold transition shrink-0 max-[379px]:hidden"
              aria-label="Blog"
              title="Blog"
            >
              <Newspaper className="w-[20px] h-[20px] xs:w-[22px] xs:h-[22px]" />
            </Link>

            {/* Desktop linki – od LG */}
            <Link
              to="/"
              className={`hidden lg:inline hover:text-gold transition ${
                location.pathname === "/" ? "text-gold underline" : ""
              }`}
              aria-current={location.pathname === "/" ? "page" : undefined}
            >
              Home
            </Link>

            <Link
              to="/blog"
              className={`hidden lg:inline hover:text-gold transition ${
                isActive("/blog") ? "text-gold underline" : ""
              }`}
              aria-current={isActive("/blog") ? "page" : undefined}
            >
              Blog
            </Link>

            {/* Kategorie – od MD+ */}
            <div
              className="relative hidden md:block"
              onMouseEnter={() => setMenuOpen(true)}
              onMouseLeave={() => setMenuOpen(false)}
              ref={menuRef}
            >
              <button
                ref={triggerRef}
                className={`flex items-center gap-1 hover:text-gold transition ${
                  isActive("/categories") ? "text-gold underline" : ""
                }`}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-controls="categories-menu"
                onKeyDown={onCategoriesKeyDown}
                onClick={() => {
                  setMenuOpen((v) => !v);
                  if (!menuOpen) setTimeout(() => firstCatRef.current?.focus(), 0);
                }}
              >
                Kategorie <ChevronDown size={18} />
              </button>

              {menuOpen && (
                <div
                  id="categories-menu"
                  role="menu"
                  className="absolute right-0 top-full w-56 bg-white text-mainRed rounded-xl shadow-2xl border border-gold z-50 animate-fadeIn flex flex-col py-2
                             dark:bg-[var(--surface)] dark:text-[var(--text)] dark:border-[var(--border)]"
                >
                  {/* Stała pozycja: Wszystkie */}
                  <Link
                    to="/categories/wszystkie"
                    role="menuitem"
                    ref={firstCatRef}
                    className="px-5 py-2 rounded-lg transition font-bold focus:outline-none focus:ring-2 focus:ring-gold
                               hover:bg-gold hover:text-mainRed
                               dark:hover:bg-white/10 dark:hover:text-[var(--text)]"
                    onClick={() => setMenuOpen(false)}
                  >
                    Wszystkie
                  </Link>

                  {/* Dynamiczne kategorie z API */}
                  {cats.map((cat) => (
                    <Link
                      to={`/categories/${cat.slug}`}
                      key={cat.id || cat.slug}
                      role="menuitem"
                      className="px-5 py-2 rounded-lg transition font-bold focus:outline-none focus:ring-2 focus:ring-gold
                                 hover:bg-gold hover:text-mainRed
                                 dark:hover:bg-white/10 dark:hover:text-[var(--text)]"
                      onClick={() => setMenuOpen(false)}
                    >
                      {cat.name}
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Wishlist */}
            <Link
              to="/wishlist"
              className="hover:text-gold transition flex items-center gap-1 shrink-0"
              title="Ulubione"
              aria-current={isActive("/wishlist") ? "page" : undefined}
            >
              <FaHeart
                className="text-gold w-[18px] h-[18px] xs:w-[20px] xs:h-[20px] max-[379px]:w-[17px] max-[379px]:h-[17px]"
                aria-hidden
              />
              <span className="hidden lg:inline">Ulubione</span>
            </Link>

            {/* AUTH */}
            {!user ? (
              <>
                {/* Pełne linki tylko na LG+ */}
                <Link to="/login" className="hidden lg:inline hover:text-gold transition">
                  Zaloguj się
                </Link>
                <Link to="/register" className="hidden lg:inline hover:text-gold transition">
                  Rejestracja
                </Link>

                {/* Zwarta wersja auth na < lg */}
                <div className="relative lg:hidden" ref={authRef}>
                  <button
                    type="button"
                    onClick={() => setAuthMenuOpen((v) => !v)}
                    className="inline-flex items-center gap-1 rounded-xl p-2 max-[379px]:p-1.5 transition hover:text-gold"
                    aria-haspopup="menu"
                    aria-expanded={authMenuOpen}
                    aria-label="Konto"
                    title="Konto"
                  >
                    <UserCircle2 className="w-[22px] h-[22px] max-[379px]:w-[20px] max-[379px]:h-[20px]" />
                  </button>

                  {authMenuOpen && (
                    <div
                      role="menu"
                      className="absolute right-0 top-full mt-2 w-48 rounded-xl shadow-2xl z-50 animate-fadeIn p-2
                                 bg-white text-mainRed border border-gold
                                 dark:bg-[var(--surface)] dark:text-[var(--text)] dark:border-[var(--border)]"
                    >
                      <Link
                        to="/login"
                        className="flex items-center gap-2 px-3 py-2 rounded-lg transition
                                   hover:bg-gold/20
                                   dark:hover:bg-white/10"
                        onClick={() => setAuthMenuOpen(false)}
                      >
                        <LogIn size={18} /> Zaloguj się
                      </Link>
                      <Link
                        to="/register"
                        className="mt-1 flex items-center gap-2 px-3 py-2 rounded-lg transition
                                   hover:bg-gold/20
                                   dark:hover:bg-white/10"
                        onClick={() => setAuthMenuOpen(false)}
                      >
                        <UserPlus size={18} /> Rejestracja
                      </Link>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="hidden lg:flex gap-3 items-center max-w-[220px]">
                <span className="text-gold font-bold truncate" title={user.email}>
                  {user.name || user.email}
                </span>
                <button onClick={logout} className="hover:text-gold transition underline text-sm">
                  Wyloguj
                </button>
                <Link
                  to="/profile"
                  className="hover:text-gold transition font-bold"
                  aria-current={isActive("/profile") ? "page" : undefined}
                >
                  Profil
                </Link>
              </div>
            )}

            {/* Koszyk */}
            <button
              type="button"
              onClick={openDrawer}
              className="cart-trigger flex flex-col items-center justify-center hover:text-gold transition relative shrink-0"
              aria-label="Otwórz koszyk"
              title="Koszyk"
            >
              <div ref={cartIconRef} className="relative flex items-center justify-center">
                <FaShoppingCart
                  className="w-[20px] h-[20px] xs:w-[22px] xs:h-[22px] md:w-[26px] md:h-[26px] max-[379px]:w-[19px] max-[379px]:h-[19px]"
                  aria-hidden
                />
                {cartCount > 0 && (
                  <span
                    className="cart-badge !text-mainRed absolute -top-2 -right-3 bg-gold font-bold rounded-full px-2 py-0.5 text-xs shadow
                               max-[379px]:-top-1.5 max-[379px]:-right-2.5"
                    data-cart-count={cartCount}
                  >
                    {cartCount}
                  </span>
                )}
              </div>
              <span className="mt-0.5 hidden lg:inline" style={{ lineHeight: "1" }}>
                Koszyk
              </span>
            </button>
          </nav>
        </div>

        {/* Wyszukiwarka pod paskiem na <lg (overlay) */}
        {searchOpen && (
          <div className="lg:hidden px-3 xs:px-3.5 sm:px-4 py-3 max-[379px]:px-2.5 max-[379px]:py-2.5 bg-mainRed/96 backdrop-blur shadow-lg">
            <div className="flex items-center gap-2 xs:gap-3 header-search">
              <SearchBar />
              <button
                type="button"
                onClick={() => setSearchOpen(false)}
                className="ml-1 xs:ml-2 rounded-xl p-2 max-[379px]:p-1.5 hover:bg-white/10 transition"
                aria-label="Zamknij wyszukiwanie"
                title="Zamknij"
              >
                <CloseIcon size={20} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Drawer koszyka */}
      <MiniCartDrawer open={drawerOpen} onClose={closeDrawer} />
    </header>
  );
}
