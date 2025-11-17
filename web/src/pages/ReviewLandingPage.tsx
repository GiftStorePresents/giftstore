import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { API_BASE } from "../api";

type VerifyResp = {
  ok: boolean;
  name?: string | null;
  email?: string | null;
  items?: Array<{ name?: string; qty?: number }>;
  message?: string;
};

export default function ReviewLandingPage() {
  const { orderId, token } = useParams<{ orderId: string; token: string }>();
  const nav = useNavigate();

  const [loading, setLoading] = useState(true);
  const [verified, setVerified] = useState<VerifyResp | null>(null);
  const [rating, setRating] = useState<number>(0);
  const [hover, setHover] = useState<number>(0);
  const [comment, setComment] = useState("");

  useEffect(() => {
    let on = true;
    (async () => {
      try {
        const res = await fetch(
          `${API_BASE}/api/reviews/${encodeURIComponent(orderId || "")}/verify?token=${encodeURIComponent(token || "")}`,
          { credentials: "include" }
        );
        const data = (await res.json()) as VerifyResp;
        if (on) setVerified(data);
      } catch {
        if (on) setVerified({ ok: false, message: "Błąd weryfikacji." });
      } finally {
        if (on) setLoading(false);
      }
    })();
    return () => { on = false; };
  }, [orderId, token]);

  async function submit() {
    if (!rating) { alert("Wybierz ocenę (1–5)."); return; }
    try {
      const res = await fetch(`${API_BASE}/api/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          orderId,
          token,
          rating,
          comment: comment?.trim() || null
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      nav("/review/thanks");
    } catch (e: any) {
      alert(e?.message || "Nie udało się zapisać opinii.");
    }
  }

  if (loading) return <div className="container mx-auto px-4 py-16 text-center text-muted">Weryfikacja…</div>;
  if (!verified?.ok) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold mb-2">Link nieaktywny</h1>
        <p className="text-muted">{verified?.message || "Nieprawidłowy lub wygasły link."}</p>
      </div>
    );
  }

  const hello = verified.name || verified.email || "Kliencie";

  return (
    <div className="container mx-auto px-4 py-14 max-w-2xl">
      <div className="glass p-8 rounded-2xl fade-in-glass">
        <div className="text-center mb-6">
          <div className="text-sm text-muted mb-1">Gift Store</div>
          <h1 className="text-3xl font-extrabold">Cześć, {hello}!</h1>
          <p className="text-muted mt-2">Jak oceniasz swoje ostatnie zamówienie w Gift Store?</p>
        </div>

        {/* Gwiazdki */}
        <div className="flex items-center justify-center gap-2 my-6">
          {[1,2,3,4,5].map(n => (
            <button
              key={n}
              onMouseEnter={() => setHover(n)}
              onMouseLeave={() => setHover(0)}
              onClick={() => setRating(n)}
              aria-label={`Ocena ${n}`}
              className={`w-12 h-12 rounded-full grid place-items-center transition
              ${ (hover || rating) >= n ? "bg-gold text-black" : "bg-white/10 text-gold border border-gold/40" }`}
              title={`${n}/5`}
            >
              ★
            </button>
          ))}
        </div>

        <textarea
          placeholder="Kilka słów od Ciebie (opcjonalnie)…"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          className="w-full min-h-[120px] p-3 rounded-xl border border-gray-300/50 dark:border-white/10 bg-white/70 dark:bg-[#0f1424] outline-none"
        />

        <div className="mt-6 flex items-center justify-center">
          <button
            onClick={submit}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl font-semibold
              bg-gold text-[#15192b] border border-[#ffd16666] shadow-gold hover:brightness-105"
          >
            Wyślij opinię
          </button>
        </div>

        <p className="text-xs text-center text-muted mt-4">
          Dziękujemy! Twoja opinia pomaga nam ulepszać prezenty i obsługę. ❤️
        </p>
      </div>
    </div>
  );
}
