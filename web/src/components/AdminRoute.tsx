import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, authLoading } = useAuth();

  // Poczekaj aż /me się załaduje
  if (authLoading) {
    return <div className="p-8 text-center">Ładowanie…</div>;
  }

  // Brak zalogowania → na /login
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Brak uprawnień → na stronę główną
  if (user.role !== "ADMIN") {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
