import React from "react";
import { useTheme } from "../context/ThemeContext";

export default function ThemeSwitch() {
  const { theme, toggleWithFX } = useTheme();

  const label = theme === "dark" ? "Light" : "Dark";
  const icon = theme === "dark" ? "🌞" : "🌙";

  return (
    <button
      type="button"
      onClick={(e) => toggleWithFX(e)}
      className={`fixed bottom-4 left-4 z-50 rounded-2xl px-3 py-2 shadow-lg border backdrop-blur hover:scale-[1.02] transition
        ${theme === "light" ? "bg-white/80 text-black" : "bg-neutral-800/80 text-white"}`}
      aria-label="Toggle color theme"
      title="Zmień motyw"
    >
      <span className="mr-1">{icon}</span>
      {label}
    </button>
  );
}
