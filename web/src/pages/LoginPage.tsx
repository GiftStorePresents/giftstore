// src/pages/LoginPage.tsx
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Alert from "../components/Alert";
import { API_BASE } from "../api";

// CSRF cookie (z backendu)
const CSRF_COOKIE_NAME = "csrf";
// Klucz do zapamiętania redirectu między ekranami
const REDIRECT_KEY = "postLoginRedirect";

// Pobranie wartości ciasteczka
function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${name.replace(/([.*+?^${}()|[\\]\\\\])/g, "\\$1")}=([^;]*)`)
  );
  return match ? decodeURIComponent(match[1]) : null;
}

export default function LoginPage() {
  const { login, loading, error, user } = useAuth();
  const navigate = useNavigate();
  const [sp] = useSearchParams();

  // Jeśli przyszliśmy z /login?redirect=/orders/XYZ — zapamiętaj to
  const redirectFromQuery = sp.get("redirect") || "";
  useEffect(() => {
    if (redirectFromQuery) sessionStorage.setItem(REDIRECT_KEY, redirectFromQuery);
  }, [redirectFromQuery]);

  // Cel powrotu po zalogowaniu
  const targetAfterLogin = useMemo(
    () => redirectFromQuery || sessionStorage.getItem(REDIRECT_KEY) || "/",
    [redirectFromQuery]
  );

  // Po zalogowaniu — wróć dokładnie tam skąd przyszedł użytkownik
  useEffect(() => {
    if (user) {
      const to = targetAfterLogin || "/";
      sessionStorage.removeItem(REDIRECT_KEY);
      navigate(to, { replace: true });
    }
  }, [user, navigate, targetAfterLogin]);

  // --- formularz hasełkowy ---
  const [form, setForm] = useState({ email: "", password: "" });
  const [localErr, setLocalErr] = useState("");
  const [showPwd, setShowPwd] = useState(false);

  // --- magic link (opcjonalny) ---
  const [showMagic, setShowMagic] = useState(false);
  const [magicEmail, setMagicEmail] = useState("");
  const [magicStatus, setMagicStatus] =
    useState<"idle" | "loading" | "success" | "error">("idle");
  const [magicMsg, setMagicMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalErr("");
    if (!form.email || !form.password) {
      setLocalErr("Wpisz email i hasło.");
      return;
    }
    if (targetAfterLogin) sessionStorage.setItem(REDIRECT_KEY, targetAfterLogin);
    await login(form.email, form.password);
  }

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    if (!magicEmail.trim()) {
      setMagicStatus("error");
      setMagicMsg("Podaj e-mail.");
      return;
    }
    setMagicStatus("loading");
    setMagicMsg("");

    try {
      const csrf = getCookie(CSRF_COOKIE_NAME);
      if (targetAfterLogin) sessionStorage.setItem(REDIRECT_KEY, targetAfterLogin);

      const res = await fetch(`${API_BASE}/api/auth/magic/start`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(csrf ? { "X-CSRF-Token": csrf } : {}),
        },
        body: JSON.stringify({ email: magicEmail.trim() }),
      });
      if (!res.ok) {
        let text = await res.text().catch(() => "");
        if (res.status === 403 && !text) {
          text =
            "Odrzucono z powodu CSRF. Odśwież stronę i spróbuj ponownie (lub przejdź najpierw na stronę główną).";
        }
        if (res.status === 429) text ||= "Poczekaj chwilę przed ponowną próbą.";
        throw new Error(text || "Nie udało się wysłać linku.");
      }
      setMagicStatus("success");
      setMagicMsg("Wysłaliśmy link logowania na e-mail. Sprawdź skrzynkę.");
    } catch (err: any) {
      setMagicStatus("error");
      setMagicMsg(err?.message || "Błąd podczas wysyłki linku.");
    }
  }

  return (
    <div className="flex justify-center items-center min-h-[60vh] px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-white/80 backdrop-blur rounded-xl shadow-lg p-6"
        aria-labelledby="login-title"
      >
        <h1 id="login-title" className="font-bold text-2xl mb-4 text-mainRed">
          Logowanie
        </h1>

        {/* E-mail */}
        <label className="block text-sm font-semibold text-gray-700 mb-1" htmlFor="email">
          E-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          className="w-full p-2 rounded border mb-3 outline-none focus:ring-2 focus:ring-gold"
          placeholder="np. jan@kowalski.pl"
          value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          required
        />

        {/* Hasło + toggle */}
        <label className="block text-sm font-semibold text-gray-700 mb-1" htmlFor="password">
          Hasło
        </label>
        <div className="flex items-stretch gap-2 mb-2">
          <input
            id="password"
            name="password"
            type={showPwd ? "text" : "password"}
            autoComplete="current-password"
            className="w-full p-2 rounded border outline-none focus:ring-2 focus:ring-gold"
            placeholder="Twoje hasło"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            required
          />
          <button
            type="button"
            onClick={() => setShowPwd((v) => !v)}
            className="px-3 rounded border bg-white hover:bg-gray-50 text-sm"
            aria-pressed={showPwd}
            aria-label={showPwd ? "Ukryj hasło" : "Pokaż hasło"}
          >
            {showPwd ? "Ukryj" : "Pokaż"}
          </button>
        </div>

        {(localErr || error) && (
          <div className="mb-3 animate-[fadeIn_150ms_ease]">
            <Alert>{localErr || error}</Alert>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className={`w-full rounded py-2 font-bold transition ${
            loading
              ? "bg-gray-300 text-gray-600 cursor-not-allowed"
              : "bg-mainRed text-white hover:bg-gold hover:text-mainRed"
          }`}
          aria-busy={loading ? "true" : "false"}
        >
          {loading ? "Logowanie…" : "Zaloguj się"}
        </button>

        {/* Google */}
        <div className="mt-3">
          <button
            type="button"
            className="w-full rounded py-2 font-bold bg-white text-gray-800 border hover:bg-gray-50"
            onClick={() => {
              if (targetAfterLogin) sessionStorage.setItem(REDIRECT_KEY, targetAfterLogin);
              window.location.href = `${API_BASE}/api/auth/google`;
            }}
          >
            Zaloguj przez Google
          </button>
        </div>

        {/* Apple — tymczasowo wyłączone */}
        {/*
        <button
          type="button"
          className="w-full rounded py-2 font-bold bg-white text-gray-800 border hover:bg-gray-50 mt-2"
          onClick={() => {
            if (targetAfterLogin) sessionStorage.setItem(REDIRECT_KEY, targetAfterLogin);
            window.location.href = `${API_BASE}/api/auth/apple`;
          }}
        >
          Zaloguj przez Apple
        </button>
        */}

        {/* Divider */}
        <div className="flex items-center gap-3 my-4 text-xs text-gray-500">
          <div className="flex-1 h-px bg-gray-200" />
          <span>lub</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        {/* Magic link (zwijany) */}
        <button
          type="button"
          className="w-full text-sm text-gray-700 hover:underline"
          onClick={() => setShowMagic((v) => !v)}
          aria-expanded={showMagic}
          aria-controls="magic-section"
        >
          {showMagic ? "Ukryj logowanie bez hasła" : "Zaloguj bez hasła (magic link)"}
        </button>

        {showMagic && (
          <div id="magic-section" className="mt-3 border-t pt-3">
            <p className="text-sm text-gray-700 mb-3">
              Wpisz e-mail, a wyślemy Ci link. Klikniesz go i zostaniesz zalogowany.
            </p>

            <label className="block text-sm font-semibold text-gray-700 mb-1" htmlFor="magic-email">
              E-mail
            </label>
            <div className="flex gap-2">
              <input
                id="magic-email"
                type="email"
                required
                placeholder="np. jan@kowalski.pl"
                className="w-full p-2 rounded border outline-none focus:ring-2 focus:ring-gold"
                value={magicEmail}
                onChange={(e) => setMagicEmail(e.target.value)}
              />
              <button
                type="button"
                onClick={sendMagicLink}
                disabled={magicStatus === "loading"}
                className={`px-4 rounded font-semibold ${
                  magicStatus === "loading"
                    ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                    : "bg-black text-white hover:bg-gray-900"
                }`}
                aria-busy={magicStatus === "loading" ? "true" : "false"}
              >
                {magicStatus === "loading" ? "Wysyłamy…" : "Wyślij link"}
              </button>
            </div>

            {magicStatus === "success" && (
              <p className="mt-2 text-green-700 text-sm">{magicMsg}</p>
            )}
            {magicStatus === "error" && (
              <p className="mt-2 text-red-700 text-sm">{magicMsg}</p>
            )}
          </div>
        )}

        {/* Linki pomocnicze */}
        <div className="text-sm mt-4 text-center text-gray-700">
          Nie masz konta?{" "}
          <Link to="/register" className="text-gold hover:underline">
            Zarejestruj się
          </Link>
        </div>
        <div className="text-xs mt-2 text-center">
          <Link to="/forgot" className="text-gray-500 hover:underline">
            Zapomniałeś hasła?
          </Link>
        </div>
      </form>
    </div>
  );
}
