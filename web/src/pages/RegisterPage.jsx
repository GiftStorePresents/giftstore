// src/pages/RegisterPage.js
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import Alert from "../components/Alert";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;

function passwordScore(pw) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[a-z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(s, 4);
}

export default function RegisterPage() {
  const { login, user } = useAuth();
  const navigate = useNavigate();

  // Krok 1: formularz rejestracji
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });

  // Krok 2: wpisanie kodu
  const [step, setStep] = useState("form"); // 'form' | 'code'
  const [code, setCode] = useState("");

  // Komunikaty/UI
  const [localErr, setLocalErr] = useState("");
  const [serverErr, setServerErr] = useState("");
  const [info, setInfo] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Do verify/resend
  const [emailForVerify, setEmailForVerify] = useState("");
  const [passwordForVerify, setPasswordForVerify] = useState("");

  // Cooldown na ponowne wysłanie
  const [resendCooldown, setResendCooldown] = useState(0);
  useEffect(() => {
    if (!resendCooldown) return;
    const t = setInterval(() => setResendCooldown((v) => Math.max(0, v - 1)), 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  const score = useMemo(() => passwordScore(form.password), [form.password]);
  const scoreLabel =
    ["Bardzo słabe", "Słabe", "OK", "Dobre", "Bardzo dobre"][score] || "Bardzo słabe";

  useEffect(() => {
    if (user) navigate("/");
  }, [user, navigate]);

  // ---------- Krok 1: rejestracja ----------
  async function handleRegisterSubmit(e) {
    e.preventDefault();
    setLocalErr("");
    setServerErr("");
    setInfo("");

    if (!form.email || !form.password || !form.confirm) {
      setLocalErr("Uzupełnij wymagane pola.");
      return;
    }
    if (!emailRegex.test(form.email)) {
      setLocalErr("Podaj poprawny adres e-mail.");
      return;
    }
    if (form.password !== form.confirm) {
      setLocalErr("Hasła muszą być takie same.");
      return;
    }
    if (form.password.length < 8 || score < 2) {
      setLocalErr("Hasło powinno mieć min. 8 znaków i być silniejsze.");
      return;
    }

    try {
      setSubmitting(true);
      const resp = await api.auth.register(form.email, form.password, form.name || undefined);
      // Backend: { ok: true, needVerification: true, message? }
      setEmailForVerify(form.email);
      setPasswordForVerify(form.password);
      setInfo(resp?.message || "Wysłaliśmy kod weryfikacyjny na e-mail.");
      setStep("code");
      setResendCooldown(30); // 30s cooldown na ponowne wysłanie
    } catch (err) {
      setServerErr(err?.message || "Nie udało się zarejestrować.");
    } finally {
      setSubmitting(false);
    }
  }

  // ---------- Krok 2: weryfikacja kodu ----------
  async function handleVerifySubmit(e) {
    e.preventDefault();
    setLocalErr("");
    setServerErr("");
    setInfo("");

    const trimmed = (code || "").trim();
    if (!/^\d{6}$/.test(trimmed)) {
      setLocalErr("Wpisz 6-cyfrowy kod z e-maila.");
      return;
    }

    try {
      setSubmitting(true);
      // 1) potwierdź kod (ustawia verified=true i cookie token)
      await api.auth.verifyEmail(emailForVerify, trimmed);
      // 2) zaloguj, by mieć usera w kontekście
      await login(emailForVerify, passwordForVerify);
      // cleanup
      setPasswordForVerify("");
      setCode("");
      navigate("/");
    } catch (err) {
      setServerErr(err?.message || "Nie udało się zweryfikować kodu.");
    } finally {
      setSubmitting(false);
    }
  }

  // ---------- Wyślij kod ponownie ----------
  async function handleResend() {
    setLocalErr("");
    setServerErr("");
    setInfo("");
    if (!emailForVerify || !passwordForVerify) {
      setLocalErr("Brakuje danych do ponownego wysłania kodu. Wróć do rejestracji.");
      return;
    }
    if (resendCooldown > 0) return;

    try {
      setSubmitting(true);
      const resp = await api.auth.register(emailForVerify, passwordForVerify);
      setInfo(resp?.message || "Nowy kod został wysłany.");
      setResendCooldown(30);
    } catch (err) {
      setServerErr(err?.message || "Nie udało się wysłać kodu ponownie.");
    } finally {
      setSubmitting(false);
    }
  }

  // ---------- UI: krok „kod” ----------
  if (step === "code") {
    return (
      <div className="flex justify-center items-center min-h-[60vh] px-4">
        <form
          onSubmit={handleVerifySubmit}
          className="w-full max-w-sm bg-white/80 backdrop-blur rounded-xl shadow-lg p-6"
          aria-labelledby="verify-title"
        >
          <h1 id="verify-title" className="font-bold text-2xl mb-4 text-mainRed">
            Potwierdź e-mail
          </h1>

          {localErr && (
            <div className="mb-3">
              <Alert>{localErr}</Alert>
            </div>
          )}
          {serverErr && !localErr && (
            <div className="mb-3">
              <Alert>{serverErr}</Alert>
            </div>
          )}
          {info && (
            <div className="mb-3">
              <Alert type="info">{info}</Alert>
            </div>
          )}

          <p className="text-sm text-gray-700 mb-3">
            Wysłaliśmy 6-cyfrowy kod weryfikacyjny na adres <b>{emailForVerify}</b>. Przepisz go
            poniżej (kod ważny ~15 minut).
          </p>

          <label className="block text-sm font-semibold text-gray-700 mb-1" htmlFor="code">
            Kod z e-maila
          </label>
          <input
            id="code"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            placeholder="np. 123456"
            className="w-full p-2 rounded border mb-3 outline-none focus:ring-2 focus:ring-gold tracking-widest text-center"
            value={code}
            onChange={(e) => {
              const onlyDigits = e.target.value.replace(/\D/g, "").slice(0, 6);
              setCode(onlyDigits);
            }}
            required
          />

          <button
            type="submit"
            disabled={submitting || code.length !== 6}
            className={`w-full rounded py-2 font-bold transition ${
              submitting
                ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                : "bg-mainRed text-white hover:bg-gold hover:text-mainRed"
            }`}
          >
            {submitting ? "Sprawdzam kod…" : "Potwierdź"}
          </button>

          <div className="text-sm mt-3 text-center text-gray-700">
            Nie dostałeś kodu?{" "}
            <button
              type="button"
              onClick={handleResend}
              disabled={submitting || resendCooldown > 0}
              className="text-gold hover:underline disabled:opacity-60"
            >
              {resendCooldown > 0 ? `Wyślij ponownie za ${resendCooldown}s` : "Wyślij ponownie"}
            </button>
          </div>

          <div className="text-xs mt-2 text-center">
            Podałeś zły adres?{" "}
            <button
              type="button"
              onClick={() => setStep("form")}
              className="text-gray-500 hover:underline"
            >
              Wróć do rejestracji
            </button>
          </div>
        </form>
      </div>
    );
  }

  // ---------- UI: krok „formularz” ----------
  return (
    <div className="flex justify-center items-center min-h-[60vh] px-4">
      <form
        onSubmit={handleRegisterSubmit}
        className="w-full max-w-sm bg-white/80 backdrop-blur rounded-xl shadow-lg p-6"
        aria-labelledby="register-title"
      >
        <h1 id="register-title" className="font-bold text-2xl mb-4 text-mainRed">
          Rejestracja
        </h1>

        {localErr && (
          <div className="mb-3">
            <Alert>{localErr}</Alert>
          </div>
        )}
        {serverErr && !localErr && (
          <div className="mb-3">
            <Alert>{serverErr}</Alert>
          </div>
        )}
        {info && (
          <div className="mb-3">
            <Alert type="info">{info}</Alert>
          </div>
        )}

        <label className="block text-sm font-semibold text-gray-700 mb-1" htmlFor="name">
          Imię (opcjonalnie)
        </label>
        <input
          id="name"
          type="text"
          className="w-full p-2 rounded border mb-3 outline-none focus:ring-2 focus:ring-gold"
          placeholder="np. Jan"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />

        <label className="block text-sm font-semibold text-gray-700 mb-1" htmlFor="email">
          E-mail
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          className={`w-full p-2 rounded border mb-1 outline-none focus:ring-2 ${
            form.email && !emailRegex.test(form.email)
              ? "border-red-300 focus:ring-red-300"
              : "focus:ring-gold"
          }`}
          placeholder="np. jan@kowalski.pl"
          value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          required
        />
        {form.email && !emailRegex.test(form.email) && (
          <div className="text-xs text-red-600 mb-2">Nieprawidłowy adres e-mail.</div>
        )}

        <label className="block text-sm font-semibold text-gray-700 mb-1" htmlFor="password">
          Hasło
        </label>
        <input
          id="password"
          type="password"
          autoComplete="new-password"
          className="w-full p-2 rounded border mb-1 outline-none focus:ring-2 focus:ring-gold"
          placeholder="Min. 8 znaków"
          value={form.password}
          onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
          required
        />
        <div className="text-xs text-gray-600 mb-3">
          Siła hasła: <b>{scoreLabel}</b>
          <div className="h-1 bg-gray-200 rounded mt-1">
            <div
              className="h-1 bg-gold rounded transition-all"
              style={{ width: `${((score + 1) / 5) * 100}%` }}
            />
          </div>
        </div>

        <label className="block text-sm font-semibold text-gray-700 mb-1" htmlFor="confirm">
          Powtórz hasło
        </label>
        <input
          id="confirm"
          type="password"
          autoComplete="new-password"
          className="w-full p-2 rounded border mb-3 outline-none focus:ring-2 focus:ring-gold"
          placeholder="Powtórz hasło"
          value={form.confirm}
          onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))}
          required
        />

        <button
          type="submit"
          disabled={submitting}
          className={`w-full rounded py-2 font-bold transition ${
            submitting
              ? "bg-gray-300 text-gray-600 cursor-not-allowed"
              : "bg-mainRed text-white hover:bg-gold hover:text-mainRed"
          }`}
        >
          {submitting ? "Rejestruję…" : "Zarejestruj się"}
        </button>

        <div className="text-sm mt-3 text-center text-gray-700">
          Masz już konto?{" "}
          <Link to="/login" className="text-gold hover:underline">
            Zaloguj się
          </Link>
        </div>
      </form>
    </div>
  );
}
