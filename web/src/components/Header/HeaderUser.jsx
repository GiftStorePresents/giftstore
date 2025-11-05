// src/components/header/HeaderUser.jsx
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

export default function HeaderUser() {
  const { user, logout } = useAuth();

  if (!user) {
    return (
      <div className="hidden sm:flex gap-3">
        <Link to="/login" className="hover:text-gold transition">
          Zaloguj się
        </Link>
        <Link to="/register" className="hover:text-gold transition">
          Rejestracja
        </Link>
      </div>
    );
  }

  return (
    <div className="hidden sm:flex gap-3 items-center max-w-[220px]">
      <span className="text-gold font-bold truncate" title={user.email}>
        {user.name || user.email}
      </span>
      <button onClick={logout} className="underline hover:text-gold text-sm">
        Wyloguj
      </button>
      <Link to="/profile" className="hover:text-gold font-bold">
        Profil
      </Link>
    </div>
  );
}
