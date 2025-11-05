// src/components/GiftChat.jsx
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useCart } from "../context/CartContext";
import MagicFab from "./MagicFab";
import { api, API_BASE } from "../api";
import { deepParse, mergeSlots, nextFollowup, yesNoMore } from "../ai/nlu";
import { rankProducts } from "../ai/ranker";

/* ============================================================================ */
const SESSION_KEY = "giftchat.session.dialog.v3";

const normUrl = (u) =>
  !u ? "" : /^https?:\/\//i.test(u) ? u : `${API_BASE}${u.startsWith("/") ? u : `/${u}`}`;

/* 🔧 NORMALIZACJA brand/category → ZAWSZE STRING */
function pickCategory(p) {
  if (typeof p?.category === "string") return p.category;
  if (p?.category && typeof p.category === "object") {
    return p.category.slug || p.category.name || "";
  }
  if (Array.isArray(p?.categories)) {
    return p.categories
      .map((c) => (typeof c === "string" ? c : (c?.slug || c?.name || "")))
      .filter(Boolean)
      .join(", ");
  }
  return "";
}
function pickBrand(p) {
  if (typeof p?.brand === "string") return p.brand;
  if (p?.brand && typeof p.brand === "object") {
    return p.brand.name || p.brand.slug || "";
  }
  return "";
}

function mapApi(p) {
  const slug = p.slug || p.id || "";
  const name = p.name || p.title || slug || "Produkt";
  const description = p.description || p.shortDescription || pickBrand(p) || "";

  // cena
  let price = typeof p.price === "number" ? p.price : null;
  if (price == null && typeof p.priceCents === "number") price = p.priceCents / 100;
  if (price == null && Array.isArray(p.variants)) {
    const cents = p.variants.map((v) => v?.priceCents).filter((n) => typeof n === "number");
    if (cents.length) price = Math.min(...cents) / 100;
  }

  // obraz
  let image = "";
  if (Array.isArray(p.media) && p.media.length) image = normUrl(p.media[0]?.url);
  else if (Array.isArray(p.gallery) && p.gallery.length) image = normUrl(p.gallery[0]);
  else if (p.image) image = normUrl(p.image);

  // 🔧 brand/category jako string
  const brandStr = pickBrand(p);
  const catStr = pickCategory(p);

  // tagi
  const tags = []
    .concat(Array.isArray(p.tags) ? p.tags : [])
    .concat(brandStr ? [brandStr] : [])
    .concat(catStr ? [catStr] : [])
    .filter(Boolean)
    .map((t) => String(t));

  return {
    slug,
    name,
    description,
    price,
    image,
    tags,
    brand: brandStr,
    category: catStr,
    rating: typeof p.rating === "number" ? p.rating : undefined,
    reviewsCount: typeof p.reviewsCount === "number" ? p.reviewsCount : undefined,
    stock: p.stock ?? undefined,
    shippingDays: p.shippingDays ?? undefined,
    createdAt: p.createdAt ?? undefined,
    salesCount: p.salesCount ?? undefined,
  };
}

// bazowe 3 warunki (dla dialogu; lista nie zależy od nich)
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

/* ============================================================================ */
/* === Wewnętrzny komponent z pełną logiką. Montowany tylko na ≥1024 px. ====== */
function GiftChatCore({ setToast }) {
  const { addToCart } = useCart();

  const [open, setOpen] = useState(false);
  const viewportRef = useRef(null);

  const [allProducts, setAllProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState("");

  const boot = loadSession();
  const [messages, setMessages] = useState(
    boot?.messages || [
      { who: "ai", txt: "Hej! Najpierw króciutko dopytam, żeby dobrze trafić. 🙂" },
      { who: "ai", txt: "Dla kogo ma być prezent? (np. dla niej, dla niego, dla taty…)" },
    ]
  );
  const [slots, setSlots] = useState(boot?.slots || {});
  const [input, setInput] = useState("");

  const [lastRanked, setLastRanked] = useState([]);     // pełna lista kandydatów
  const [usedFallback, setUsedFallback] = useState(false);
  const [shown, setShown] = useState([]);               // aktualnie pokazane (bez duplikatów)
  const [pageSize] = useState(6);
  const [busy, setBusy] = useState(false);

  // 🔁 DRABINKA CENOWA — kursor procentylowy
  const [priceCursor, setPriceCursor] = useState(null);

  // szybkie podpowiedzi
  const QUICK = ["Dla dziewczyny", "Dla taty", "Na urodziny", "Bez limitu"];

  useEffect(() => {
    viewportRef.current?.scrollTo({
      top: viewportRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, open, shown]);

  useEffect(() => saveSession({ messages, slots }), [messages, slots]);

  // reset drabinki po zmianie slotów
  useEffect(() => { setPriceCursor(null); }, [slots]);

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
    return () => { cancelled = true; };
  }, [open]);

  /* -------------------- pomocnicze -------------------- */

  function getBaseRanked(topN = 400) {
    const { items } = rankProducts(allProducts, slots || {}, { topN });
    return Array.isArray(items) ? items : [];
  }

  function nextBatchFrom(list, alreadyShown, n) {
    const seen = new Set(alreadyShown.map((x) => x.slug));
    const fresh = list.filter((x) => !seen.has(x.slug));
    return fresh.slice(0, n);
  }

  function priceListFrom(base) {
    const arr = base.map((p) => p.price).filter((n) => typeof n === "number").sort((a, b) => a - b);
    const uniq = [];
    for (const x of arr) if (uniq.length === 0 || uniq[uniq.length - 1] !== x) uniq.push(x);
    return uniq;
  }

  function smartAlternatives(n = pageSize) {
    const seen = new Set(shown.map((x) => x.slug));
    const pool = allProducts.filter((p) => !seen.has(p.slug));
    if (!pool.length) return [];

    const catFreq = {};
    const brandFreq = {};
    shown.forEach((p) => {
      if (p.category) catFreq[p.category] = (catFreq[p.category] || 0) + 1;
      if (p.brand) brandFreq[p.brand] = (brandFreq[p.brand] || 0) + 1;
    });

    const prices = shown.map((p) => p.price).filter((x) => typeof x === "number").sort((a, b) => a - b);
    const mid = prices.length ? prices[Math.floor(prices.length / 2)] : null;

    const scored = pool.map((p) => {
      let s = 0;
      if (typeof p.rating === "number") s += p.rating * 2;
      if (typeof p.reviewsCount === "number") s += Math.min(5, Math.log10(1 + p.reviewsCount));
      if (typeof p.salesCount === "number") s += Math.min(5, Math.log10(1 + p.salesCount));
      if (p.category && catFreq[p.category]) s -= catFreq[p.category] * 0.6;
      if (p.brand && brandFreq[p.brand]) s -= brandFreq[p.brand] * 0.4;

      if (mid != null && typeof p.price === "number") {
        const diff = Math.abs(p.price - mid);
        s += Math.min(3, diff / Math.max(50, mid * 0.15));
      }
      return { p, s };
    });

    scored.sort((a, b) => b.s - a.s);
    return scored.slice(0, n).map((x) => x.p);
  }

  function initRankAndShow(baseItems, msg) {
    setLastRanked(baseItems);
    const first = nextBatchFrom(baseItems, [], pageSize);
    setShown(first);
    setPriceCursor(null);
    if (msg) setMessages((m) => [...m, { who: "ai", txt: msg }]);
  }

  function ensureFirstList(reasonMsg) {
    const { items, usedFallback } = rankProducts(allProducts, slots || {}, { topN: 90 });
    if (items.length) {
      initRankAndShow(items, reasonMsg);
      setUsedFallback(usedFallback);
      return true;
    }
    return false;
  }

  /* -------------------- obsługa wiadomości -------------------- */

  async function onSend(custom) {
    if (busy) return;

    const raw = custom ?? input;
    const q = (raw || "").trim();

    if (!q) {
      if (shown.length) {
        setBusy(true);
        showMore();
        setBusy(false);
      }
      return;
    }

    setBusy(true);
    setMessages((m) => [...m, { who: "user", txt: q }]);
    if (!custom) setInput("");

    const intent = yesNoMore(q);

    if (intent === "reset") {
      resetDialog();
      setMessages((m) => [...m, { who: "ai", txt: "Jasne — zaczynamy od nowa. Dla kogo szukasz prezentu?" }]);
      setBusy(false);
      return;
    }

    if ((intent === "more" || intent === "yes") && !shown.length) {
      ensureFirstList("Dorzucam pierwsze propozycje. Możesz doprecyzować budżet/okazję w trakcie. 🙂");
      setBusy(false);
      return;
    }
    if (intent === "cheaper" && !shown.length) {
      ensureFirstList("Najpierw pokażę kilka propozycji, potem zawężę do tańszych.");
      setBusy(false);
      return;
    }
    if (intent === "pricier" && !shown.length) {
      ensureFirstList("Najpierw pokażę kilka propozycji, potem przejdziemy do premium.");
      setBusy(false);
      return;
    }

    if ((intent === "more" || intent === "yes") && shown.length) {
      showMore(); setBusy(false); return;
    }
    if (intent === "cheaper" && shown.length) {
      showCheaper(); setBusy(false); return;
    }
    if (intent === "pricier" && shown.length) {
      showPricier(); setBusy(false); return;
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

    const parsed = deepParse(q);
    let merged = mergeSlots(slots, parsed.slots || {});
    const t = q.toLowerCase();
    if (/(bez\s*limitu|no\s*limit|bez\s*ograniczeń|bez\s*ograniczen)/i.test(t)) {
      delete merged.maxPrice;
      merged.budgetTier = "premium";
    }
    setSlots(merged);

    if (!coreReady(merged)) {
      const { items, usedFallback } = rankProducts(allProducts, merged, { topN: 90 });
      if (items.length) {
        initRankAndShow(items, "Pokazuję wstępne propozycje. Doprecyzuj okazję/budżet, a zawęzimy dalej. 👌");
        setUsedFallback(usedFallback);
        setBusy(false);
        return;
      }
      const ask =
        nextFollowup(merged)?.question ||
        (!merged.recipient || merged.recipient === "uniwersalny"
          ? "Dla kogo dokładnie? (dla niej, dla niego, dla mamy, dla taty…)"
          : !merged.occasion
          ? "Z jakiej okazji? (urodziny, święta, rocznica…)"
          : "Jaki mniej więcej budżet? Możesz napisać kwotę lub „bez limitu”.");
      setMessages((m) => [...m, { who: "ai", txt: ask }]);
      setBusy(false);
      return;
    }

    const { items, usedFallback } = rankProducts(allProducts, merged, { topN: 90 });
    initRankAndShow(items, humanIntro(merged, usedFallback));
    setUsedFallback(usedFallback);
    setMessages((m) => [...m, { who: "ai", txt: "Daj znać, jeśli chcesz więcej albo zawęzić do tańszych/premium." }]);
    setBusy(false);
  }

  /* -------------------- akcje (więcej/tańsze/droższe/reset) -------------------- */

  function resetDialog() {
    setSlots({});
    setLastRanked([]);
    setShown([]);
    setUsedFallback(false);
    setPriceCursor(null);
    saveSession(null);
    setMessages([
      { who: "ai", txt: "Hej! Najpierw króciutko dopytam, żeby dobrze trafić. 🙂" },
      { who: "ai", txt: "Dla kogo ma być prezent? (np. dla niej, dla niego, dla taty…)" },
    ]);
  }

  function showMore() {
    if (!lastRanked.length) {
      if (ensureFirstList("Dorzucam pierwsze propozycje. 🙂")) return;
    }
    const more = nextBatchFrom(lastRanked, shown, pageSize);
    if (more.length) {
      setShown((s) => [...s, ...more]);
      setMessages((m) => [...m, { who: "ai", txt: "Dorzucam kolejne propozycje poniżej…" }]);
      return;
    }
    const widened = getBaseRanked(800);
    const moreWide = nextBatchFrom(widened, shown, pageSize);
    if (moreWide.length) {
      setLastRanked(widened);
      setShown((s) => [...s, ...moreWide]);
      setMessages((m) => [...m, { who: "ai", txt: "Znalazłem jeszcze kilka ciekawych opcji — sprawdź niżej." }]);
      return;
    }
    const alts = smartAlternatives(pageSize);
    if (alts.length) {
      setShown((s) => [...s, ...alts]);
      setMessages((m) => [...m, { who: "ai", txt: "To inspiracje z innych kategorii/półki cenowej — mogą Ci się spodobać." }]);
      return;
    }
    setMessages((m) => [...m, { who: "ai", txt: "To już wszystko na teraz. Mogę zaproponować coś zupełnie innego?" }]);
  }

  function showCheaper() {
    const base = getBaseRanked(800);
    if (!base.length) { ensureFirstList(); return; }

    const prices = priceListFrom(base);
    if (!prices.length) { initRankAndShow(base, "Jasne — pokazuję tańsze opcje."); return; }

    const step = Math.max(1, Math.ceil(prices.length * 0.12));
    let idx;

    if (!priceCursor || priceCursor.dir !== "cheaper") {
      idx = Math.floor(prices.length * 0.50); // start od mediany
    } else {
      idx = Math.max(0, priceCursor.idx - step);
    }

    const ceil = prices[idx];
    const cheaper = base.filter((p) => typeof p.price === "number" && p.price <= ceil);

    setLastRanked(cheaper);
    setShown(cheaper.slice(0, pageSize));
    setPriceCursor({ dir: "cheaper", idx, len: prices.length });
    setMessages((m) => [...m, { who: "ai", txt: idx === 0 ? "To już najtańsze propozycje." : "Jasne — pokazuję tańsze opcje." }]);
  }

  function showPricier() {
    const base0 = getBaseRanked(800);
    if (!base0.length) { ensureFirstList(); return; }

    let base = base0;
    const prices = priceListFrom(base);
    if (!prices.length) { initRankAndShow(base, "Okej — to bardziej premium propozycje."); return; }

    const step = Math.max(1, Math.ceil(prices.length * 0.12));
    let idx;

    if (!priceCursor || priceCursor.dir !== "pricier") {
      idx = Math.floor(prices.length * 0.50); // start od mediany
    } else {
      idx = Math.min(prices.length - 1, priceCursor.idx + step);
    }

    const floor = prices[idx];
    let pricier = base.filter((p) => typeof p.price === "number" && p.price >= floor);

    if (pricier.length < pageSize && idx < prices.length - 1) {
      const base2 = getBaseRanked(1200);
      const prices2 = priceListFrom(base2);
      const floor2 = prices2[Math.min(prices2.length - 1, idx)];
      pricier = base2.filter((p) => typeof p.price === "number" && p.price >= floor2);
      base = base2;
    }

    if (!pricier.length) {
      setPriceCursor({ dir: "pricier", idx: prices.length - 1, len: prices.length });
      setMessages((m) => [...m, { who: "ai", txt: "To już najwyższa półka cenowa w katalogu. 💎" }]);
      return;
    }

    setLastRanked(pricier);
    setShown(pricier.slice(0, pageSize));
    setPriceCursor({ dir: "pricier", idx, len: prices.length });
    setMessages((m) => [...m, { who: "ai", txt: idx >= prices.length - 2 ? "To już bardzo wysoka półka. Świetny wybór!" : "Okej — to bardziej premium propozycje." }]);
  }

  function onQuickPrompt(txt) {
    setInput(txt);
    onSend(txt);
  }

  const shouldShowList = shown.length > 0;
  const showSkeleton = loading && open;

  return (
    <>
      <MagicFab onClick={() => setOpen(true)} />
      {open && (
        <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} aria-hidden />
          <div
            className="relative bg-white surface border-2 border-gold rounded-t-3xl md:rounded-3xl shadow-2xl w-full md:w-auto md:max-w-[920px] h-[88vh] md:h-[82vh] overflow-hidden"
            role="dialog" aria-modal="true" aria-label="Asystent prezentowy"
          >
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gold/40 bg-white surface sticky top-0 z-10">
              <span className="text-2xl" aria-hidden>🎁🤖</span>
              <h3 className="font-extrabold text-mainRed">Asystent prezentowy</h3>
              <button onClick={() => setOpen(false)} className="ml-auto rounded-xl px-3 py-1.5 font-bold text-mainRed hover:bg-mainRed/10" aria-label="Zamknij" title="Zamknij">×</button>
            </div>

            <div
              ref={viewportRef}
              className="px-4 pt-3 pb-[200px] md:pb-[210px] overflow-y-auto h-full"
              role="log"
              aria-live="polite"
            >
              <QuickPrompts items={["Dla dziewczyny", "Dla taty", "Na urodziny", "Bez limitu"]} onPick={onQuickPrompt} />
              {messages.map((m, i) => (<ChatBubble key={i} who={m.who} text={m.txt} />))}
              {showSkeleton && <SkeletonList />}

              {shouldShowList && (
                <>
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {shown.map((p, idx) => (
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
                </>
              )}
            </div>

            <Composer
              value={input}
              onChange={setInput}
              onSend={() => onSend()}
              busy={busy}
              onReset={resetDialog}
              onMore={showMore}
              onCheaper={showCheaper}
              onPricier={showPricier}
            />
          </div>
        </div>
      )}
    </>
  );
}

/* ============================================================================ */
/* === Publiczny eksport: gate montuje GiftChatCore tylko dla ≥1024 px. ======= */
export default function GiftChat(props) {
  const supportsMQ = typeof window !== "undefined" && typeof window.matchMedia === "function";
  const mql = supportsMQ ? window.matchMedia("(min-width: 1024px)") : null;

  const [isLarge, setIsLarge] = useState(() => (mql ? mql.matches : true));

  useEffect(() => {
    if (!mql) return;
    const handler = (e) => setIsLarge(e.matches);
    // nowoczesne API
    if (mql.addEventListener) {
      mql.addEventListener("change", handler);
      return () => mql.removeEventListener("change", handler);
    }
    // fallback
    mql.addListener && mql.addListener(handler);
    return () => { mql.removeListener && mql.removeListener(handler); };
  }, [mql]);

  if (!isLarge) return null;
  return <GiftChatCore {...props} />;
}

/* ============================================================================ */

function ChatBubble({ who, text }) {
  const isAI = who === "ai";
  return (
    <div className={`my-1 flex ${isAI ? "justify-start" : "justify-end"}`}>
      <span className={`rounded-2xl px-4 py-2 text-sm md:text-[0.95rem] ${isAI ? "bg-bgUltraLight text-mainRed" : "bg-gold text-mainRed font-bold"} max-w-[80%] shadow whitespace-pre-line`}>
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
function Composer({ value, onChange, onSend, busy, onReset, onMore, onCheaper, onPricier }) {
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
          placeholder="Napisz: „dla dziewczyny na urodziny, bez limitu”"
          aria-label="Pole wiadomości"
        />
        <button className="search-btn" onClick={onSend} title="Wyślij" aria-label="Wyślij wiadomość" disabled={busy}>➤</button>
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className="btn-ghost-mini" onClick={onMore} disabled={busy}>➕ Pokaż więcej</button>
        <button type="button" className="btn-ghost-mini" onClick={onCheaper}>⬇️ Tańsze</button>
        <button type="button" className="btn-ghost-mini" onClick={onPricier}>⬆️ Droższe</button>
        <button type="button" className="btn-ghost-mini danger" onClick={onReset} title="Resetuj rozmowę">♻️ Reset</button>
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
/* ============================================================================ */
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
