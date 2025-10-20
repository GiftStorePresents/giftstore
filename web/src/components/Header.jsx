// src/components/Header.jsx
import { FaGift, FaShoppingCart, FaHeart } from "react-icons/fa";
import { Link, useLocation } from "react-router-dom";
import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronDown, Search as SearchIcon, X as CloseIcon, Newspaper } from "lucide-react";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import SearchBar from "./SearchBar";
import MiniCartDrawer from "./MiniCartDrawer";

// Kategorie do dropdowna
const categories = [
  { name: "Wszystkie", link: "/categories/wszystkie" },
  { name: "Dla niej", link: "/categories/dla-niej" },
  { name: "Dla niego", link: "/categories/dla-niego" },
  { name: "Na urodziny", link: "/categories/na-urodziny" },
  { name: "Dla dzieci", link: "/categories/dla-dzieci" },
  { name: "Dla mamy", link: "/categories/dla-mamy" },
  { name: "Dla taty", link: "/categories/dla-taty" },
];

export default function Header() {
  const { cart, drawerOpen, openDrawer, closeDrawer } = useCart();
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const { user, logout } = useAuth();
  const location = useLocation();

  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const menuRef = useRef(null);
  const firstCatRef = useRef(null);
  const triggerRef = useRef(null);
  const cartIconRef = useRef(null);

  // Zamknięcie menu po kliknięciu poza nim
  useEffect(() => {
    const onClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener("mousedown", onClickOutside);
      return () => document.removeEventListener("mousedown", onClickOutside);
    }
  }, [menuOpen]);

  // ESC zamyka wyszukiwarkę (mobile overlay)
  useEffect(() => {
    const onEsc = (e) => {
      if (e.key === "Escape") setSearchOpen(false);
    };
    if (searchOpen) {
      document.addEventListener("keydown", onEsc);
      return () => document.removeEventListener("keydown", onEsc);
    }
  }, [searchOpen]);

  // Obsługa klawiatury dla dropdowna
  const onCategoriesKeyDown = useCallback(
    (e) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        triggerRef.current?.focus();
      }
      if (
        (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") &&
        !menuOpen
      ) {
        e.preventDefault();
        setMenuOpen(true);
        setTimeout(() => firstCatRef.current?.focus(), 0);
      }
    },
    [menuOpen]
  );

  // Animacja koszyka po dodaniu produktu
  useEffect(() => {
    const boop = () => {
      const el = cartIconRef.current;
      if (!el) return;
      try {
        el.classList.remove("animate-bounce");
        // @ts-ignore wymuszenie reflow
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
      <div className="w-full px-3 sm:px-4 lg:px-6">
        {/* Pasek: logo — wyszukiwarka — akcje */}
        <div className="h-16 flex items-center gap-3">
          {/* Logo */}
          <Link to="/" className="logo flex items-center gap-2 text-2xl font-bold hover:text-gold transition shrink-0">
            <FaGift className="logo-icon text-gold" size={32} />
            <span className="logo-text">Gift Store</span>
          </Link>

          {/* SearchBar desktop */}
          <div className="hidden lg:flex flex-1 mx-4 header-search">
            <SearchBar />
          </div>

          {/* Prawa strona nawigacji + akcje */}
          <nav className="ml-auto flex items-center gap-4 md:gap-6 font-semibold relative">
            {/* Mobile: ikona szukaj */}
            <button
              type="button"
              className="lg:hidden inline-flex items-center justify-center rounded-xl px-2 py-2 hover:text-gold transition"
              aria-label="Szukaj"
              onClick={() => setSearchOpen(true)}
              title="Szukaj"
            >
              <SearchIcon size={22} />
            </button>

            {/* Mobile: skrót do bloga (ikona) */}
            <Link
              to="/blog"
              className="lg:hidden inline-flex items-center justify-center rounded-xl px-2 py-2 hover:text-gold transition"
              aria-label="Blog"
              title="Blog"
            >
              <Newspaper size={22} />
            </Link>

            {/* Desktop: Home */}
            <Link
              to="/"
              className={`hover:text-gold transition hidden sm:inline ${
                location.pathname === "/" ? "text-gold underline" : ""
              }`}
              aria-current={location.pathname === "/" ? "page" : undefined}
            >
              Home
            </Link>

            {/* Desktop: Blog */}
            <Link
              to="/blog"
              className={`hover:text-gold transition hidden sm:inline ${
                isActive("/blog") ? "text-gold underline" : ""
              }`}
              aria-current={isActive("/blog") ? "page" : undefined}
            >
              Blog
            </Link>

            {/* Kategorie */}
            <div
              className="relative hidden sm:block"
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
                  if (!menuOpen) {
                    setTimeout(() => firstCatRef.current?.focus(), 0);
                  }
                }}
              >
                Kategorie <ChevronDown size={18} />
              </button>

              {menuOpen && (
                <div
                  id="categories-menu"
                  role="menu"
                  className="absolute right-0 top-full w-56 bg-white text-mainRed rounded-xl shadow-2xl border border-gold z-50 animate-fadeIn flex flex-col py-2"
                >
                  {categories.map((cat, idx) => (
                    <Link
                      to={cat.link}
                      key={cat.link}
                      role="menuitem"
                      ref={idx === 0 ? firstCatRef : null}
                      className="px-5 py-2 hover:bg-gold hover:text-mainRed rounded-lg transition font-bold focus:outline-none focus:ring-2 focus:ring-gold"
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
              className="hover:text-gold transition flex items-center gap-1"
              title="Ulubione"
              aria-current={isActive("/wishlist") ? "page" : undefined}
            >
              <FaHeart className="text-gold" aria-hidden />
              <span className="hidden sm:inline">Ulubione</span>
            </Link>

            {/* Admin (tylko ADMIN) */}
            {user?.role === "ADMIN" && (
              <Link
                to="/admin/products"
                className="hover:text-gold transition hidden sm:inline"
                aria-current={isActive("/admin") ? "page" : undefined}
              >
                Admin
              </Link>
            )}

            {/* Logowanie / Profil */}
            {!user ? (
              <>
                <Link to="/login" className="hover:text-gold transition hidden sm:inline">
                  Zaloguj się
                </Link>
                <Link to="/register" className="hover:text-gold transition hidden sm:inline">
                  Rejestracja
                </Link>
              </>
            ) : (
              <div className="hidden sm:flex gap-3 items-center max-w-[220px]">
                <span
                  className="text-gold font-bold truncate"
                  title={user.email}
                >
                  {user.name || user.email}
                </span>
                <button
                  onClick={logout}
                  className="hover:text-gold transition underline text-sm"
                >
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
              className="cart-trigger flex flex-col items-center justify-center hover:text-gold transition relative"
              aria-label="Otwórz koszyk"
              title="Koszyk"
            >
              <div ref={cartIconRef} className="relative flex items-center justify-center">
                <FaShoppingCart size={26} aria-hidden />
                {cartCount > 0 && (
                  <span
                    className="cart-badge absolute -top-2 -right-3 bg-gold !text-mainRed font-bold rounded-full px-2 py-0.5 text-xs shadow"
                    data-cart-count={cartCount}
                  >
                    {cartCount}
                  </span>
                )}
              </div>
              <span className="mt-0.5 hidden sm:inline" style={{ lineHeight: "1" }}>
                Koszyk
              </span>
            </button>
          </nav>
        </div>

        {/* Wyszukiwarka pod paskiem na <lg (overlay) */}
        {searchOpen && (
          <div className="lg:hidden px-3 sm:px-4 py-3 bg-mainRed/96 backdrop-blur shadow-lg">
            <div className="flex items-center gap-3 header-search">
              <SearchBar />
              <button
                type="button"
                onClick={() => setSearchOpen(false)}
                className="ml-2 rounded-xl p-2 hover:bg-white/10 transition"
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
