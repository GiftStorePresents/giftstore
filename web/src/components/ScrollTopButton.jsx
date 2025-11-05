import { useEffect, useState } from "react";
import { ChevronUp } from "lucide-react";

/** Znajdź realny scroll-root (document, ewentualnie dedykowany kontener) */
function getScrollRoot() {
  if (typeof document === "undefined") return null;

  // 1) standard – działa w Chrome/Edge/Firefox
  const std = document.scrollingElement || document.documentElement || document.body;
  if (std) return std;

  // 2) awaryjnie spróbuj main, jeśli naprawdę byłby kontenerem scrolla
  const main = document.getElementById("main");
  return main || null;
}

function smoothTop() {
  const root = getScrollRoot();
  if (!root) return;

  // zawsze przewijamy scroll-root (NIE <main>)
  if (typeof root.scrollTo === "function") {
    root.scrollTo({ top: 0, behavior: "smooth" });
  } else if (typeof window !== "undefined" && typeof window.scrollTo === "function") {
    window.scrollTo({ top: 0, behavior: "smooth" });
  } else {
    // najprostszy fallback
    root.scrollTop = 0;
  }
}

export default function ScrollTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // pilnuj, by sentinel był w DOM (dodałeś go na górze <main>)
    const sentinel = document.getElementById("scroll-sentinel");
    if (!sentinel) return;

    const io = new IntersectionObserver(
      (entries) => setVisible(!entries[0].isIntersecting),
      { threshold: 0 }
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, []);

  if (!visible) return null;
  return (
    <button
      type="button"
      onClick={smoothTop}
      aria-label="Wróć na górę"
      title="Wróć na górę"
      className="
        fixed left-5 bottom-24 z-[2147483000]
        grid place-items-center w-12 h-12 rounded-full
        bg-gradient-to-b from-[#FFD700] to-[#E6B800]
        text-[#D7263D]
        shadow-[0_0_25px_rgba(255,215,0,0.35)]
        border border-[#ffffff33]
        backdrop-blur-sm
        transition-all duration-300
        hover:scale-110 hover:shadow-[0_0_35px_rgba(255,215,0,0.55)]
        active:scale-95
        dark:from-[#D7263D] dark:to-[#9c1628]
        dark:text-[#FFD700]
        dark:shadow-[0_0_25px_rgba(215,38,61,0.35)]
        dark:hover:shadow-[0_0_35px_rgba(215,38,61,0.55)]
        animate-fadeIn
      "
    >
      <ChevronUp size={22} strokeWidth={2.5} />
      <span className="sr-only">Do góry</span>
    </button>
  );
}
