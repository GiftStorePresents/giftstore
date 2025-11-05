// src/components/header/HeaderNavLinks.jsx
import { Link, useLocation } from "react-router-dom";

export default function HeaderNavLinks() {
  const location = useLocation();
  const isActive = (path) => location.pathname.startsWith(path);

  return (
    <div className="hidden sm:flex items-center gap-4 font-semibold">
      <Link
        to="/"
        className={`hover:text-gold transition ${location.pathname === "/" ? "text-gold underline" : ""}`}
      >
        Home
      </Link>
      <Link
        to="/blog"
        className={`hover:text-gold transition ${isActive("/blog") ? "text-gold underline" : ""}`}
      >
        Blog
      </Link>
    </div>
  );
}