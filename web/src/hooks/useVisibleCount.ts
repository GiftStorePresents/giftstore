// src/hooks/useVisibleCount.js
import { useEffect, useState } from "react";

export function useVisibleCount() {
  const [width, setWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1280
  );

  useEffect(() => {
    const handleResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  if (width < 640) return 4;      // telefony
  if (width < 1024) return 6;     // tablety
  if (width < 1280) return 9;     // 💎 główny przypadek (3×3)
  return 12;                      // duże monitory
}
