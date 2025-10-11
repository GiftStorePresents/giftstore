// src/pages/ConfirmEmailChangePage.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { API_BASE } from "../api";

// Nazwa CSRF cookie musi być spójna z backendem
const CSRF_COOKIE_NAME = "csrf";

// Prosty helper do pobrania wartości ciasteczka
function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${name.replace(/([.*+?^${}()|[\\]\\\\])/g, "\\$1")}=([^;]*)`)
  );
  return match ? decodeURIComponent(match[1]) : null;
}

export default function ConfirmEmailChangePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [state, setState] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [message, setMessage] = useState<string>("");
  const didRun = useRef(false);

  const token = useMemo(() => (params.get("token") || "").trim(), [params]);

  useEffect(() => {
    if (didRun.current) return;
    didRun.current = true;

    // brak tokenu → pokaż błąd
    if (!token) {
      setState("error");
      setMessage("Brak tokenu w adresie. Użyj linku z wiadomości e‑mail.");
      return;
    }

    (async () => {
      try {
        setState("loading");
        setMessage("Potwierdzam zmianę e‑maila…");

        const res = await fetch(`${API_BASE}/api/auth/change-email/confirm`, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": getCookie(CSRF_COOKIE_NAME) ?? "",
          },
          body: JSON.stringify({ token }),
        });

        if (!res.ok) {
          let msg = "Nie udało się potwierdzić zmiany e‑maila.";
          try {
            const ct = res.headers.get("content-type") || "";
            if (ct.includes("application/json")) {
              const j = await res.json();
              if (typeof j?.error === "string") msg = j.error;
              else if (typeof j?.message === "string") msg = j.message;
            } else {
              const t = await res.text();
              if (t) msg = t || msg;
            }
          } catch {}
          throw new Error(msg);
        }

        setState("ok");
        setMessage("E‑mail został zmieniony. Zaloguj się ponownie.");

        // Opcjonalnie: automatyczne przejście do /login po 2.5s
        const t = setTimeout(() => navigate("/login"), 2500);
        return () => clearTimeout(t);
      } catch (err: any) {
        setState("error");
        setMessage(err?.message || "Błąd podczas potwierdzania zmiany e‑maila.");
      }
    })();
  }, [token, navigate]);

  return (
    <div className="max-w-lg mx-auto mt-16 bg-white shadow-xl rounded-3xl p-8 border-2 border-gold">
      <h1 className="text-2xl font-bold text-mainRed mb-4">Potwierdzenie zmiany e‑maila</h1>

      {state === "loading" && (
        <p className="text-gray-700">Trwa potwierdzanie… chwileczkę.</p>
      )}

      {(state === "ok" || state === "error") && (
        <div
          className={`p-4 rounded-xl ${
            state === "ok" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
          }`}
        >
          {message}
        </div>
      )}

      <div className="mt-6 flex gap-3">
        <Link
          to="/"
          className="px-4 py-2 rounded-xl font-bold border border-gray-300 bg-white hover:bg-gray-50 transition"
        >
          Strona główna
        </Link>
        <button
          onClick={() => navigate("/login")}
          className="px-4 py-2 rounded-xl font-bold bg-mainRed text-white hover:bg-gold hover:text-mainRed transition"
        >
          Przejdź do logowania
        </button>
      </div>
    </div>
  );
}
