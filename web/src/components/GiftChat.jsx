// src/components/GiftChat.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useCart } from "../context/CartContext";
import MagicFab from "./MagicFab";
import { api, API_BASE } from "../api";
import { deepParse, mergeSlots, nextFollowup, yesNoMore } from "../ai/nlu";
import { rankProducts } from "../ai/ranker";

/* ============================================================================
   Utils & persistence
============================================================================ */

const SESSION_KEY = "giftchat.session.dialog.v3";

const normUrl = (u) =>
  !u ? "" : /^https?:\/\//i.test(u) ? u : `${API_BASE}${u.startsWith("/") ? u : `/${u}`}`;

function mapApi(p) {
  const slug = p.slug || p.id || "";
  const name = p.name || p.title || slug || "Produkt";
  const description = p.description || p.shortDescription || p.brand || "";
  let price = typeof p.price === "number" ? p.price : null;
  if (price == null && typeof p.priceCents === "number") price = p.priceCents / 100;
  if (price == null && Array.isArray(p.variants)) {
    const cents = p.variants.map((v) => v?.priceCents).filter((n) => typeof n === "number");
    if (cents.length) price = Math.min(...cents) / 100;
  }
  let image = "";
  if (Array.isArray(p.media) && p.media.length) image = normUrl(p.media[0]?.url);
  else if (Array.isArray(p.gallery) && p.gallery.length) image = normUrl(p.gallery[0]);
  else if (p.image) image = normUrl(p.image);

  const tags = []
    .concat(Array.isArray(p.tags) ? p.tags : [])
    .concat(typeof p.category === "string" ? [p.category] : [])
    .concat(typeof p.brand === "string" ? [p.brand] : [])
    .filter(Boolean)
    .map(String);

  return {
    slug,
    name,
    description,
    price,
    image,
    tags,
    brand: p.brand || "",
    category: p.category || "",
    rating: typeof p.rating === "number" ? p.rating : undefined,
    reviewsCount: typeof p.reviewsCount === "number" ? p.reviewsCount : undefined,
    stock: p.stock ?? undefined,
    shippingDays: p.shippingDays ?? undefined,
    createdAt: p.createdAt ?? undefined,
    salesCount: p.salesCount ?? undefined,
  };
}

// bazowe 3 warunki: dopiero wtedy pokażemy produkty
function coreReady(s) {
  const hasRecipient = !!s?.recipient && s.recipient !== "uniwersalny";
  const hasOccasion = !!s?.occasion;
  const hasBudget =
    typeof s?.maxPrice === "number" ||
    (s?.budgetTier && s.budgetTier !== "auto");
  return hasRecipient && hasOccasion && hasBudget;
}

function saveSession(state) {
  try {
    state
      ? sessionStorage.setItem(SESSION_KEY, JSON.stringify(state))
      : sessionStorage.removeItem(SESSION_KEY);
  } catch {}
}
function loadSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/* ============================================================================
   Component
============================================================================ */

export default function GiftChat({ setToast }) {
  const { addToCart } = useCart();

  // UI
  const [open, setOpen] = useState(false);
  const viewportRef = useRef(null);

  // katalog
  const [allProducts, setAllProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState("");

  // rozmowa + sloty
  const boot = loadSession();
  const [messages, setMessages] = useState(
    boot?.messages || [
      { who: "ai", txt: "Hej! Najpierw króciutko dopytam, żeby dobrze trafić. 🙂" },
      { who: "ai", txt: "Dla kogo ma być prezent? (np. dla niej, dla niego, dla taty…)" },
    ]
  );
  const [slots, setSlots] = useState(boot?.slots || {});
  const [input, setInput] = useState("");

  // wyniki (dopiero po coreReady)
  const [lastRanked, setLastRanked] = useState([]);
  const [usedFallback, setUsedFallback] = useState(false);
  const [pageSize, setPageSize] = useState(6);
  const [busy, setBusy] = useState(false);

  const QUICK = [
    "Dla dziewczyny",
    "Dla taty",
    "Na urodziny",
    "Budżet do 150 zł",
    "Bez limitu",
  ];

  /* --------------- effects --------------- */
  useEffect(() => {
    viewportRef.current?.scrollTo({
      top: viewportRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, open, lastRanked, pageSize]);

  useEffect(() => saveSession({ messages, slots }), [messages, slots]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadErr("");
      try {
        const first = await api.products(1);
        const items = Array.isArray(first?.items) ? first.items : [];
        const pages = typeof first?.pages === "number" ? first.pages : 1;

        let acc = items.slice();
        for (let p = 2; p <= pages && acc.length < 280; p++) {
          try {
            const r = await api.products(p);
            if (Array.isArray(r?.items)) acc = acc.concat(r.items);
          } catch {}
        }
        const mapped = acc.map(mapApi).filter((x) => x.slug);
        if (!cancelled) setAllProducts(mapped);
      } catch (e) {
        console.error("[GiftChat] fetch products failed:", e);
        if (!cancelled) setLoadErr("Nie udało się pobrać produktów.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  /* --------------- send --------------- */
  async function onSend(custom) {
    if (busy) return;
    const q = (custom ?? input).trim();
    if (!q) return;

    setBusy(true);
    setMessages((m) => [...m, { who: "user", txt: q }]);
    if (!custom) setInput("");

    // sterowanie: więcej/tańsze/droższe/reset
    const intent = yesNoMore(q);
    if (intent === "reset") {
      resetDialog();
      setMessages((m) => [
        ...m,
        { who: "ai", txt: "Jasne — zaczynamy od nowa. Dla kogo szukasz prezentu?" },
      ]);
      setBusy(false);
      return;
    }
    if ((intent === "more" || intent === "yes") && lastRanked.length) {
      showMore();
      setBusy(false);
      return;
    }
    if (intent === "cheaper" && lastRanked.length) {
      showCheaper();
      setBusy(false);
      return;
    }
    if (intent === "pricier" && lastRanked.length) {
      showPricier();
      setBusy(false);
      return;
    }

    if (loading) {
      setMessages((m) => [...m, { who: "ai", txt: "Już pobieram produkty… chwilka." }]);
      setBusy(false);
      return;
    }
    if (loadErr) {
      setMessages((m) => [...m, { who: "ai", txt: "Wygląda na problem z katalogiem. Spróbujesz za moment?" }]);
      setBusy(false);
      return;
    }

    // parsowanie + merge
    const parsed = deepParse(q);
    let merged = mergeSlots(slots, parsed.slots || {});

    // OBSŁUGA „BEZ LIMITU”
    const t = q.toLowerCase();
    if (/(bez\s*limitu|no\s*limit|bez\s*ograniczeń|bez\s*ograniczen)/i.test(t)) {
      delete merged.maxPrice;
      merged.budgetTier = "premium";
    }
    setSlots(merged);

    // jeśli NIE mamy jeszcze kompletu — dopytaj, bez listy produktów
    if (!coreReady(merged)) {
      const ask =
        nextFollowup(merged)?.question ||
        (!merged.recipient || merged.recipient === "uniwersalny"
          ? "Dla kogo dokładnie? (dla niej, dla niego, dla mamy, dla taty…)"
          : !merged.occasion
          ? "Z jakiej okazji? (urodziny, święta, rocznica…)"
          : "Jaki mniej więcej budżet? Możesz napisać kwotę, „coś niedrogiego” lub „bez limitu”.");
      setMessages((m) => [...m, { who: "ai", txt: ask }]);
      setBusy(false);
      return;
    }

    // mamy komplet → ranking i pokazujemy pierwszą paczkę
    const { items, usedFallback } = rankProducts(allProducts, merged, { topN: 60 });
    setLastRanked(items);
    setUsedFallback(usedFallback);
    setPageSize(6);

    setMessages((m) => [
      ...m,
      { who: "ai", txt: humanIntro(merged, usedFallback) },
      { who: "ai", txt: "Daj znać, jeśli chcesz więcej albo zawęzić do tańszych/premium." },
    ]);

    setBusy(false);
  }

  /* --------------- actions --------------- */
  function resetDialog() {
    setSlots({});
    setLastRanked([]);
    setUsedFallback(false);
    setPageSize(6);
    saveSession(null);
    setMessages([
      { who: "ai", txt: "Hej! Najpierw króciutko dopytam, żeby dobrze trafić. 🙂" },
      { who: "ai", txt: "Dla kogo ma być prezent? (np. dla niej, dla niego, dla taty…)" },
    ]);
  }

  function showMore() {
    if (!lastRanked.length) return;
    setPageSize((s) => Math.min(24, s + 6));
    setMessages((m) => [...m, { who: "ai", txt: "Dorzucam kolejne propozycje poniżej…" }]);
  }

  function showCheaper() {
    if (!lastRanked.length) return;
    const nums = lastRanked.map((p) => p.price).filter((n) => typeof n === "number").sort((a, b) => a - b);
    const mid = nums[Math.floor(nums.length / 2)] ?? 0;
    const cheaper = lastRanked.filter((p) => typeof p.price === "number" && p.price <= mid);
    if (cheaper.length) {
      setLastRanked(cheaper);
      setPageSize(6);
      setMessages((m) => [...m, { who: "ai", txt: "Jasne — pokazuję tańsze opcje." }]);
    } else {
      setMessages((m) => [...m, { who: "ai", txt: "Niżej już niewiele. Chcesz zobaczyć coś bardziej uniwersalnego?" }]);
    }
  }

  function showPricier() {
    if (!lastRanked.length) return;
    const nums = lastRanked.map((p) => p.price).filter((n) => typeof n === "number").sort((a, b) => a - b);
    const mid = nums[Math.floor(nums.length / 2)] ?? 0;
    const pricier = lastRanked.filter((p) => typeof p.price === "number" && p.price >= mid);
    if (pricier.length) {
      setLastRanked(pricier);
      setPageSize(6);
      setMessages((m) => [...m, { who: "ai", txt: "Okej — to bardziej premium propozycje." }]);
    } else {
      setMessages((m) => [...m, { who: "ai", txt: "Wyżej też pusto. Mogę zaproponować coś spersonalizowanego?" }]);
    }
  }

  function onQuickPrompt(txt) {
    setInput(txt);
    onSend(txt);
  }

  /* --------------- view --------------- */
  const visibleProducts = useMemo(
    () => lastRanked.slice(0, pageSize),
    [lastRanked, pageSize]
  );

  const shouldShowList = coreReady(slots) && lastRanked.length > 0;
  const showSkeleton = loading && open;

  return (
    <>
      <MagicFab onClick={() => setOpen(true)} />

      {open && (
        <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} aria-hidden />
          <div
            className="relative bg-white surface border-2 border-gold rounded-t-3xl md:rounded-3xl shadow-2xl w-full md:w-auto md:max-w-[920px] h-[88vh] md:h-[82vh] overflow-hidden"
            role="dialog"
            aria-modal="true"
            aria-label="Asystent prezentowy"
          >
            {/* header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gold/40 bg-white surface sticky top-0 z-10">
              <span className="text-2xl" aria-hidden>🎁🤖</span>
              <h3 className="font-extrabold text-mainRed">Asystent prezentowy</h3>
              <button
                onClick={() => setOpen(false)}
                className="ml-auto rounded-xl px-3 py-1.5 font-bold text-mainRed hover:bg-mainRed/10"
                aria-label="Zamknij"
                title="Zamknij"
              >
                ×
              </button>
            </div>

            {/* viewport */}
            <div ref={viewportRef} className="px-4 pt-3 pb-28 overflow-y-auto h-full" role="log" aria-live="polite">
              <QuickPrompts items={QUICK} onPick={onQuickPrompt} />

              {messages.map((m, i) => (
                <ChatBubble key={i} who={m.who} text={m.txt} />
              ))}

              {showSkeleton && <SkeletonList />}

              {shouldShowList && (
                <>
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {visibleProducts.map((p, idx) => (
                      <ProductRow
                        key={`${p.slug}-${idx}`}
                        product={p}
                        onAdd={(prod) => {
                          addToCart(prod);
                          setToast && setToast("Dodano do koszyka!");
                          try { window.dispatchEvent(new Event("cart:add")); } catch {}
                        }}
                      />
                    ))}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-8 justify-center">
                    {visibleProducts.length < lastRanked.length && (
                      <GhostBtn onClick={showMore}>➕ Pokaż więcej</GhostBtn>
                    )}
                    <GhostBtn onClick={showCheaper}>⬇️ Tańsze</GhostBtn>
                    <GhostBtn onClick={showPricier}>⬆️ Droższe</GhostBtn>
                    <GhostBtn danger onClick={resetDialog}>♻️ Reset</GhostBtn>
                  </div>
                </>
              )}
            </div>

            {/* composer */}
            <Composer
              value={input}
              onChange={setInput}
              onSend={() => onSend()}
              busy={busy}
              onReset={resetDialog}   // ⬅️ przekazujemy reset do Composer
            />
          </div>
        </div>
      )}
    </>
  );
}

/* ============================================================================
   UI bits
============================================================================ */

function ChatBubble({ who, text }) {
  const isAI = who === "ai";
  return (
    <div className={`my-1 flex ${isAI ? "justify-start" : "justify-end"}`}>
      <span
        className={`rounded-2xl px-4 py-2 text-sm md:text-[0.95rem] ${
          isAI ? "bg-bgUltraLight text-mainRed" : "bg-gold text-mainRed font-bold"
        } max-w-[80%] shadow whitespace-pre-line`}
      >
        {text}
      </span>
    </div>
  );
}

function ProductRow({ product: p, onAdd }) {
  return (
    <div className="surface border border-gold/70 rounded-xl p-3 flex items-center gap-3">
      <img
        src={p.image || "https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=300&q=60"}
        alt={p.name}
        className="w-20 h-20 md:w-24 md:h-24 rounded-lg object-cover shadow"
        loading="lazy"
      />
      <div className="flex-1 min-w-0">
        <Link to={`/product/${p.slug}`} className="font-bold text-mainRed hover:underline line-clamp-2">
          {p.name}
        </Link>
        {p._reason && <div className="text-[11px] text-gray-500 mt-0.5 line-clamp-1">• {p._reason}</div>}
        {p.description && <div className="text-gray-600 text-xs mb-1 line-clamp-2">{p.description}</div>}
        <div className="text-gold font-extrabold">
          {typeof p.price === "number" ? `${p.price.toFixed(2)} zł` : "—"}
        </div>
      </div>
      <button
        className="bg-gold text-mainRed rounded-xl px-3 py-2 font-bold hover:bg-mainRed hover:text-gold transition shrink-0"
        onClick={() => onAdd(p)}
        aria-label="Dodaj do koszyka"
        title="Dodaj do koszyka"
      >
        🛒
      </button>
    </div>
  );
}

function QuickPrompts({ items, onPick }) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <div className="mb-2">
      <div className="text-xs text-gray-500 mb-1">Szybkie podpowiedzi:</div>
      <div className="flex flex-wrap gap-2">
        {items.map((txt, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onPick(txt)}
            className="px-3 py-1.5 rounded-full bg-bgUltraLight border border-gold/60 text-mainRed text-xs hover:bg-gold hover:text-mainRed transition"
            aria-label={`Użyj podpowiedzi: ${txt}`}
            title={txt}
          >
            {txt}
          </button>
        ))}
      </div>
    </div>
  );
}

function Composer({ value, onChange, onSend, busy, onReset }) {
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  return (
    <div className="absolute left-0 right-0 bottom-0 p-3 bg-white surface border-t border-gold/40">
      <div className="searchbar" role="group" aria-label="Wiadomość do asystenta">
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSend()}
          placeholder="Napisz: „dla dziewczyny na urodziny, bez limitu / do 150 zł”"
          aria-label="Pole wiadomości"
        />
        <button
          className="search-btn"
          onClick={onSend}
          title="Wyślij"
          aria-label="Wyślij wiadomość"
          disabled={busy}
        >
          ➤
        </button>
      </div>

      {/* Rząd małych przycisków pod polem — z resetem */}
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className="btn-ghost-mini" onClick={onSend} disabled={busy}>
          ➕ Pokaż więcej
        </button>
        <button type="button" className="btn-ghost-mini" onClick={() => onSend("tańsze")}>
          ⬇️ Tańsze
        </button>
        <button type="button" className="btn-ghost-mini" onClick={() => onSend("droższe")}>
          ⬆️ Droższe
        </button>
        {/* 🔥 Reset w Composerze */}
        <button
          type="button"
          className="btn-ghost-mini danger"
          onClick={onReset}
          title="Resetuj rozmowę"
        >
          ♻️ Reset
        </button>
      </div>

      <style>{`
        .btn-ghost-mini {
          background: transparent;
          border: 1px solid var(--gold);
          color: var(--mainRed);
          padding: .4rem .6rem;
          border-radius: 10px;
          font-weight: 700;
          font-size: 12px;
          transition: filter .2s ease, transform .15s ease;
        }
        .btn-ghost-mini:hover { filter: brightness(1.06); transform: translateY(-1px); }
        .btn-ghost-mini.danger { border-color: #ef4444; color: #b91c1c; }
      `}</style>
    </div>
  );
}

function GhostBtn({ children, danger, ...props }) {
  return (
    <button
      {...props}
      className={`px-3 py-1.5 rounded-lg border font-bold text-sm transition
        ${danger ? "border-red-500 text-red-700 hover:bg-red-50" : "border-gold text-mainRed hover:bg-gold/10"}`}
    >
      {children}
    </button>
  );
}

function SkeletonList() {
  return (
    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="surface border border-gold/40 rounded-xl p-3 flex items-center gap-3 animate-pulse">
          <div className="w-20 h-20 md:w-24 md:h-24 rounded-lg bg-gray-200" />
          <div className="flex-1">
            <div className="h-3 bg-gray-200 rounded w-3/4 mb-2" />
            <div className="h-3 bg-gray-200 rounded w-2/3 mb-2" />
            <div className="h-4 bg-gray-200 rounded w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ============================================================================
   Human-like intro only (bez parafraz „Rozumiem…”)
============================================================================ */

function humanIntro(s, fb) {
  const note = [];
  if (s.recipient && s.recipient !== "uniwersalny") note.push(`dla **${s.recipient}**`);
  if (s.occasion) note.push(`na **${s.occasion}**`);
  if (typeof s.maxPrice === "number") note.push(`do **${s.maxPrice} zł**`);
  else if (s.budgetTier && s.budgetTier!=="auto") {
    note.push(s.budgetTier === "premium" ? "**bez limitu / premium**" : `segment **${s.budgetTier}**`);
  }
  if (Array.isArray(s.hobbies) && s.hobbies.length) note.push(`z nutą: **${s.hobbies.slice(0,2).join(", ")}**`);
  const tail = note.length ? ` (${note.join(" · ")})` : "";
  return fb
    ? `Brakuje idealnych „tagów”, ale mam sensowne, uniwersalne propozycje${tail}. Poniżej pierwsza paczka:`
    : `Super — mam komplet informacji${tail}. Oto pierwsze propozycje:`;
}
