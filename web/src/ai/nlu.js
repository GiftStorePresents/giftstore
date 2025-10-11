// src/ai/nlu.js
// Rozszerzony NLU dla asystenta prezentowego (PL-first, z fallbackami EN).
// Bez LLM – heurystyki + bogate słowniki + reguły.
//
// Eksportuje:
// - quickParse(text)              – szybki parser high-level (zwraca "slots")
// - deepParse(text)               – bardziej szczegółowy wynik (z metadanymi i conf.)
// - mergeSlots(base, patch)       – łączenie kontekstu rozmowy
// - followupNeeded(slots)         – co jeszcze dopytać użytkownika
// - yesNoMore(text)               – wykrycie intencji: tak/nie/pokaż więcej
// - extractBudget(text)           – parser budżetu (liczby, widełki, waluty, tony cheap/mid/premium)
// - priceBand(price)              – klasyfikacja ceny na pasmo
// - normalize(str)                – helper do normalizacji
//
// Uwaga: to NLU jest „cost-free”, idealne jako warstwa przed-rankerem.
// Dla „prawdziwego AI” z LLM utrzymujemy ten sam interfejs slots – łatwo podmienić.

/////////////////////////////
// 0) UTIL: Normalizacja  //
/////////////////////////////

export const normalize = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    // usuń znaki diakrytyczne (PL i nie tylko)
    .replace(/\p{Diacritic}/gu, "")
    // zamień różne apostrofy/cudzysłowy na zwykłe
    .replace(/[’`´“”„"]/g, "'")
    // usuń podwójne spacje
    .replace(/\s+/g, " ")
    .trim();

// pobierz słowa (tokeny) z tolerancją na myślniki/znaki
const tokens = (s) =>
  normalize(s)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);

// szybkie sprawdzenie czy tekst zawiera któreś ze słów
const hasAny = (hay, arr) => arr.some((w) => hay.includes(normalize(w)));

// Prefiksy/lematy pomocnicze: dopasowanie początków (np. "dziewczyn", "dziewczynie")
const hasStem = (hay, stems) =>
  stems.some((stem) => new RegExp(`\\b${normalize(stem)}`, "i").test(hay));

/////////////////////////////////////////
// 1) SŁOWNIKI / TAKSONOMIE (obszerne) //
/////////////////////////////////////////

// Uwaga: słowniki są obszerne, ale można je dalej rozwijać – moduł wspiera "synonymsExt" w deepParse.

const RECIPIENTS = {
  "dla niej": [
    // bezpośrednie
    "dla niej", "kobieta", "dziewczyna", "narzeczona", "partnerka", "ukochana", "żona", "zona",
    "kolezanka", "koleżanka", "przyjaciolka", "przyjaciółka", "siostra", "szwagierka", "teściowa", "tesciowa",
    // formy fleksyjne/stemy
    "dziewczyn", "partnerk", "zon", "żon", "kobiet", "przyjaciolk", "kolezank",
    // en
    "for her", "woman", "ladies", "girlfriend", "wife", "fiancee", "female", "lady", "girl"
  ],
  "dla niego": [
    "dla niego", "mężczyzna", "mezczyzna", "facet", "chlopak", "narzeczony", "partner", "mąż", "maz",
    "brat", "szwagier", "teść", "tesc",
    "mezczyzn", "chlopc", "partner", "narzeczon",
    "for him", "man", "male", "boyfriend", "husband", "gentleman", "guy"
  ],
  "dla dzieci": [
    "dla dziecka", "dla dzieci", "chlopiec", "dziewczynka", "maluch", "maluszek", "przedszkolak", "uczeń", "uczen",
    "nastolatek", "nastolatka", "teen", "mlodziez", "młodzież",
    "dzieck", "kids", "kid", "children", "boy", "girl", "teenager"
  ],
  "dla mamy": [
    "dla mamy", "mama", "mamie", "mamusia", "mamci", "mother", "mom", "mum"
  ],
  "dla taty": [
    "dla taty", "tata", "tacie", "tatko", "ojciec", "father", "dad"
  ],
  "dla pary": [
    "dla pary", "para", "małżeństwo", "malzenstwo", "nowozency", "nowożeńcy", "narzeczeni", "couple"
  ],
  "dla dziadków": [
    "dla dziadkow", "dla dziadków", "dziadek", "babcia", "grandparents", "grandma", "grandpa"
  ],
  "dla nauczyciela": [
    "dla nauczyciela", "nauczyciel", "nauczycielka", "wychowawca", "teacher", "tutor"
  ],
  "uniwersalny": [
    "uniwersalny", "neutralny", "dla kazdego", "dla wszystkich", "everyone", "anyone"
  ],
};

const OCCASIONS = {
  "na urodziny": ["urodziny", "urodzin", "bday", "birthday", "sto lat", "18-tka", "18tka", "osiemnastka"],
  imieniny: ["imieniny", "imienin", "name day"],
  rocznica: ["rocznica", "rocznic", "anniversary"],
  swieta: ["swieta", "święta", "xmas", "christmas", "mikołaj", "mikolaj", "gwiazdka", "boze narodzenie"],
  walentynki: ["walentynki", "walentego", "valentines", "valentine"],
  slub: ["slub", "ślub", "wesele", "wedding"],
  dzien_matki: ["dzien matki", "dzień matki", "mother's day"],
  dzien_ojca: ["dzien ojca", "dzień ojca", "father's day"],
  dzien_kobiet: ["dzien kobiet", "dzień kobiet", "women's day", "8 marca"],
  zakończenie_roku: ["zakonczenie roku", "zakończenie roku", "koniec roku szkolnego", "graduation"],
  "bez okazji": ["bez okazji", "po prostu", "just because", "tak o", "niespodzianka"],
};

// „tematy” / hobbies / zainteresowania – rozbudowany zestaw
const HOBBIES = {
  sport: ["sport", "bieganie", "rower", "piłka", "pilka", "siatkowka", "tenis", "fitness", "joga", "gimnastyka", "narciarstwo", "snowboard", "wspinaczka", "turystyka", "hiking", "golf", "pływanie", "plywanie", "koszykówka", "koszykowka"],
  kuchnia: ["gotowanie", "kuchnia", "pieczenie", "baking", "kucharz", "szef kuchni", "kucharka"],
  kawa: ["kawa", "barista", "espresso", "aeropress", "drip", "chemex", "latte", "cappuccino", "kofeina"],
  herbata: ["herbata", "teapot", "oolong", "matcha", "yerba", "yerba mate"],
  wino: ["wino", "wine", "sommelier", "winnica"],
  piwo: ["piwo", "kraft", "browar", "beer"],
  gry: ["gry", "gaming", "game", "gracz", "konsole", "xbox", "playstation", "ps5", "switch", "pc"],
  planszowki: ["planszowki", "planszówki", "board games", "karcianki", "karciana", "dnd", "rpg"],
  lego: ["lego", "klocki"],
  sztuka: ["sztuka", "art", "rysunek", "malarstwo", "akwarela", "rzezba", "fotografia", "foto", "camera"],
  muzyka: ["muzyka", "dj", "gitara", "pianino", "instrument", "koncert", "vinyl", "winyl", "sluchawki", "słuchawki"],
  książki: ["ksiazki", "książki", "czytanie", "czytelnik", "literatura", "ebook"],
  uroda: ["uroda", "kosmetyki", "spa", "wellness", "relaks", "perfumy", "makeup", "makijaz", "paznokcie", "manicure"],
  biżuteria: ["bizuteria", "biżuteria", "naszyjnik", "bransoletka", "kolczyki", "zloty", "srebrny"],
  dom: ["dom", "dekoracje", "swieca", "świeca", "zapach", "plakat", "ramka", "roślina", "roslina"],
  tech: ["technologia", "gadzet", "gadzety", "smart", "powerbank", "ładowarka", "ladowarka"],
  podróże: ["podroze", "podróże", "podroz", "walizka", "poduszka", "turystyczny"],
  motoryzacja: ["auto", "samochod", "motoryzacja", "motocykl", "rower", "bmx", "tuning"],
  zwierzęta: ["zwierzeta", "zwierzęta", "pies", "kot", "kociarz", "psiak", "akcesoria dla psa", "dla kota"],
  handmade: ["handmade", "rękodzieło", "rekodzielo", "craft", "hand made"],
  eco: ["eko", "eco", "zero waste", "wielorazowe", "bambus", "przyjazny srodowisku"],
  personalizacja: ["personalizowany", "personalizacja", "grawer", "imie", "imię", "napis", "dedykacja"],
};

// Style / tone / vibe
const TONES = {
  fun: ["śmiesz", "smiesz", "żart", "zart", "humor", "meme", "joke", "gag", "głupot", "glupot"],
  elegant: ["elegan", "klas", "premium", "luks", "szyk", "wyrafin", "delikatn", "subtel"],
  cozy: ["przytul", "ciepł", "ciepl", "hygge"],
  romantic: ["romant", "miłos", "milos", "serce", "love"],
  practical: ["praktycz", "użytecz", "uzytecz", "codzienn"],
};

// Kolory (na przyszłość do filtrów)
const COLORS = {
  czerwony: ["czerw", "red", "burgund"],
  różowy: ["roz", "róż", "pink"],
  żółty: ["zol", "żół", "yellow", "zlot", "gold"],
  złoty: ["zlot", "gold"],
  niebieski: ["niebies", "blue", "granat", "navy"],
  zielony: ["ziel", "green", "mięt", "miet", "olive"],
  czarny: ["czarn", "black"],
  biały: ["bia", "white", "cream", "krem"],
  srebrny: ["srebr", "silver", "steel"],
};

// Materiały / wykonanie
const MATERIALS = {
  skóra: ["skora", "skór", "leather", "eko skóra", "ekoskora"],
  drewno: ["drewno", "drewn", "wood", "dębow", "dab", "buk"],
  szkło: ["szklo", "szkł", "glass", "kryształ", "krysztal"],
  metal: ["metal", "stal", "stainless", "aluminium", "alumini"],
  ceramika: ["ceramik", "porcelan", "kamionk", "mug"],
  tekstylia: ["bawełn", "baweln", "len", "wełn", "weln", "tkanin"],
};

// Kategorie (do podpowiedzi alternatyw)
const CATEGORIES_HINT = {
  kubki: ["kubek", "mug"],
  świece: ["świec", "swiec", "candle"],
  zestawy_spa: ["spa", "relaks", "zestaw spa", "bath", "bath set"],
  słodycze: ["czekolad", "słodycz", "slodycz", "sweets", "chocolate"],
  foto: ["foto", "zdjęci", "zdjec", "ramka", "album"],
  biżuteria: ["biżuteria", "bizuteria", "kolczyk", "naszyjnik", "bransolet"],
  notesy: ["notes", "notatnik", "bullet", "planner", "planer"],
  dekor: ["plakat", "poster", "dekoracj", "poduszka", "lampk"],
  kuchnia: ["deska do krojenia", "fartuch", "kuchenn", "przypraw"],
};

//////////////////////////////////////
// 2) Wykrywanie odbiorcy/okazji    //
//////////////////////////////////////

function pickFromDict(text, dict) {
  const t = normalize(text);
  for (const [canon, arr] of Object.entries(dict)) {
    // dopasowania „pełnych” fraz
    if (arr.some((w) => t.includes(normalize(w)))) return canon;
  }
  return "";
}

// „stemy” – czasem wygodniej złapać od początku wyrazu
function pickByStem(text, dict) {
  const t = normalize(text);
  for (const [canon, arr] of Object.entries(dict)) {
    if (hasStem(t, arr)) return canon;
  }
  return "";
}

//////////////////////////////////////
// 3) Budżet / liczby / waluty      //
//////////////////////////////////////

// dopuszczalne waluty (głównie PLN, ale niech parser będzie elastyczny)
const CURRENCY = [
  "zl", "zł", "pln", "eur", "€", "usd", "\\$", "gbp", "£"
];

// różne formy „do”, „około”, „maksymalnie”, „pomiędzy”
const PRICE_PATTERNS = [
  // 50 zł, 149.90, 1 200 zl
  new RegExp(String.raw`(?:^|\s)(\d{1,4}(?:[ \.,]\d{3})*(?:[\,\.]\d{1,2})?)\s*(?:${CURRENCY.join("|")})?`, "gi"),
];

const RANGE_PATTERNS = [
  // 100-150 zł / 100 – 150 pln
  new RegExp(String.raw`(\d{1,4})\s*[-–—]\s*(\d{1,4})\s*(?:${CURRENCY.join("|")})?`, "i"),
  // od 100 do 200 zł
  new RegExp(String.raw`od\s*(\d{1,4})\s*do\s*(\d{1,4})\s*(?:${CURRENCY.join("|")})?`, "i"),
  // około 150 zł
  new RegExp(String.raw`oko(?:lo|ło)\s*(\d{1,4})\s*(?:${CURRENCY.join("|")})?`, "i"),
];

const PRICE_KEYWORDS = {
  max: ["max", "do", "nie wiecej niz", "nie więcej niż", "<= ", "mniej niz", "ponizej", "poniżej", "budzet do", "budżet do"],
  min: ["od", "minimum", "najmniej", "co najmniej"],
  around: ["okolo", "około", "koło", "~", "mniej wiecej", "mniej więcej"],
  cheap: ["tani", "niedrogi", "budzetowy", "budżetowy", "tanio", "okazja", "promka", "do 50", "do 100", "do 150"],
  mid: ["sredni", "średni", "porzadny", "porządny", "rozsądny", "rozsadny"],
  premium: ["drogi", "premium", "ekskluzywny", "luksus", "top", "najlepszy", "z wyzszej polki", "z wyższej półki"],
};

export function priceBand(price) {
  if (price == null || isNaN(price)) return "mid";
  if (price <= 80) return "cheap";
  if (price <= 200) return "mid";
  return "premium";
}

export function extractBudget(text) {
  const t = normalize(text);
  let minPrice = null, maxPrice = null, approx = false, tier = "auto";

  // 1) zakresy
  for (const r of RANGE_PATTERNS) {
    const m = t.match(r);
    if (m) {
      const a = Number(m[1].replace(/[^\d]/g, ""));
      const b = Number(m[2].replace(/[^\d]/g, ""));
      minPrice = Math.min(a, b);
      maxPrice = Math.max(a, b);
      break;
    }
  }

  // 2) pojedyncze kwoty
  if (minPrice == null && maxPrice == null) {
    const found = [];
    for (const p of PRICE_PATTERNS) {
      let m;
      while ((m = p.exec(t))) {
        const val = Number(String(m[1]).replace(/[^\d]/g, ""));
        if (!isNaN(val)) found.push(val);
      }
    }
    if (found.length === 1) {
      // sprawdź słowa poprzedzające
      if (PRICE_KEYWORDS.max.some((k) => t.includes(k))) {
        maxPrice = found[0];
      } else if (PRICE_KEYWORDS.min.some((k) => t.includes(k))) {
        minPrice = found[0];
      } else if (PRICE_KEYWORDS.around.some((k) => t.includes(k))) {
        minPrice = Math.max(0, found[0] - Math.round(found[0] * 0.15));
        maxPrice = Math.round(found[0] * 1.15);
        approx = true;
      } else {
        // default: traktuj jako max
        maxPrice = found[0];
      }
    } else if (found.length >= 2) {
      minPrice = Math.min(...found);
      maxPrice = Math.max(...found);
    }
  }

  // 3) tier z opisów (jeśli nie ma liczb)
  if (maxPrice == null && minPrice == null) {
    if (PRICE_KEYWORDS.cheap.some((k) => t.includes(k))) tier = "cheap";
    else if (PRICE_KEYWORDS.premium.some((k) => t.includes(k))) tier = "premium";
    else if (PRICE_KEYWORDS.mid.some((k) => t.includes(k))) tier = "mid";
  }

  // sanity check
  if (minPrice != null && maxPrice != null && minPrice > maxPrice) {
    const tmp = minPrice; minPrice = maxPrice; maxPrice = tmp;
  }

  return { minPrice, maxPrice, approx, budgetTier: tier };
}

//////////////////////////////////////
// 4) Wiek, ilosc osob, pilnosc     //
//////////////////////////////////////

function extractAge(text) {
  const t = normalize(text);
  // 12 lat, 7-latka, 18-latek
  const m = t.match(/(\d{1,2})\s*[-\s]?\s*lat(?:ek|ka)?/i);
  if (m) return Number(m[1]);
  if (t.includes("nastolat")) return "teen";
  if (t.includes("dzieck")) return "kid";
  return "";
}

function extractCount(text) {
  const t = normalize(text);
  // dla pary / dwóch osób / 2 osoby
  if (t.includes("para") || t.includes("dla pary")) return 2;
  const m = t.match(/\b(\d{1,2})\s*(osob|par|szt|x)\b/i);
  return m ? Number(m[1]) : null;
}

function extractUrgency(text) {
  const t = normalize(text);
  if (/dzisiaj|dzis|natychmiast|piln|asap|teraz/.test(t)) return "now";
  if (/jutro|do jutra|na jutro/.test(t)) return "tomorrow";
  if (/w\s+ten\s+weekend|na weekend/.test(t)) return "weekend";
  if (/do\s*(?:\d{1,2})\s*(?:dni|dnia)/.test(t)) return "few_days";
  if (/do\s*konca\s*tygodnia|do\s*końca\s*tygodnia/.test(t)) return "this_week";
  return "";
}

//////////////////////////////////////
// 5) Tone/Style, kolory, material  //
//////////////////////////////////////

function pickTone(text) {
  const t = normalize(text);
  for (const [tone, arr] of Object.entries(TONES)) {
    if (arr.some((w) => t.includes(normalize(w)))) return tone;
  }
  return "any";
}

function pickColors(text) {
  const t = normalize(text);
  const res = [];
  for (const [canon, arr] of Object.entries(COLORS)) {
    if (arr.some((w) => t.includes(normalize(w)))) res.push(canon);
  }
  return Array.from(new Set(res));
}

function pickMaterials(text) {
  const t = normalize(text);
  const res = [];
  for (const [canon, arr] of Object.entries(MATERIALS)) {
    if (arr.some((w) => t.includes(normalize(w)))) res.push(canon);
  }
  return Array.from(new Set(res));
}

//////////////////////////////////////
// 6) Hobbies / Tematy              //
//////////////////////////////////////

function pickHobbies(text) {
  const t = normalize(text);
  const res = [];
  for (const [canon, arr] of Object.entries(HOBBIES)) {
    if (arr.some((w) => t.includes(normalize(w)))) res.push(canon);
  }
  return Array.from(new Set(res));
}

//////////////////////////////////////
// 7) Flag: eco/personalizacja etc. //
//////////////////////////////////////

function extractFlags(text) {
  const t = normalize(text);
  return {
    eco: hasAny(t, HOBBIES.eco || []),
    personalized: hasAny(t, HOBBIES.personalizacja || []) || /imie|imię|grawer|personaliz/i.test(t),
    local: /polsk[ai]|made in poland|z polski/.test(t),
    giftwrap: /pakowanie prezentowe|pakujecie|zapakowac|zapakować|gift wrap/i.test(t),
  };
}

//////////////////////////////////////
// 8) Kategorie / alternatywy       //
//////////////////////////////////////

function categoryHints(text) {
  const t = normalize(text);
  const res = [];
  for (const [canon, arr] of Object.entries(CATEGORIES_HINT)) {
    if (arr.some((w) => t.includes(normalize(w)))) res.push(canon);
  }
  return Array.from(new Set(res));
}

//////////////////////////////////////
// 9) Intencje odpowiedzi           //
//////////////////////////////////////

// wykrycie "tak/nie/pokaż więcej"
export function yesNoMore(text) {
  const t = normalize(text);
  if (/^(tak|poprosze|prosz[eę]|jasne|ok|dawaj|pewnie|chce|chc[eę]|poka[zż])/i.test(t)) return "yes";
  if (/^(nie|dzięku|dzieku|wystarczy|enough|stop|pasuje)/i.test(t)) return "no";
  if (/więcej|pokaz wiecej|pokaż więcej|more|inne propozycje/.test(t)) return "more";
  if (/ta[nń]sze|tansze|mniej drogie/.test(t)) return "cheaper";
  if (/dro[zż]sze|droższe|lepsze/.test(t)) return "pricier";
  // reset / zacznij od nowa?
  if (/od\s*nowa|reset|zaczni/.test(t)) return "reset";
  return "";
}

//////////////////////////////////////
// 10) Follow-up / brakujące sloty  //
//////////////////////////////////////

export function followupNeeded(slots) {
  // Minimalny komplet do pokazania wyników: recipient + occasion
  if (!slots.recipient || slots.recipient === "uniwersalny") {
    return { key: "recipient", question: "Dla kogo ma być prezent? (dla niej, dla niego, dla dzieci, dla mamy…)" };
  }
  if (!slots.occasion) {
    return { key: "occasion", question: "Z jakiej okazji? (urodziny, święta, rocznica, bez okazji…)" };
  }
  // Mile widziane doprecyzowanie, ale nie wymagane:
  if (!slots.hobbies || slots.hobbies.length === 0) {
    return { key: "hobbies", question: "Są jakieś zainteresowania lub styl? (kawa, gry, biżuteria, elegancki…)" };
  }
  return null;
}

//////////////////////////////////////
// 11) MERGE / CONFIDENCE           //
//////////////////////////////////////

function confidence(val) {
  if (!val) return 0;
  if (Array.isArray(val)) return Math.min(1, 0.4 + 0.15 * val.length);
  if (typeof val === "number") return 0.8;
  return 0.9;
}

export function mergeSlots(base = {}, patch = {}) {
  const out = { ...(base || {}) };
  for (const [k, v] of Object.entries(patch || {})) {
    if (v == null || v === "" || (Array.isArray(v) && v.length === 0)) continue;
    if (Array.isArray(v)) {
      out[k] = Array.from(new Set([...(out[k] || []), ...v]));
    } else if (typeof v === "object" && !Array.isArray(v)) {
      out[k] = { ...(out[k] || {}), ...v };
    } else {
      out[k] = v;
    }
  }
  return out;
}

function scoreSlots(slots) {
  // prosty scoring pewności kompletności
  const keys = ["recipient", "occasion", "hobbies", "minPrice", "maxPrice"];
  let s = 0;
  for (const k of keys) s += confidence(slots[k]);
  return Math.min(1, s / keys.length);
}

//////////////////////////////////////
// 12) PARSERY GŁÓWNE               //
//////////////////////////////////////

// szybka wersja (kompatybilna z Twoim kodem)
export function quickParse(text) {
  const t = normalize(text);

  let recipient = pickFromDict(t, RECIPIENTS) || pickByStem(t, RECIPIENTS) || "";
  // mapowanie semantyczne: dziewczyna/żona → dla niej itp. (zawarte w słowniku)

  let occasion = pickFromDict(t, OCCASIONS) || "";
  // normalize: „na urodziny” zostaje jako klucz

  const hobbies = pickHobbies(t);
  const ageHint = extractAge(t);

  const budget = extractBudget(t);

  const tone = pickTone(t);
  const colors = pickColors(t);
  const materials = pickMaterials(t);
  const flags = extractFlags(t);
  const count = extractCount(t);
  const urgency = extractUrgency(t);
  const cats = categoryHints(t);

  return {
    queryRaw: text,
    recipient,
    occasion,
    hobbies,
    ageHint,
    ...budget,          // minPrice, maxPrice, approx, budgetTier
    tone,
    colors,
    materials,
    ...flags,           // eco, personalized, local, giftwrap
    count,
    urgency,
    categoriesHint: cats,
    confidence: scoreSlots({
      recipient, occasion, hobbies, minPrice: budget.minPrice, maxPrice: budget.maxPrice,
    }),
  };
}

// bogatsza wersja (z metadanymi i możliwością rozszerzenia słowników)
export function deepParse(text, synonymsExt = {}) {
  const t = normalize(text);

  // 1) scal słowniki z rozszerzeniami (opcjonalne)
  const REC = { ...RECIPIENTS, ...(synonymsExt.recipients || {}) };
  const OCC = { ...OCCASIONS, ...(synonymsExt.occasions || {}) };
  const HOB = { ...HOBBIES, ...(synonymsExt.hobbies || {}) };
  const TON = { ...TONES, ...(synonymsExt.tones || {}) };

  const recipient = pickFromDict(t, REC) || pickByStem(t, REC) || "";
  const occasion  = pickFromDict(t, OCC) || "";
  const hobbies   = (() => {
    const res = [];
    for (const [canon, arr] of Object.entries(HOB)) {
      if (arr.some((w) => t.includes(normalize(w)))) res.push(canon);
    }
    return Array.from(new Set(res));
  })();

  const ageHint  = extractAge(t);
  const budget   = extractBudget(t);
  const tone     = (() => {
    for (const [canon, arr] of Object.entries(TON)) {
      if (arr.some((w) => t.includes(normalize(w)))) return canon;
    }
    return "any";
  })();

  const colors     = pickColors(t);
  const materials  = pickMaterials(t);
  const flags      = extractFlags(t);
  const count      = extractCount(t);
  const urgency    = extractUrgency(t);
  const cats       = categoryHints(t);
  const intentMore = yesNoMore(t);

  const slots = {
    queryRaw: text,
    recipient, occasion, hobbies, ageHint,
    ...budget,
    tone, colors, materials,
    ...flags,
    count, urgency,
    categoriesHint: cats,
    intent: intentMore, // 'yes'/'no'/'more'/'cheaper'/'pricier'/...
  };

  return {
    slots,
    quality: {
      confidence: scoreSlots(slots),
      missing: (function () {
        const miss = [];
        if (!slots.recipient || slots.recipient === "uniwersalny") miss.push("recipient");
        if (!slots.occasion) miss.push("occasion");
        if (!slots.hobbies || slots.hobbies.length === 0) miss.push("hobbies");
        return miss;
      })(),
    },
    debug: {
      tokens: tokens(text),
      normalized: t,
    },
  };
}

//////////////////////////////////////
// 13) Pomoc: generowanie follow-up //
//////////////////////////////////////

export function nextFollowup(slots) {
  const miss = followupNeeded(slots);
  if (!miss) return null;
  return miss.question;
}

//////////////////////////////////////
// 14) Mini-reguły „preferencje”    //
//////////////////////////////////////

export function preferenceHints(slots) {
  const out = [];
  if (slots.personalized) out.push("personalizowane");
  if (slots.eco) out.push("eko/zero-waste");
  if (slots.local) out.push("polska produkcja");
  if (slots.colors?.length) out.push(`kolory: ${slots.colors.slice(0, 2).join(", ")}`);
  if (slots.materials?.length) out.push(`materiały: ${slots.materials.slice(0, 2).join(", ")}`);
  if (slots.tone && slots.tone !== "any") out.push(`styl: ${slots.tone}`);
  if (slots.categoriesHint?.length) out.push(`kategorie: ${slots.categoriesHint.slice(0, 2).join(", ")}`);
  return out;
}

//////////////////////////////////////
// 15) Surowe słowniki do wglądu    //
//////////////////////////////////////

export const LEXICON = {
  RECIPIENTS, OCCASIONS, HOBBIES, TONES, COLORS, MATERIALS, CATEGORIES_HINT,
};

//////////////////////////////////////
// 16) Szybkie testy (dev helper)   //
//////////////////////////////////////

// Odkomentuj przy lokalnym devie:
// if (import.meta?.env?.DEV) {
//   const ex = [
//     "Szukam dla dziewczyny, na urodziny, lubi kawę i spa, około 150 zł.",
//     "Prezent dla taty – coś do 100 zł, motoryzacja, praktyczny.",
//     "Coś śmiesznego dla koleżanki, bez okazji.",
//     "Dla mamy na święta, eleganckie, może biżuteria lub świeca.",
//     "Dla chłopaka, budżet skromny, 50-80 zł, gaming/lego.",
//     "Dla dzieci, 12 lat, do 150 zł, rower lub planszówki.",
//   ];
//   for (const q of ex) {
//     console.log(q, deepParse(q));
//   }
// }
