// src/pages/ContactPage.jsx
import { useState, useRef } from "react";
import { API_BASE } from "../api";

const TOPICS = [
  "Weryfikacja płatności",
  "Status zamówienia",
  "Jak dokonać zwrotu",
  "Reklamacje",
  "Braki lub uszkodzony towar w zamówieniu",
  "Pytanie o dostępność",
  "Anulacja zamówienia",
  "Inne",
];

// ===== CSRF jak w LoginPage.tsx =====
const CSRF_COOKIE_NAME = "csrf";
function getCookie(name) {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(
    new RegExp(`(?:^|; )${name.replace(/([.*+?^${}()|[\\]\\\\])/g, "\\$1")}=([^;]*)`)
  );
  return m ? decodeURIComponent(m[1]) : null;
}

// Konfigurowalny endpoint (zostaw /api/contact jeśli już masz backend)
const CONTACT_ENDPOINT = `${API_BASE}/api/contact`;
// Adres admina do fallbacku (tylko przy braku backendu)
const ADMIN_EMAIL_FALLBACK = "admin@twojadomena.pl";

export default function ContactPage() {
  const [topic, setTopic] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [orderNo, setOrderNo] = useState("");
  const [message, setMessage] = useState("");
  const [agree, setAgree] = useState(false);
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const honeypot = useRef("");

  function onPickFiles(e) {
    const picked = Array.from(e.target.files || []);
    const allowed = picked.filter((f) => /(\.pdf|\.png|\.jpe?g)$/i.test(f.name));
    const next = [...files, ...allowed].slice(0, 5);
    setFiles(next);
    e.target.value = "";
  }
  function removeFile(i) {
    setFiles((arr) => arr.filter((_, idx) => idx !== i));
  }

  function validate() {
    if (!topic) return "Wybierz powód kontaktu.";
    if (!name.trim()) return "Podaj imię i nazwisko.";
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Podaj poprawny adres e-mail.";
    if (!message.trim() || message.trim().length < 10) return "Opisz zgłoszenie (min. 10 znaków).";
    if (!agree) return "Zaznacz zgodę na przetwarzanie danych.";
    if (honeypot.current?.value) return "Wykryto spam.";
    return "";
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (busy) return;
    setError("");
    setToast("");

    const v = validate();
    if (v) { setError(v); return; }

    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("topic", topic);
      fd.append("name", name);
      fd.append("email", email);
      if (phone) fd.append("phone", phone);
      if (orderNo) {
        // zgodność z różnymi backendami:
        fd.append("orderId", orderNo);
        fd.append("orderNumber", orderNo);
      }
      fd.append("message", message);
      fd.append("consent", String(agree));   // "true"/"false"
      fd.append("replyTo", email);           // ułatwia odpowiedź po stronie serwera

      // pliki — kompatybilność: files oraz files[]
      files.forEach((f) => {
        fd.append("files", f, f.name);
        fd.append("files[]", f, f.name);
      });

      const csrf = getCookie(CSRF_COOKIE_NAME);
      const res = await fetch(CONTACT_ENDPOINT, {
        method: "POST",
        credentials: "include",
        headers: csrf ? { "X-CSRF-Token": csrf } : undefined, // ⬅️ tylko CSRF, bez Content-Type (ustawi FormData)
        body: fd,
      });

      if (!res.ok) {
        let txt = await res.text().catch(() => "");
        if (res.status === 403 && !txt) {
          txt = "Odrzucono z powodu CSRF. Odśwież stronę i spróbuj ponownie.";
        }
        if (res.status === 404) {
          txt ||= "Endpoint wiadomości nie jest skonfigurowany (404).";
        }
        if (res.status === 429) {
          txt ||= "Zbyt wiele prób. Spróbuj za kilka minut.";
        }
        throw new Error(txt || "Nie udało się wysłać formularza.");
      }

      setToast("Dziękujemy! Zgłoszenie zostało wysłane ✅");
      // reset
      setTopic(""); setName(""); setEmail(""); setPhone("");
      setOrderNo(""); setMessage(""); setAgree(false); setFiles([]);
    } catch (err) {
      // Fallback do mailto — żeby klient mógł napisać nawet bez działającego API
      try {
        const subj = encodeURIComponent(`Kontakt: ${topic || "Zapytanie"} — ${name}${orderNo ? ` (Zamówienie: ${orderNo})` : ""}`);
        const body = encodeURIComponent(
          [
            `Imię i nazwisko: ${name}`,
            `E-mail: ${email}`,
            phone ? `Telefon: ${phone}` : null,
            orderNo ? `Numer zamówienia: ${orderNo}` : null,
            "",
            "Opis:",
            message,
          ].filter(Boolean).join("\n")
        );
        window.location.href = `mailto:${ADMIN_EMAIL_FALLBACK}?subject=${subj}&body=${body}`;
      } catch {}
      setError(err?.message || "Wystąpił błąd. Spróbuj ponownie.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto bg-white/95 dark:bg-[#0b1220] rounded-2xl border dark:border-white/10 shadow-xl p-6 sm:p-8">
      <h1 className="text-2xl font-extrabold text-mainRed dark:text-mainRed mb-4">
        Formularz kontaktowy
      </h1>

      {toast && (
        <div className="mb-4 rounded-lg border border-green-300 bg-green-50 px-4 py-2 text-green-800">
          {toast}
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-red-800">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid gap-5">
        {/* Temat */}
        <div>
          <label className="block text-sm font-medium mb-1">
            Temat wiadomości <span className="text-red-600">*</span>
          </label>
          <select
            className="w-full rounded-lg border p-2 bg-white dark:bg-[#0f172a] dark:border-white/10 dark:text-white"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            required
          >
            <option value="">Wybierz powód kontaktu</option>
            {TOPICS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">Wybierz czego dotyczy zgłoszenie.</p>
        </div>

        {/* Dane klienta */}
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              Imię i nazwisko <span className="text-red-600">*</span>
            </label>
            <input
              type="text"
              className="w-full rounded-lg border p-2 bg-white dark:bg-[#0f172a] dark:border-white/10 dark:text-white"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              required
            />
            <p className="text-xs text-gray-500 mt-1">Podaj swoje dane osobowe.</p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              Adres e-mail <span className="text-red-600">*</span>
            </label>
            <input
              type="email"
              className="w-full rounded-lg border p-2 bg-white dark:bg-[#0f172a] dark:border-white/10 dark:text-white"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
            <p className="text-xs text-gray-500 mt-1">Podaj adres e-mail, na który otrzymasz odpowiedź.</p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Numer telefonu</label>
            <input
              type="tel"
              inputMode="tel"
              className="w-full rounded-lg border p-2 bg-white dark:bg-[#0f172a] dark:border-white/10 dark:text-white"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="opcjonalnie"
              autoComplete="tel"
            />
            <p className="text-xs text-gray-500 mt-1">Podaj kontaktowy numer telefonu (opcjonalnie).</p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Numer zamówienia</label>
            <input
              type="text"
              className="w-full rounded-lg border p-2 bg-white dark:bg-[#0f172a] dark:border-white/10 dark:text-white"
              value={orderNo}
              onChange={(e) => setOrderNo(e.target.value)}
              placeholder="opcjonalnie"
            />
            <p className="text-xs text-gray-500 mt-1">Podaj numer zamówienia, którego dotyczy zgłoszenie (opcjonalnie).</p>
          </div>
        </div>

        {/* Treść */}
        <div>
          <label className="block text-sm font-medium mb-1">
            Opis zgłoszenia <span className="text-red-600">*</span>
          </label>
          <textarea
            rows={6}
            className="w-full rounded-lg border p-3 bg-white dark:bg-[#0f172a] dark:border-white/10 dark:text-white"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            required
          />
          <p className="text-xs text-gray-500 mt-1">Opisz sytuację, której dotyczy zgłoszenie.</p>
        </div>

        {/* Załączniki */}
        <div>
          <label className="block text-sm font-medium mb-1">Załącznik</label>
          <div className="rounded-lg border-2 border-dashed p-4 text-center bg-white dark:bg-[#0f172a] dark:border-white/10">
            <input type="file" accept=".pdf,.png,.jpg,.jpeg" multiple onChange={onPickFiles} />
            <p className="text-xs text-gray-500 mt-2">Dodaj do pięciu zdjęć lub plików .pdf (opcjonalnie).</p>
            {!!files.length && (
              <ul className="mt-3 text-left text-sm space-y-1">
                {files.map((f, i) => (
                  <li key={i} className="flex items-center justify-between">
                    <span className="truncate">{f.name}</span>
                    <button type="button" onClick={() => removeFile(i)} className="text-mainRed hover:underline">
                      usuń
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Zgoda RODO */}
        <div>
          <label className="inline-flex items-start gap-2">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} required />
            <span className="text-sm">
              Wyrażam zgodę na przetwarzanie moich danych osobowych podanych w formularzu kontaktowym w celu udzielenia odpowiedzi na przesłane
              zapytanie, w zgodzie i według zasad określonych w{" "}
              <a className="underline" href="/polityka-prywatnosci">Polityce Prywatności</a>. Wiem, że w każdej chwili mogę odwołać zgodę.
            </span>
          </label>
        </div>
        
        {/* honeypot */}
        <input type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" ref={honeypot} />
        <div className="pt-2">
          <button
            type="submit"
            disabled={busy}
            className="w-full sm:w-auto px-6 py-2 rounded-xl bg-gold text-mainRed font-bold hover:bg-mainRed hover:text-gold transition disabled:opacity-60"
          >
            {busy ? "Wysyłanie…" : "Wyślij"}
          </button>
        </div>
      </form>
    </div>
  );
}
