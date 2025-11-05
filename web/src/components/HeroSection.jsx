// src/components/HeroSection.jsx
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

// 1) API_BASE: VITE_API_URL albo same-origin (działa z proxy w vite.config.ts)
const API_BASE = (() => {
  const fromEnv =
    (typeof import.meta !== "undefined" &&
      import.meta.env &&
      import.meta.env.VITE_API_URL) || "";
  const val = (typeof window !== "undefined" && window.__API_URL__) || fromEnv || "";
  return String(val).replace(/\/+$/, ""); // bez trailing slash
})();

// 2) Helper do budowy URL
const api = (path) => `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;

// 3) Cichy fetch JSON: 404/204 → null, „hero not configured” → null
async function safeFetchJson(url, init) {
  const res = await fetch(url, { cache: "no-store", ...init });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  if (res.status === 404 || res.status === 204) return null;
  if (!res.ok) {
    // jeżeli backend zwraca {"message":"hero not configured"}
    const msg = (json && (json.error || json.message)) || text || `HTTP ${res.status}`;
    if (String(msg).toLowerCase().includes("hero not configured")) return null;
    throw new Error(msg);
  }
  return json;
}

const SOURCE_UNCAT_SLUG = "bez-kategorii";

export default function HeroSection({
  // Domyślne treści/styl (renderujemy, jeśli nie ma rekordu w bazie)
  title: titleProp = "Najlepsze prezenty na każdą okazję!",
  subtitle: subtitleProp = "Znajdź coś wyjątkowego dla bliskich — szybka wysyłka, bogata oferta.",
  ctaPrimary = { to: "/categories/wszystkie", label: "Przeglądaj prezenty" },
  ctaSecondary = { to: "/categories/bestsellers", label: "Bestsellery" },
  chips: chipsProp,
  imageCard: imageCardProp = "/images/pexels-tofros-com-83191-257855.jpg",
  imageBackdrop: imageBackdropProp = "/images/pexels-tofros-com-83191-257855.jpg",
}) {
  // ===== 1) Pobranie konfiguracji z API albo localStorage; NIE ukrywamy z powodu braku
  const [heroCfg, setHeroCfg] = useState(null);
  const [hiddenByFlag, setHiddenByFlag] = useState(false); // tylko gdy enabled === false

  useEffect(() => {
    let stop = false;
    (async () => {
      // najpierw API publiczne
      try {
        const data = await safeFetchJson(api("/api/public/hero"));
        if (stop) return;
        if (!data) {
          // brak w bazie — spróbuj localStorage, ale i tak nie ukrywamy
          try {
            const txt = localStorage.getItem("__hero_cfg__");
            if (txt) {
              const parsed = JSON.parse(txt);
              if (!stop && parsed) {
                setHeroCfg(parsed);
                setHiddenByFlag(parsed.enabled === false);
                console.info("[Hero] render: localStorage fallback");
              } else {
                console.info("[Hero] render: defaults (no record)");
              }
            } else {
              console.info("[Hero] render: defaults (no record)");
            }
          } catch {
            console.info("[Hero] render: defaults (no record)");
          }
          return;
        }
        // mamy rekord; tylko enabled:false faktycznie ukrywa sekcję
        if (data.enabled === false) {
          setHeroCfg(data);
          setHiddenByFlag(true);
          console.info("[Hero] hidden: enabled=false from API");
          return;
        }
        setHeroCfg(data);
        setHiddenByFlag(false);
        console.info("[Hero] render: API data");
      } catch (e) {
        // błąd sieci → podejdź jak „brak rekordu”: spróbuj localStorage i/lub domyślne
        console.warn("[Hero] API error, using fallback:", e?.message || e);
        try {
          const txt = localStorage.getItem("__hero_cfg__");
          if (!stop && txt) {
            const parsed = JSON.parse(txt);
            setHeroCfg(parsed);
            setHiddenByFlag(parsed?.enabled === false);
            console.info("[Hero] render: localStorage after API error");
          } else {
            console.info("[Hero] render: defaults after API error");
          }
        } catch {
          console.info("[Hero] render: defaults after API error");
        }
      }
    })();
    return () => { stop = true; };
  }, []);

  // 2) Teksty + CTA
  const title = heroCfg?.title ?? titleProp;
  const subtitle = heroCfg?.subtitle ?? subtitleProp;
  const cta1 = {
    to: heroCfg?.ctaHref ?? heroCfg?.ctaPrimaryTo ?? ctaPrimary.to,
    label: heroCfg?.ctaText ?? heroCfg?.ctaPrimaryLabel ?? ctaPrimary.label,
  };
  const cta2 = {
    to: ctaSecondary.to,
    label: ctaSecondary.label,
  };

  // 3) Chipsy z kategorii (showInHero → fallback do showInTiles)
  const [chipsAuto, setChipsAuto] = useState([]);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const data = await safeFetchJson(api("/api/categories"));
        const arrRaw = Array.isArray(data) ? data : (data?.items || []);
        const arr = arrRaw.filter((c) => {
          if (!c || c.slug === SOURCE_UNCAT_SLUG) return false;
          const show = (typeof c.showInHero !== "undefined" ? c.showInHero : c.showInTiles);
          return show !== false;
        });
        const chips = arr.slice(0, 8).map((c) => ({ label: c.name, to: `/categories/${c.slug}` }));
        if (alive) setChipsAuto(chips);
      } catch {
        // brak – zostań przy fallbackach
      }
    };
    load();
    const ref = () => load();
    window.addEventListener("categories:refresh", ref);
    return () => { alive = false; window.removeEventListener("categories:refresh", ref); };
  }, []);

  const chips = useMemo(() => {
    if (Array.isArray(chipsProp) && chipsProp.length) return chipsProp;
    if (chipsAuto.length) return chipsAuto;
    return [
      { label: "Dla niej", to: "/search?q=Dla%20niej" },
      { label: "Dla niego", to: "/search?q=Dla%20niego" },
      { label: "Premium", to: "/search?q=Premium" },
      { label: "Do 150 zł", to: "/search?q=Do%20150%20z%C5%82" },
    ];
  }, [chipsProp, chipsAuto]);

  // 4) Obrazki (desktop/mobile) – z configu albo fallback
  const imageBackdrop = heroCfg?.imageUrl || imageBackdropProp;
  const imageCard = heroCfg?.imageUrl || imageCardProp;
  const imageMobile = heroCfg?.mobileUrl || imageBackdrop;

  // 5) Realne ukrycie tylko jeśli admin wyłączył (enabled=false)
  if (hiddenByFlag) return null;

  // 6) Warstwy
  const lightLayer = [
    "linear-gradient(145deg, rgba(250,224,194,0.78) 0%, rgba(250,185,106,0.62) 55%, rgba(197,14,72,0.45) 100%)",
    "radial-gradient(900px 420px at 86% 88%, rgba(255,215,0,.20), rgba(255,215,0,0) 65%)",
    "radial-gradient(1200px 520px at 10% 12%, rgba(215,38,61,.08), rgba(215,38,61,0) 60%)",
  ].join(",");
  const darkLayer = [
    "linear-gradient(180deg, rgba(120,10,30,.85) 0%, rgba(90,12,32,.70) 38%, rgba(40,16,36,.52) 68%, rgba(40,16,36,0) 92%)",
    "radial-gradient(1100px 560px at 12% 10%, rgba(215,38,61,.28), rgba(215,38,61,0) 60%)",
  ].join(",");

  return (
    <section
      aria-label="Wprowadzenie – prezenty"
      className="relative isolate overflow-hidden rounded-3xl shadow-lg mt-3 mb-10 min-h-[360px] md:min-h-[440px] h-[50svh] md:h-[54svh] lg:h-[58svh] text-white"
    >
      {/* Z:1 — tło (mobile → mobileUrl, desktop → imageUrl) */}
      <div className="absolute inset-0 z-[1]">
        <picture>
          <source media="(max-width: 640px)" srcSet={imageMobile} />
          <img
            src={imageBackdrop}
            alt="Prezenty w tle"
            className="w-full h-full object-cover opacity-35"
            loading="eager"
            fetchpriority="high"
            decoding="async"
          />
        </picture>
      </div>

      {/* Z:2 — tint (light) */}
      <div
        className="pointer-events-none absolute inset-0 z-[2] dark:hidden mix-blend-multiply opacity-75"
        style={{
          background:
            "linear-gradient(135deg, rgba(255,180,80,0.9) 0%, rgba(255,120,86,0.75) 55%, rgba(215,38,61,0.55) 100%)",
        }}
      />

      {/* Z:3 — mgiełka */}
      <div className="pointer-events-none absolute inset-0 z-[3] bg-black/16 dark:bg-black/30 backdrop-blur-[1.5px]" />

      {/* Z:4 — gradient warstwowy */}
      <div
        className="pointer-events-none absolute inset-0 z-[4] dark:hidden"
        style={{
          backgroundImage: lightLayer,
          backgroundRepeat: "no-repeat,no-repeat,no-repeat",
          backgroundSize: "cover,cover,cover",
          backgroundPosition: "center,center,center",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 z-[4] hidden dark:block"
        style={{
          backgroundImage: darkLayer,
          backgroundRepeat: "no-repeat,no-repeat",
          backgroundSize: "cover,cover",
          backgroundPosition: "center,center",
        }}
      />

      {/* Z:5 — treść */}
      <div className="relative z-[5] h-full grid lg:grid-cols-2 items-center gap-6 lg:gap-10 p-6 sm:p-8 md:p-10">
        <div className="drop-shadow-[0_2px_8px_rgba(0,0,0,.35)]">
          <h1 className="text-mainRed dark:text-mainRed font-extrabold leading-tight tracking-[-0.02em] text-[clamp(26px,5.2vw,52px)] sm:text-[clamp(30px,5vw,60px)]">
            {title}
          </h1>
          <p className="mt-3 max-w-prose text-[15px] sm:text-base md:text-lg text-white/95">
            {subtitle}
          </p>

          {/* CHIPS z kategorii */}
          <div className="mt-4 flex flex-wrap gap-2">
            {chips.map(({ to, label }) => (
              <Link
                key={`${label}-${to}`}
                to={to}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/90 text-mainRed font-semibold ring-1 ring-white/70 hover:bg-white dark:bg-white/15 dark:text-gold dark:ring-mainRed/40 dark:hover:bg-mainRed/25"
              >
                {label}
              </Link>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to={cta1.to}
              className="px-5 py-3 rounded-2xl bg-gold text-mainRed font-bold shadow-[0_6px_28px_rgba(255,215,0,.25),0_2px_10px_rgba(255,215,0,.18)] hover:brightness-110 transition dark:!text-mainRed"
            >
              {cta1.label}
            </Link>
            <Link
              to={cta2.to}
              className="px-5 py-3 rounded-2xl border-2 border-white/90 text-white font-bold hover:bg-white/10 transition dark:!border-mainRed dark:!text-gold dark:hover:bg-mainRed/15"
            >
              {cta2.label}
            </Link>
          </div>
        </div>

        <div className="hidden lg:block">
          <div className="relative rounded-3xl overflow-hidden shadow-2xl ring-1 ring-white/25 dark:ring-mainRed/30">
            <img
              src={imageCard}
              alt="Uśmiechnięci ludzie z prezentami"
              className="w-full h-[38svh] object-cover"
              loading="lazy"
              decoding="async"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-white/10 via-transparent to-white/10" />
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute -bottom-24 -right-24 z-[4] size-[200px] rounded-full bg-white/12 blur-3xl hidden sm:block" />
    </section>
  );
}
