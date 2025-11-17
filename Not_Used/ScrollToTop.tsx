import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export default function ScrollToTop() {
  const { pathname, search } = useLocation();

  useEffect(() => {
    if ("scrollRestoration" in window.history) {
      try {
        window.history.scrollRestoration = "manual";
      } catch {}
    }

    const scrollTop = () => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      const main = document.getElementById("main");
      if (main) main.scrollTo?.({ top: 0, left: 0, behavior: "auto" });
    };

    // przewiń natychmiast
    scrollTop();

    // przewiń ponownie po renderze Suspense (np. 200ms później)
    const t1 = setTimeout(scrollTop, 200);
    const t2 = setTimeout(scrollTop, 600);

    // dodatkowy tick dla heavy layoutów (np. Polityka Prywatności z dużym tekstem)
    const t3 = setTimeout(scrollTop, 1000);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [pathname, search]);

  return null;
}
