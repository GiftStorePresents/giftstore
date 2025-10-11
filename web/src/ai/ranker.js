// src/ai/ranker.js
// Super-ranker dla Gift Store:
// - łączony scoring: dopasowanie tekstowe (BM25-lite), sloty (recipient/occasion/hobbies/...),
//   cena (widełki/tier), jakość/popularność (rating/reviews), dostępność (stock/shipping),
//   styl (tone), materiały/kolory/flagi (eco/personalized/local), kategorie/brand.
// - dywersyfikacja wyników (category/brand-aware), kary za duplikaty i „bliźniacze” tytuły,
// - bogate "reasons" dla kart, w tym trafione słowa/oznaczenia budżetu,
// - fallbacki: budżetowy / popularny / uniwersalny.
//
// API: rankProducts(products, userSlotsOrText, options?)
// products: [{ slug,name,description,price,image,tags, brand, category, stock, rating, reviewsCount, shippingDays, ... }]
// userSlotsOrText: string | slots (z nlu.quickParse lub deepParse.slots)
// options?: { topN, diversity, weights, now }
import { quickParse, normalize as N, priceBand as tierOf, LEXICON } from "./nlu";

/* ================================
   0) KONFIG / WAGI / STAŁE
   ================================ */

const DEFAULT_WEIGHTS = {
  text: 1.0,             // dopasowanie treści (BM25-lite)
  recipient: 2.4,
  occasion: 1.8,
  hobby: 1.6,
  tone: 0.6,
  colors: 0.25,
  materials: 0.35,

  priceInRange: 2.2,     // spełnienie max/min
  priceTierMatch: 0.9,   // zgodność z tierem, gdy brak konkretu
  cheaperTieBias: 0.15,  // preferencja ceny przy tie

  rating: 0.8,           // jakość/popularność
  reviews: 0.6,
  sales: 0.4,            // jeśli masz p.salesCount
  freshness: 0.3,        // preferuj nowości, jeżeli p.createdAt jest dostępne

  availability: 1.1,     // stock + wysyłka
  shippingFast: 0.5,

  categoryBoost: 0.4,    // jeśli user wspomniał kategorię
  brandBoost: 0.25,

  personalized: 0.3,     // flagi z NLU
  eco: 0.25,
  local: 0.2,
};

const DEFAULT_OPTIONS = {
  topN: 24,
  diversity: {
    minDistinctCategoriesInTop: 3,
    avoidSameTitleStem: true,
    brandSpread: 2, // max powtórzeń tej samej marki w TOP-K "oknie"
  },
  weights: DEFAULT_WEIGHTS,
  now: () => Date.now(),
  explainTokens: true, // pokazuj trafione słowa w reasons
};

const STOPWORDS = new Set([
  "prezent", "na", "dla", "i", "oraz", "do", "z", "od", "w", "o", "na", "the", "a", "an", "of", "for",
]);

/* ================================
   1) UTIL: tekst / tokenizacja
   ================================ */

function tokens(s) {
  return N(s || "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => !STOPWORDS.has(t));
}

function stemWord(w) {
  // bardzo prosty stem PL/EN – ucinanie końcówek, tylko prewencyjnie
  return w.replace(/(ami|ami|ach|ami|ow|om|em|ie|y|a|e|u|i|o|s)$/i, "");
}

function stemmedTokens(s) {
  return tokens(s).map(stemWord);
}

function bm25LiteScore(query, doc) {
  // ultra-lekka wersja: dopasowanie po przecieciu stemów (niezależne od długości)
  const q = new Set(stemmedTokens(query));
  if (!q.size) return { score: 0, hits: [] };

  const d = stemmedTokens(doc);
  const bag = new Set(d);
  const hits = [];
  let matches = 0;
  for (const w of q) {
    if (bag.has(w)) {
      matches++;
      hits.push(w);
    }
  }
  const score = matches / Math.sqrt(q.size + d.length / 50); // łagodna normalizacja
  return { score, hits };
}

/* ================================
   2) PRICE / DOSTĘPNOŚĆ / JAKOŚĆ
   ================================ */

function priceOK(price, minPrice, maxPrice) {
  if (price == null || isNaN(price)) return false;
  if (minPrice != null && price < minPrice) return false;
  if (maxPrice != null && price > maxPrice) return false;
  return true;
}

function priceTierMatch(price, tier) {
  if (!tier || tier === "auto") return false;
  return tierOf(price) === tier;
}

function availabilityScore(p) {
  // p.stock: number | 'in'|'low'|'out'
  // p.shippingDays: liczba dni do wysyłki
  if (p.stock === "out" || p.stock === 0) return 0;
  if (p.stock === "low") return 0.5;
  let base = typeof p.stock === "number" ? Math.min(1, p.stock / 10) : 1; // im więcej tym lepiej (do 10)
  if (typeof p.shippingDays === "number") {
    if (p.shippingDays <= 1) base += 0.3;
    else if (p.shippingDays <= 3) base += 0.15;
  }
  return Math.min(1, base);
}

function qualityScore(p) {
  // bazuje na rating/reviews/sales jeśli są
  const r = typeof p.rating === "number" ? p.rating : null; // 0..5
  const rc = typeof p.reviewsCount === "number" ? p.reviewsCount : 0;
  const sales = typeof p.salesCount === "number" ? p.salesCount : 0;

  let s = 0;
  if (r != null) s += (r / 5); // 0..1
  if (rc > 0) s += Math.min(1, Math.log10(rc + 1) / 2); // do ~0.5
  if (sales > 0) s += Math.min(1, Math.log10(sales + 1) / 3); // do ~0.33
  return Math.min(1.8, s); // max ~1.8
}

function freshnessScore(p, now) {
  // preferuj nowsze produkty (jeśli createdAt jest)
  if (!p.createdAt) return 0;
  const ageDays = Math.max(0, (now() - new Date(p.createdAt).getTime()) / 86400000);
  if (ageDays < 30) return 1;
  if (ageDays < 90) return 0.6;
  if (ageDays < 180) return 0.3;
  return 0.1;
}

/* ================================
   3) TRAFIAJĄCE SYGNAŁY SLOTÓW
   ================================ */

function slotMatchSignals(hay, slots) {
  const reasons = [];
  let s = 0;

  // recipient
  if (slots.recipient && slots.recipient !== "uniwersalny") {
    if (hay.includes(N(slots.recipient))) {
      s += 1; reasons.push("dopasowanie: odbiorca");
    }
  } else {
    s += 0.2; // lekkie punkty za uniwersalność
  }

  // occasion
  if (slots.occasion) {
    if (hay.includes(N(slots.occasion)) || hay.includes("prezent")) {
      s += 0.8; reasons.push("dopasowanie: okazja");
    }
  }

  // hobbies
  if (Array.isArray(slots.hobbies) && slots.hobbies.length) {
    const hits = slots.hobbies.filter((h) => hay.includes(N(h)));
    if (hits.length) {
      s += 0.7 + 0.15 * hits.length;
      reasons.push(`tematy: ${hits.slice(0, 3).join(", ")}`);
    }
  }

  // tone
  if (slots.tone === "fun" && (hay.includes("smiesz") || hay.includes("śmiesz") || hay.includes("zabaw"))) {
    s += 0.25; reasons.push("styl: zabawny");
  }
  if (slots.tone === "elegant" && (hay.includes("elegan") || hay.includes("premium") || hay.includes("luks"))) {
    s += 0.25; reasons.push("styl: elegancki");
  }
  if (slots.tone === "cozy" && hay.includes("przytul")) {
    s += 0.15; reasons.push("styl: przytulny");
  }
  if (slots.tone === "romantic" && (hay.includes("romant") || hay.includes("serce"))) {
    s += 0.2; reasons.push("styl: romantyczny");
  }
  if (slots.tone === "practical" && hay.includes("praktycz")) {
    s += 0.2; reasons.push("styl: praktyczny");
  }

  // colors
  if (Array.isArray(slots.colors) && slots.colors.length) {
    const hit = slots.colors.find((c) => hay.includes(N(c)));
    if (hit) { s += 0.1; reasons.push(`kolor: ${hit}`); }
  }

  // materials
  if (Array.isArray(slots.materials) && slots.materials.length) {
    const hit = slots.materials.find((m) => hay.includes(N(m)));
    if (hit) { s += 0.12; reasons.push(`materiał: ${hit}`); }
  }

  // flags
  if (slots.personalized && /personaliz|grawer|imie|imi[eę]/.test(hay)) {
    s += 0.2; reasons.push("personalizowane");
  }
  if (slots.eco && /eko|eco|zero waste|bambus|wieloraz/.test(hay)) {
    s += 0.2; reasons.push("eko/zero-waste");
  }
  if (slots.local && /polsk|made in poland/.test(hay)) {
    s += 0.15; reasons.push("polska produkcja");
  }

  // category/brand boost jeśli user sugerował
  if (Array.isArray(slots.categoriesHint) && slots.categoriesHint.length) {
    const hit = slots.categoriesHint.find((c) => hay.includes(N(c)));
    if (hit) { s += 0.25; reasons.push(`kategoria: ${hit}`); }
  }

  return { score: s, reasons };
}

/* ================================
   4) DYVERSYFIKACJA / KARY
   ================================ */

function normalizeTitle(title) {
  return tokens(title).join(" ");
}

function penalizeDuplicates(items) {
  // kara za identyczne lub bardzo podobne tytuły
  const seen = new Map();
  for (const it of items) {
    const norm = normalizeTitle(it.p.name || "");
    const stem = stemWord(norm.split(" ").slice(0, 5).join(" "));
    const prev = seen.get(stem);
    if (prev) {
      it.dupPenalty = (it.dupPenalty || 0) + 0.2;
      prev.dupPenalty = (prev.dupPenalty || 0) + 0.05;
    } else {
      seen.set(stem, it);
    }
  }
}

function diversifyByCategoryBrand(items, opts) {
  const { minDistinctCategoriesInTop = 3, brandSpread = 2 } = opts.diversity || {};
  if (items.length === 0) return;

  // ogranicz brand flooding
  const brandWindow = new Map();
  const WINDOW = 6;

  for (let i = 0; i < items.length; i++) {
    const brand = (items[i].p.brand || "").toLowerCase();
    if (brand) {
      const count = brandWindow.get(brand) || 0;
      if (count >= brandSpread) {
        items[i].divPenalty = (items[i].divPenalty || 0) + 0.15 * (count - brandSpread + 1);
      }
      // okno przesuwne
      for (const [b, c] of brandWindow) {
        if (c <= 1) brandWindow.delete(b);
        else brandWindow.set(b, c - 1);
      }
      brandWindow.set(brand, Math.min(WINDOW, (brandWindow.get(brand) || 0) + 1));
    }
  }

  // preferuj min różne kategorie w top 10
  const topK = Math.min(10, items.length);
  const cats = new Set(items.slice(0, topK).map((x) => (x.p.category || "").toLowerCase()).filter(Boolean));
  if (cats.size < minDistinctCategoriesInTop) {
    // dopchnij inne kategorie delikatnym buffem
    const seen = new Set(Array.from(cats));
    for (let i = topK; i < items.length && cats.size < minDistinctCategoriesInTop; i++) {
      const c = (items[i].p.category || "").toLowerCase();
      if (c && !seen.has(c)) {
        items[i].divBonus = (items[i].divBonus || 0) + 0.2;
        cats.add(c);
        seen.add(c);
      }
    }
  }
}

/* ================================
   5) EXPLANATIONS / POWODY
   ================================ */

function buildReasons(parts) {
  // parts: array<string>
  const uniq = Array.from(new Set(parts.filter(Boolean)));
  // krótkie, zwięzłe
  return uniq.slice(0, 6).join(" · ");
}

/* ================================
   6) GŁÓWNA FUNKCJA RANKERA
   ================================ */

export function rankProducts(products, userSlotsOrText, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options, weights: { ...DEFAULT_WEIGHTS, ...(options.weights || {}) } };
  const slots = typeof userSlotsOrText === "string" ? quickParse(userSlotsOrText) : (userSlotsOrText || {});
  const W = opts.weights;

  // zbuduj textQuery (na potrzeby BM25-lite)
  const textQueryPieces = [];
  if (slots.recipient && slots.recipient !== "uniwersalny") textQueryPieces.push(slots.recipient);
  if (slots.occasion) textQueryPieces.push(slots.occasion);
  if (Array.isArray(slots.hobbies)) textQueryPieces.push(...slots.hobbies);
  if (slots.tone && slots.tone !== "any") textQueryPieces.push(slots.tone);
  if (Array.isArray(slots.colors)) textQueryPieces.push(...slots.colors);
  if (Array.isArray(slots.materials)) textQueryPieces.push(...slots.materials);
  if (Array.isArray(slots.categoriesHint)) textQueryPieces.push(...slots.categoriesHint);
  const textQuery = textQueryPieces.join(" ");

  const result = (products || []).map((p) => {
    const hay = N([p.name, p.description, ...(p.tags || []), p.brand, p.category].filter(Boolean).join(" "));

    // 1) dopasowanie tekstowe (BM25-lite)
    const bm = bm25LiteScore(textQuery, hay);
    let score = W.text * bm.score;
    const reasons = [];
    if (bm.hits?.length && opts.explainTokens) {
      reasons.push("trafione słowa: " + bm.hits.slice(0, 5).join(", "));
    }

    // 2) slot matches
    const sm = slotMatchSignals(hay, slots);
    score += W.recipient * (sm.reasons.includes("dopasowanie: odbiorca") ? 1 : 0);
    score += W.occasion * (sm.reasons.includes("dopasowanie: okazja") ? 1 : 0);
    // wyciągnij liczbę tematów z reasons (mały hack, ale działa z obecną implementacją)
    const hobbyReason = sm.reasons.find((r) => r.startsWith("tematy:"));
    if (hobbyReason) score += W.hobby;
    if (sm.reasons.find((r) => r.includes("zabawny"))) score += W.tone * 0.8;
    if (sm.reasons.find((r) => r.includes("elegancki"))) score += W.tone;
    if (sm.reasons.find((r) => r.startsWith("kolor:"))) score += W.colors;
    if (sm.reasons.find((r) => r.startsWith("materiał:"))) score += W.materials;

    // zapisz powody
    reasons.push(...sm.reasons);

    // 3) cena
    const price = p.price ?? null;
    let inBudget = false;
    if (slots.maxPrice != null || slots.minPrice != null) {
      const ok = priceOK(price, slots.minPrice, slots.maxPrice);
      if (ok) { score += W.priceInRange; inBudget = true; reasons.push("w budżecie"); }
      else reasons.push("poza budżetem");
    } else if (slots.budgetTier && slots.budgetTier !== "auto") {
      if (priceTierMatch(price, slots.budgetTier)) {
        score += W.priceTierMatch;
        reasons.push(`przedział: ${slots.budgetTier}`);
      }
    }

    // 4) jakość/popularność/świeżość
    const qS = qualityScore(p);
    if (qS > 0) {
      score += W.rating * Math.min(1, (p.rating ?? 0) / 5);
      score += W.reviews * Math.min(1, Math.log10((p.reviewsCount ?? 0) + 1) / 2);
      if (p.salesCount) score += W.sales * Math.min(1, Math.log10(p.salesCount + 1) / 3);
      if (p.rating != null) reasons.push(`ocena: ${p.rating.toFixed ? p.rating.toFixed(1) : p.rating}/5`);
      if (p.reviewsCount) reasons.push(`${p.reviewsCount} opinii`);
    }
    // świeżość
    const fS = freshnessScore(p, opts.now);
    if (fS > 0) score += W.freshness * fS;

    // 5) dostępność
    const aS = availabilityScore(p);
    if (aS > 0) {
      score += W.availability * aS;
      if (p.shippingDays != null) {
        if (p.shippingDays <= 1) { score += W.shippingFast; reasons.push("wysyłka 24h"); }
        else if (p.shippingDays <= 3) { reasons.push("wysyłka do 3 dni"); }
      }
      if (p.stock === "low") reasons.push("ostatnie sztuki");
    }

    // 6) boosts: category/brand jeśli user wskazał
    if (Array.isArray(slots.categoriesHint) && slots.categoriesHint.length && p.category) {
      const hit = slots.categoriesHint.find((c) => N(p.category).includes(N(c)));
      if (hit) { score += W.categoryBoost; reasons.push(`kategoria: ${p.category}`); }
    }
    if (p.brand && textQuery && N(textQuery).includes(N(p.brand))) {
      score += W.brandBoost; reasons.push(`marka: ${p.brand}`);
    }

    // 7) flagi
    if (slots.personalized && /personaliz|grawer|imie|imi[eę]/.test(hay)) score += W.personalized;
    if (slots.eco && /eko|eco|zero waste|bambus|wieloraz/.test(hay)) score += W.eco;
    if (slots.local && /polsk|made in poland/.test(hay)) score += W.local;

    // 8) bias na tańsze przy remisie
    const tieBias = price != null ? W.cheaperTieBias / Math.max(price, 1) : 0;

    return {
      p,
      score,
      price,
      reasons,
      inBudget,
      tieBias,
      dupPenalty: 0,
      divPenalty: 0,
      divBonus: 0,
    };
  });

  // pre-rank sort
  let ranked = result
    .filter((x) => x.score > 0 || (x.price != null && x.price > 0)) // odrzuć „martwe” karty
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if ((a.price ?? Infinity) !== (b.price ?? Infinity)) return (a.price ?? Infinity) - (b.price ?? Infinity);
      return b.tieBias - a.tieBias;
    });

  // dywersyfikacja i kary za duplikaty
  penalizeDuplicates(ranked);
  diversifyByCategoryBrand(ranked, opts);

  // final re-rank z karami/bonusami
  ranked.sort((a, b) => {
    const as = a.score - (a.dupPenalty || 0) - (a.divPenalty || 0) + (a.divBonus || 0);
    const bs = b.score - (b.dupPenalty || 0) - (b.divPenalty || 0) + (b.divBonus || 0);
    if (bs !== as) return bs - as;
    if ((a.price ?? Infinity) !== (b.price ?? Infinity)) return (a.price ?? Infinity) - (b.price ?? Infinity);
    return b.tieBias - a.tieBias;
  });

  // fallbacki jeśli dalej pusto
  let usedFallback = false;
  if (ranked.length === 0) {
    // 1) budżetowy
    const budgetList = (products || [])
      .filter((p) => typeof p.price === "number" && p.price > 0)
      .sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity))
      .slice(0, opts.topN || 24)
      .map((p) => ({
        p,
        reasons: ["propozycje budżetowe"],
        score: 0.1,
        price: p.price,
      }));
    if (budgetList.length) {
      ranked = budgetList;
      usedFallback = true;
    } else {
      // 2) uniwersalne (jakiekolwiek)
      ranked = (products || []).slice(0, opts.topN || 24).map((p) => ({ p, score: 0.05, reasons: ["propozycje uniwersalne"] }));
      usedFallback = true;
    }
  }

  // ogranicz wynik do topN
  ranked = ranked.slice(0, opts.topN || 24);

  // zbuduj reasons i output
  const items = ranked.map((x) => {
    const reason = buildReasons(x.reasons);
    return { ...x.p, _reason: reason };
  });

  return { items, usedFallback, slots };
}

/* ================================
   7) DODATKOWE NARZĘDZIA (opcjonalnie)
   ================================ */

// heurystyczny „query builder” (gdybyś chciał wysłać filtry do backendu)
export function toBackendFilters(slots) {
  const f = {};
  if (slots.recipient && slots.recipient !== "uniwersalny") f.recipient = slots.recipient;
  if (slots.occasion) f.occasion = slots.occasion;
  if (Array.isArray(slots.hobbies) && slots.hobbies.length) f.hobbies = slots.hobbies;
  if (slots.minPrice != null) f.minPrice = slots.minPrice;
  if (slots.maxPrice != null) f.maxPrice = slots.maxPrice;
  if (slots.budgetTier && slots.budgetTier !== "auto") f.tier = slots.budgetTier;
  if (slots.tone && slots.tone !== "any") f.tone = slots.tone;
  if (Array.isArray(slots.colors) && slots.colors.length) f.colors = slots.colors.slice(0, 3);
  if (Array.isArray(slots.materials) && slots.materials.length) f.materials = slots.materials.slice(0, 3);
  if (Array.isArray(slots.categoriesHint) && slots.categoriesHint.length) f.categories = slots.categoriesHint.slice(0, 3);
  return f;
}

// szybkie testy lokalnie (odkomentuj przy dev)
// if (import.meta?.env?.DEV) {
//   const demoSlots = quickParse("dla dziewczyny na urodziny, lubi kawę i spa, budżet do 150 zł, elegancki styl, personalizowane");
//   console.log("DEMO SLOTS:", demoSlots);
// }
