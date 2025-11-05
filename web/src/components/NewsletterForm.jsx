// src/components/NewsletterForm.jsx
import { useState } from "react";

const API_BASE =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) || "";

export default function NewsletterForm({ className = "", messagesBelow = false }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState("");
  const [err, setErr] = useState("");

  const onSubmit = async (e) => {
    e.preventDefault();
    if (busy) return;

    setOk("");
    setErr("");

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setErr("Podaj poprawny adres e-mail.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/newsletter/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      let data = null;
      try { data = await res.json(); } catch {}

      if (!res.ok) {
        let txt = "";
        try { txt = await res.text(); } catch {}
        throw new Error(
          data?.error || data?.detail || data?.title || txt || "Nie udało się zapisać."
        );
      }

      if (data?.duplicate) {
        setOk("Ten e-mail jest już zapisany ✅");
      } else {
        setOk("Dziękujemy! Sprawdź skrzynkę 📬");
      }
      setEmail("");
    } catch (_e) {
      setErr("Nie udało się zapisać. Spróbuj ponownie.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      aria-label="Zapis do newslettera"
      className={`flex flex-col gap-2 w-full sm:w-auto ${className}`}
    >
      <label htmlFor="newsletter-email" className="sr-only">E-mail</label>

      {/* wiersz: input + button */}
      <div className="flex flex-nowrap items-center gap-2 w-full">
        <input
          id="newsletter-email"
          type="email"
          required
          placeholder="Twój e-mail"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-10 flex-1 min-w-0 px-3 rounded-xl bg-white text-black placeholder-gray-500
                     outline-none border border-white/60 focus:border-yellow-300 shadow"
        />
        <button
          type="submit"
          disabled={busy}
          className="h-10 px-4 rounded-xl bg-yellow-400 text-mainRed font-medium
                     hover:bg-yellow-300 disabled:opacity-60 disabled:cursor-not-allowed
                     transition whitespace-nowrap shrink-0 leading-none"
        >
          {busy ? "Wysyłanie..." : "Zapisz się"}
        </button>
      </div>

      {/* komunikaty — ZAWSZE POD formularzem, jeśli messagesBelow = true */}
      <div
        className={
          messagesBelow
            ? "w-full text-left mt-1"
            : "w-full sm:w-auto text-center sm:text-left mt-1 sm:mt-0"
        }
      >
        {ok && (
          <span
            className={
              messagesBelow
                ? "block text-green-200 text-xs"
                : "block sm:inline text-green-200 text-xs whitespace-nowrap"
            }
          >
            {ok}
          </span>
        )}
        {err && (
          <span
            className={
              messagesBelow
                ? "block text-red-200 text-xs"
                : "block sm:inline text-red-200 text-xs whitespace-nowrap"
            }
          >
            {err}
          </span>
        )}
      </div>
    </form>
  );
}
