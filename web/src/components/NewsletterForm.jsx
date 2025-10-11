import { useState } from "react";

const API_BASE =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) || "";

export default function NewsletterForm({ className = "" }) {
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

      // spróbuj odczytać JSON; jeśli nie ma, przechwyci się w catch
      let data = null;
      try { data = await res.json(); } catch {}

      if (!res.ok) {
        // jeśli backend zwrócił plain text – spróbuj go pobrać
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
      className={`flex gap-2 items-center w-full sm:w-auto ${className}`}
      aria-label="Zapis do newslettera"
    >
      <label htmlFor="newsletter-email" className="sr-only">E-mail</label>
      <input
        id="newsletter-email"
        type="email"
        required
        placeholder="Twój e-mail"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        // usunięty ring; zwykły border + focus
        className="w-full sm:w-64 px-3 py-2 rounded-xl bg-white text-black placeholder-gray-500 outline-none
                   border border-white/60 focus:border-yellow-300 shadow"
      />
      <button
        type="submit"
        disabled={busy}
        className="px-4 py-2 rounded-xl bg-yellow-400 text-black font-medium
                   hover:bg-yellow-300 disabled:opacity-60 disabled:cursor-not-allowed transition"
      >
        {busy ? "Wysyłanie..." : "Zapisz się"}
      </button>

      {/* kompaktowe komunikaty */}
      {ok && <span className="ml-2 text-green-200 text-xs">{ok}</span>}
      {err && <span className="ml-2 text-red-200 text-xs">{err}</span>}
    </form>
  );
}
