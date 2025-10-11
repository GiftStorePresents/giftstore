// src/pages/MagicLogin.tsx
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { API_BASE } from "../api";

// Prosty helper do pobierania wartości ciasteczka
function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(
    new RegExp(`(?:^|; )${name.replace(/([.*+?^${}()|[\\]\\\\])/g, "\\$1")}=([^;]*)`)
  );
  return m ? decodeURIComponent(m[1]) : null;
}

export default function MagicLogin() {
  const [search] = useSearchParams();
  const token = search.get("token") || "";
  const navigate = useNavigate();
  const { setUser } = useAuth();

  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!token) {
      setErr("Brak tokenu.");
      setStatus("error");
      return;
    }

    (async () => {
      try {
        setStatus("loading");

        // 1) POST /magic/consume z nagłówkiem CSRF
        const csrf = getCookie("csrf"); // NAZWA MUSI się zgadzać z backendem
        const consumeRes = await fetch(`${API_BASE}/api/auth/magic/consume`, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            ...(csrf ? { "X-CSRF-Token": csrf } : {}),
          },
          body: JSON.stringify({ token }),
        });

        if (!consumeRes.ok) {
          let msg = "Błąd logowania magic link.";
          const ct = consumeRes.headers.get("content-type") || "";
          try {
            if (ct.includes("application/json")) {
              const data = await consumeRes.json();
              if (typeof data?.error === "string") msg = data.error;
              else if (typeof data?.message === "string") msg = data.message;
            } else {
              const text = await consumeRes.text();
              if (text) msg = text;
            }
          } catch {}
          throw new Error(msg);
        }

        // 2) Po udanym consume – pobierz stan z /auth/me, żeby UI natychmiast widział usera
        const meRes = await fetch(`${API_BASE}/api/auth/me`, { credentials: "include" });
        if (!meRes.ok) {
          // nie powinno się zdarzyć, ale obsłużmy
          throw new Error("Nie udało się potwierdzić zalogowania.");
        }
        const me = await meRes.json(); // { user, authenticated }
        setUser(me?.user ?? null);

        setStatus("done");
        navigate("/"); // przekierowanie po zalogowaniu
      } catch (e: any) {
        setErr(e?.message || "Błąd logowania.");
        setStatus("error");
      }
    })();
  }, [token, navigate, setUser]);

  return (
    <div className="p-6 text-center">
      {status === "loading" && <p>Loguję…</p>}
      {status === "error" && <p className="text-red-600">{err}</p>}
      {status === "done" && <p>Zalogowano. Przekierowanie…</p>}
    </div>
  );
}
