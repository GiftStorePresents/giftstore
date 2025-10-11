// src/components/GiftAssistant.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useCart } from "../context/CartContext";
import MagicFab from "./MagicFab";
import { api, API_BASE } from "../api";

const stepQuestions = [
  {
    q: "Dla kogo szukasz prezentu?",
    options: [
      { txt: "👩 Dla niej", val: "dla niej" },
      { txt: "👨 Dla niego", val: "dla niego" },
      { txt: "🧒 Dla dzieci", val: "dla dzieci" },
      { txt: "👩‍🦳 Dla mamy", val: "dla mamy" },
      { txt: "👨‍🦳 Dla taty", val: "dla taty" },
      { txt: "⭐️ Uniwersalny", val: "uniwersalny" },
    ],
  },
  {
    q: "Z jakiej okazji?",
    options: [
      { txt: "🎂 Na urodziny", val: "na urodziny" },
      { txt: "💍 Rocznica", val: "rocznica" },
      { txt: "🎄 Święta", val: "święta" },
      { txt: "❤️ Bez okazji", val: "bez okazji" },
    ],
  },
  {
    q: "Jaki budżet?",
    options: [
      { txt: "💸 do 100 zł", val: 100 },
      { txt: "💸 do 150 zł", val: 150 },
      { txt: "🤑 Bez limitu", val: Infinity },
    ],
  },
];

/* ===== helpers ===== */
function normalizeImageUrl(url) {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  return `${API_BASE}${url.startsWith("/") ? url : `/${url}`}`;
}
function getMinPriceFromVariants(variants) {
  if (!Array.isArray(variants) || variants.length === 0) return null;
  const cents = variants
    .map((v) => (typeof v?.priceCents === "number" ? v.priceCents : null))
    .filter((n) => typeof n === "number");
  if (!cents.length) return null;
  return Math.min(...cents) / 100;
}
/** Mapowanie produktu z API -> lekki obiekt asystenta */
function mapApiProduct(p) {
  if (!p || typeof p !== "object") return null;
  const slug = p.slug || p.id || "";
  const name = p.name || p.title || slug || "Produkt";
  const description =
    p.description || p.shortDescription || (p.brand ? `${p.brand}` : "") || "";
  const price =
    typeof p.price === "number"
      ? p.price
      : getMinPriceFromVariants(p.variants) ??
        (typeof p.priceCents === "number" ? p.priceCents / 100 : null);

  let image = "";
  if (Array.isArray(p.media) && p.media.length) {
    image = normalizeImageUrl(p.media[0]?.url || "");
  } else if (Array.isArray(p.gallery) && p.gallery.length) {
    image = normalizeImageUrl(p.gallery[0]);
  } else if (p.image) {
    image = normalizeImageUrl(p.image);
  }

  const tags = []
    .concat(Array.isArray(p.tags) ? p.tags : [])
    .concat(typeof p.category === "string" ? [p.category] : [])
    .concat(typeof p.brand === "string" ? [p.brand] : [])
    .filter(Boolean)
    .map((t) => String(t));

  return { slug, name, description, price, image, tags };
}

/** Normalizacja do porównań (bez PL znaków, małe litery) */
function norm(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

/** słowniki słów-kluczy */
const RECIPIENT_KEYS = {
  "dla niej": ["dla niej", "kobieta", "kobiet", "ona", "her", "woman", "ladies", "dziewcz", "girlfriend"],
  "dla niego": ["dla niego", "mezczyzn", "on", "him", "man", "men", "boyfriend"],
  "dla dzieci": ["dzieci", "dziecko", "kids", "kid", "child", "dla dziecka"],
  "dla mamy": ["dla mamy", "mama", "mom", "mother"],
  "dla taty": ["dla taty", "tata", "dad", "father"],
  "uniwersalny": ["uniwersalny", "uni", "dla kazdego", "dla wszystkich", "everyone"],
};
const OCCASION_KEYS = {
  "na urodziny": ["urodziny", "birthday", "bday"],
  rocznica: ["rocznica", "anniversary"],
  swieta: ["swieta", "święta", "christmas", "xmas", "mikolaj", "mikołaj"],
  "bez okazji": ["bez okazji", "just because", "anytime"],
};

export default function GiftAssistant({ setToast }) {
  const { addToCart } = useCart();

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [choice, setChoice] = useState({ recipient: "", occasion: "", budget: Infinity });

  const [allProducts, setAllProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState("");

  const firstBtnRef = useRef(null);

  // pobieramy produkty po otwarciu asystenta
  useEffect(() => {
    let cancelled = false;
    async function fetchAll() {
      setLoading(true);
      setLoadErr("");
      try {
        const first = await api.products(1);
        const items = Array.isArray(first?.items) ? first.items : [];
        const pages = typeof first?.pages === "number" ? first.pages : 1;

        let acc = items.slice();
        for (let p = 2; p <= pages && acc.length < 120; p++) {
          try {
            const res = await api.products(p);
            if (Array.isArray(res?.items)) acc = acc.concat(res.items);
          } catch {}
        }

        const mapped = acc
          .map(mapApiProduct)
          .filter((x) => x && x.slug && typeof x.price === "number" && x.price >= 0);

        if (!cancelled) setAllProducts(mapped);
      } catch (e) {
        console.error("[GiftAssistant] fetch products failed:", e);
        if (!cancelled) setLoadErr("Nie udało się pobrać produktów.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (open) fetchAll();
    return () => { cancelled = true; };
  }, [open]);

  // blokuj scroll tła + focus na pierwszym przycisku kroku
  useEffect(() => {
    if (!open) return;
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    const t = setTimeout(() => firstBtnRef.current?.focus(), 0);
    return () => {
      document.documentElement.style.overflow = prev;
      clearTimeout(t);
    };
  }, [open, step]);

  // Chat (wizual)
  const chat = [];
  if (choice.recipient) {
    chat.push({ who: "ai", txt: "Dla kogo szukasz prezentu?" });
    const txt = stepQuestions[0].options.find((o) => o.val === choice.recipient)?.txt || choice.recipient;
    chat.push({ who: "user", txt });
  }
  if (choice.occasion) {
    chat.push({ who: "ai", txt: "Z jakiej okazji?" });
    const txt = stepQuestions[1].options.find((o) => o.val === choice.occasion)?.txt || choice.occasion;
    chat.push({ who: "user", txt });
  }
  if (choice.budget !== Infinity) {
    chat.push({ who: "ai", txt: "Jaki budżet?" });
    const txt = stepQuestions[2].options.find((o) => o.val === choice.budget)?.txt || `${choice.budget} zł`;
    chat.push({ who: "user", txt });
  }

  /* ====== SCORING + SPRYTNE DOPASOWANIE ====== */
  const { rankedResults, usedFallback } = useMemo(() => {
    const rec = norm(choice.recipient);
    const occRaw = norm(choice.occasion);
    const occ = occRaw === "na urodziny" ? "na urodziny" : occRaw; // ujednolicenie klucza
    const budget = choice.budget;

    // funkcje dopasowań
    const containsAny = (hay, arr) => arr.some((k) => hay.includes(norm(k)));

    const scored = (allProducts || []).map((p) => {
      const hay = norm(
        [
          p.name,
          p.description,
          ...(Array.isArray(p.tags) ? p.tags : []),
        ].join(" ")
      );

      // recipient score
      let rScore = 0;
      if (rec && rec !== "uniwersalny") {
        const keys = RECIPIENT_KEYS[rec] || [];
        if (keys.length && containsAny(hay, keys)) rScore = 3;
        // dodatkowa heurystyka po słowie „dla niej/niego/dzieci/mamy/taty”
        else if (
          ["dla niej", "dla niego", "dla dzieci", "dla mamy", "dla taty"].some((k) => hay.includes(norm(k)))
        ) rScore = 2;
      } else {
        rScore = 1; // lekkie punkty za brak wymogu (uniwersalne)
      }

      // occasion score
      let oScore = 0;
      if (occ) {
        const key = occ === "swieta" ? "swieta" : occ; // map
        const keys = OCCASION_KEYS[key] || OCCASION_KEYS[occ] || [];
        if (keys.length && containsAny(hay, keys)) oScore = 2;
        else if (hay.includes("prezent")) oScore = 1;
      } else {
        oScore = 1;
      }

      const priceOk = typeof p.price === "number" && p.price <= budget;
      const bScore = priceOk ? 2 : 0;

      const score = rScore + oScore + bScore;

      return { p, score, priceOk };
    });

    // wstępne wyniki: wymagamy dopasowania budżetu (chyba że Infinity)
    let filtered = scored
      .filter((x) => choice.budget === Infinity || x.priceOk)
      .filter((x) => x.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        // w ramach tej samej punktacji preferuj tańsze
        return (a.p.price ?? 0) - (b.p.price ?? 0);
      })
      .map((x) => x.p);

    let fallback = false;

    // Jeśli nadal pusto – rozluźnij: tylko budżet + ogólne „prezent”
    if (filtered.length === 0) {
      const byBudget = scored
        .filter((x) => choice.budget === Infinity || x.priceOk)
        .sort((a, b) => (a.p.price ?? 0) - (b.p.price ?? 0))
        .map((x) => x.p);
      filtered = byBudget.slice(0, 24);
      fallback = true;
    }

    // Jeśli nadal pusto (brak danych cenowych) – cokolwiek z listy
    if (filtered.length === 0) {
      filtered = (allProducts || []).slice(0, 24);
      fallback = true;
    }

    return { rankedResults: filtered, usedFallback: fallback };
  }, [allProducts, choice.recipient, choice.occasion, choice.budget]);

  function reset() {
    setStep(0);
    setChoice({ recipient: "", occasion: "", budget: Infinity });
  }

  return (
    <>
      <MagicFab
        onClick={() => {
          setOpen(true);
          reset();
        }}
      />

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50">
          <div className="absolute inset-0" onClick={() => setOpen(false)} />

          <div className="bg-white w-[95vw] max-w-xs sm:max-w-md md:max-w-[720px] rounded-t-3xl sm:rounded-3xl p-4 pb-1 relative shadow-2xl border-2 border-gold flex flex-col max-h-[82vh] sm:max-h-[86vh] overflow-hidden">
            <button
              onClick={() => setOpen(false)}
              className="absolute top-2 right-4 text-mainRed font-extrabold text-2xl"
              aria-label="Zamknij"
            >
              ×
            </button>

            <div className="flex items-center gap-2 mb-3">
              <span className="text-2xl">🤖✨</span>
              <span className="font-bold text-mainRed">Doradca Prezentowy</span>
            </div>

            <div className="flex-1 min-h-[100px] max-h-40 sm:max-h-48 overflow-y-auto mb-2">
              {chat.map((msg, idx) => (
                <div key={idx} className={`my-1 flex ${msg.who === "user" ? "justify-end" : "justify-start"}`}>
                  <span
                    className={`rounded-2xl px-4 py-2 ${
                      msg.who === "ai" ? "bg-bgUltraLight text-mainRed" : "bg-gold text-mainRed font-bold"
                    } max-w-[75%] shadow`}
                  >
                    {msg.txt}
                  </span>
                </div>
              ))}

              {step < stepQuestions.length && (
                <div className="flex justify-start">
                  <span className="rounded-2xl px-4 py-2 bg-bgUltraLight text-mainRed shadow">
                    {stepQuestions[step].q}
                  </span>
                </div>
              )}
            </div>

            {step < stepQuestions.length && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {stepQuestions[step].options.map((opt, idx) => (
                  <button
                    key={opt.val}
                    ref={idx === 0 ? firstBtnRef : null}
                    className="w-full bg-white border-2 border-gold hover:bg-gold hover:text-mainRed transition font-bold px-3 py-2 rounded-xl text-left"
                    onClick={() => {
                      if (step === 0) setChoice((c) => ({ ...c, recipient: opt.val }));
                      if (step === 1) setChoice((c) => ({ ...c, occasion: opt.val }));
                      if (step === 2) setChoice((c) => ({ ...c, budget: opt.val }));
                      setStep(step + 1);
                    }}
                  >
                    {opt.txt}
                  </button>
                ))}
                {step > 0 && (
                  <button
                    className="w-full sm:col-span-2 bg-transparent border-2 border-gold text-mainRed hover:bg-gold/10 transition font-bold px-3 py-2 rounded-xl"
                    onClick={() => setStep(step - 1)}
                  >
                    ← Wróć
                  </button>
                )}
              </div>
            )}

            {step === stepQuestions.length && (
              <div className="mt-2 mb-1 overflow-y-auto">
                <div className="font-bold text-mainRed mb-2 text-center">
                  🎁 Propozycje prezentów:
                </div>

                {loading && <div className="text-center text-gray-500 mb-3">Ładowanie…</div>}
                {loadErr && <div className="text-center text-red-600 mb-3">{loadErr}</div>}

                {!loading && !loadErr && rankedResults.length > 0 ? (
                  <>
                    {usedFallback && (
                      <div className="text-xs text-gray-500 text-center mb-2">
                        Pokażono najlepsze dopasowania wg budżetu i popularności (brak pełnych tagów w produktach).
                      </div>
                    )}
                    {rankedResults.slice(0, 20).map((p, i) => (
                      <div key={`${p.slug}-${i}`} className="bg-bgUltraLight rounded-xl p-3 mb-2 flex items-center gap-3">
                        <img
                          src={
                            p.image ||
                            "https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=200&q=60"
                          }
                          alt={p.name}
                          className="w-16 h-16 rounded-xl object-cover shadow"
                          loading="lazy"
                        />
                        <div className="flex-1 min-w-0">
                          <Link
                            to={`/product/${p.slug}`}
                            className="font-bold text-mainRed hover:underline line-clamp-2"
                            onClick={() => setOpen(false)}
                          >
                            {p.name}
                          </Link>
                          {p.description && (
                            <div className="text-gray-600 text-xs mb-1 line-clamp-2">{p.description}</div>
                          )}
                          <div className="text-gold font-bold">
                            {typeof p.price === "number" ? `${p.price.toFixed(2)} zł` : "—"}
                          </div>
                        </div>
                        <button
                          className="bg-gold text-mainRed rounded-xl px-3 py-1.5 font-bold hover:bg-mainRed hover:text-gold transition"
                          onClick={() => {
                            addToCart(p);
                            setToast && setToast("Dodano do koszyka!");
                          }}
                          aria-label="Dodaj do koszyka"
                        >
                          🛒
                        </button>
                      </div>
                    ))}
                    <div className="flex justify-center">
                      <button
                        onClick={reset}
                        className="mt-3 bg-gold text-mainRed px-6 py-2 rounded-xl font-bold hover:bg-mainRed hover:text-gold border-2 border-gold hover:border-mainRed transition"
                      >
                        Wyszukaj ponownie
                      </button>
                    </div>
                  </>
                ) : (
                  !loading &&
                  !loadErr && (
                    <div className="text-gray-400 text-center mb-2">
                      Brak produktów do wyświetlenia.
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
