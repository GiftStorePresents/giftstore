import { useState, useEffect, useRef } from "react";
import { BsStars } from "react-icons/bs";

// Timingi (ms)
const FIRST_DELAY = 15000;   // 15s – pierwsze pojawienie
const IDLE_DELAY  = 120000;  // 2 min – kolejne cykle bezczynności
const SHOW_MS     = 8000;    // 8s – widoczny tooltip
const FADE_MS     = 4000;    // 4s – wolne zanikanie

// Rotacja komunikatów (co cykl)
const TEXTS = [
  "✨ Nie wiesz co wybrać? Zapytaj Doradcę!",
  "🎁 Pokażę hity dla Twojego budżetu",
  "💡 Szukasz dla niej lub dla niego? Pomogę!",
];

// Typewriter z obsługą emoji/kodopunktów (bez "undefined")
function useTypewriter(text, delay = 38, active = false) {
  const [output, setOutput] = useState("");

  useEffect(() => {
    if (!active) return;                 // zachowaj ostatni output podczas fadeOut
    const chars = Array.from(text);      // <— klucz: emoji jako pojedyncze znaki
    setOutput("");
    let i = 0;
    const id = setInterval(() => {
      const ch = chars[i];
      if (ch !== undefined) {
        setOutput((prev) => prev + ch);
        i += 1;
      } else {
        clearInterval(id);
      }
    }, delay);
    return () => clearInterval(id);
  }, [text, delay, active]);

  return output || "";                   // nigdy nie zwracaj undefined
}

export default function MagicFab({ onClick, cartCount = 0 }) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);
  const [cycle, setCycle] = useState(0);

  const cycleTimeout = useRef(null);
  const visibleTimeout = useRef(null);
  const fadeTimeout = useRef(null);

  const text = TEXTS[cycle % TEXTS.length];
  // aktywny także przy fadeOut, żeby tekst nie znikał podczas zanikania
  const typed = useTypewriter(text, 28, showTooltip);

  function clearTimers() {
    clearTimeout(cycleTimeout.current);
    clearTimeout(visibleTimeout.current);
    clearTimeout(fadeTimeout.current);
  }
  function hardReset() {
    clearTimers();
    setShowTooltip(false);
    setFadeOut(false);
  }

  useEffect(() => {
    if (cartCount > 0) { hardReset(); return; }

    const delay = cycle === 0 ? FIRST_DELAY : IDLE_DELAY;

    cycleTimeout.current = setTimeout(() => {
      setShowTooltip(true);
      setFadeOut(false);

      // po 8s – fadeOut przez 4s, potem zdejmij tooltip z DOM
      visibleTimeout.current = setTimeout(() => {
        setFadeOut(true);
        fadeTimeout.current = setTimeout(() => {
          setShowTooltip(false);
          setFadeOut(false);
          setCycle(c => c + 1);
        }, FADE_MS);
      }, SHOW_MS);
    }, delay);

    const onActivity = () => {
      if (cycle > 0) hardReset();
    };
    window.addEventListener("mousemove", onActivity);
    window.addEventListener("click", onActivity);
    window.addEventListener("keydown", onActivity);

    return () => {
      clearTimers();
      window.removeEventListener("mousemove", onActivity);
      window.removeEventListener("click", onActivity);
      window.removeEventListener("keydown", onActivity);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycle, cartCount]);

  const shouldRenderTooltip = (showTooltip || fadeOut) && (typed.length > 0 || fadeOut);

  return (
    <div className="fixed bottom-7 right-7 z-50 flex flex-col items-end select-none" style={{ minWidth: 220 }}>
      <div className="relative flex flex-col items-end">
        {/* Tooltip: render tylko gdy mamy tekst lub trwa fadeOut */}
        {shouldRenderTooltip && (
          <div
            className={`
              mb-3 px-5 py-2 rounded-xl border-2 font-bold shadow-lg text-base
              ${fadeOut ? "opacity-0 pointer-events-none" : "opacity-100"}
            `}
            style={{
              background: "rgba(255,255,255,0.95)",
              borderColor: "#FFD700",
              color: "#D7263D",
              boxShadow: "0 4px 24px 0 #FFD70033, 0 1.5px 8px 0 #FFD70011",
              letterSpacing: "0.01em",
              minWidth: 190,
              transition: `opacity ${FADE_MS}ms ease`,
            }}
            aria-live="polite"
          >
            {typed}
          </div>
        )}

        <div className="relative flex items-end">
          {/* Ring */}
          <span
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
            w-20 h-20 rounded-full border border-gold opacity-60 pointer-events-none"
            style={{ zIndex: 0 }}
          />
          {/* Gwiazdki */}
          <span className="absolute left-1 top-2 w-3 h-3 bg-gold rounded-full opacity-30 blur-sm animate-sparkle pointer-events-none z-10" />
          <span className="absolute right-3 bottom-5 w-2 h-2 bg-gold rounded-full opacity-50 blur-[2px] animate-sparkle pointer-events-none delay-700 z-10" />

          {/* Przycisk */}
          <button
            onClick={onClick}
            className="
              pointer-events-auto bg-gradient-to-tr from-[#f8fafd] via-[#fff4fa] to-[#fdfde8]
              text-mainRed shadow-xl rounded-full p-4 border-0
              flex items-center justify-center transition-all duration-300 
              hover:scale-110 hover:shadow-gold relative z-10
            "
            style={{ fontSize: 28 }}
            aria-label="Otwórz doradcę prezentów"
          >
            <BsStars className="text-gold animate-sparkle-flash drop-shadow" style={{ fontSize: 29 }} />
            <span className="absolute -bottom-1 -right-1 w-7 h-7 bg-gold opacity-30 blur-2xl rounded-full pointer-events-none animate-pulse"></span>
          </button>
        </div>
      </div>
    </div>
  );
}
