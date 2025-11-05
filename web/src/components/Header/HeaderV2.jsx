// src/components/header/HeaderV2.jsx
import { useState } from "react";
import Container from "../Container";
import HeaderLogo from "./HeaderLogo";
import HeaderSearch from "./HeaderSearch";
import HeaderNavLinks from "./HeaderNavLinks";
import HeaderUser from "./HeaderUser";
import HeaderCartButton from "./HeaderCartButton";
import HeaderCategoriesDropdown from "./HeaderCategoriesDropdown";
import MobileSearchOverlay from "./MobileSearchOverlay";
import MiniCartDrawer from "../MiniCartDrawer";
import { useCart } from "../../context/CartContext";

export default function HeaderV2({
  variant = "solid-red", // "white" | "glass"
  sticky = true,
  elevated = true,
}) {
  const { drawerOpen, openDrawer, closeDrawer } = useCart();
  const [searchOpen, setSearchOpen] = useState(false);

  const base = sticky ? "sticky top-0" : "";
  const z = "z-[80]";
  const shadow =
    elevated && variant === "solid-red" ? "shadow-lg" : elevated ? "shadow-sm" : "";

  const skin =
    variant === "glass"
      ? "bg-white/85 dark:bg-[var(--surface)] backdrop-blur border-b border-black/5 dark:border-[var(--border)] text-mainRed"
      : variant === "white"
      ? "bg-white dark:bg-[var(--surface)] border-b border-black/5 dark:border-[var(--border)] text-mainRed"
      : "bg-mainRed text-white";

  return (
    <header className={`${base} ${z} ${skin} ${shadow}`}>
      <Container className="h-14 sm:h-16 flex items-center gap-3">
        {/* Logo */}
        <HeaderLogo />

        {/* Wyszukiwarka desktop */}
        <div className="hidden md:flex flex-1 max-w-[680px]">
          <HeaderSearch />
        </div>

        {/* Prawa strona */}
        <nav className="ml-auto flex items-center gap-3 sm:gap-4">
          {/* Mobile search trigger */}
          <button
            className="md:hidden p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5"
            onClick={() => setSearchOpen(true)}
            aria-label="Szukaj"
          >
            🔍
          </button>

          <HeaderNavLinks />
          <HeaderCategoriesDropdown />
          <HeaderUser />
          <HeaderCartButton onOpen={openDrawer} />
        </nav>
      </Container>

      {/* Mobile search overlay */}
      <MobileSearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />

      {/* Drawer koszyka */}
      <MiniCartDrawer open={drawerOpen} onClose={closeDrawer} />
    </header>
  );
}
