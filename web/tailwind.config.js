/** @type {import('tailwindcss').Config} */
module.exports = {
  // Używamy klasy .dark na <html>
  darkMode: "class",

  // Gdzie Tailwind ma szukać klas
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],

  // Zapobiega wycięciu dynamicznych klas tła
  safelist: ["bg-mesh-gift", "bg-mesh-gift-dark", "bg-mesh-gift-dark-pretty"],

  theme: {
    extend: {
      colors: {
        mainRed: "#D7263D",
        gold: "#FFD700",
        bgLight: "#FFF8F0",
        bgUltraLight: "#F7F7FB",
        graySoft: "#EDEDF4",
      },

      backgroundImage: {
        // LIGHT
        "mesh-gift":
          "radial-gradient(circle at 5% 10%, #fffbe8 0%, #ffe9e3 50%, transparent 80%), " +
          "radial-gradient(ellipse at 80% 90%, #ffd70033 0%, #ffe9e344 70%, transparent 100%), " +
          "linear-gradient(120deg, #fffbe880 10%, #ffe9e380 100%), " +
          "url('https://www.transparenttextures.com/patterns/noise.png')",

        // DARK (starszy)
        "mesh-gift-dark":
          "radial-gradient(1200px 600px at 80% 10%, rgba(32,216,171,0.12), transparent 60%), " +
          "radial-gradient(800px 500px at 10% 85%, rgba(157,124,255,0.18), transparent 65%), " +
          "linear-gradient(120deg, #0b1020 0%, #1b0e24 100%), " +
          "url('https://www.transparenttextures.com/patterns/asfalt-dark.png')",

        // DARK — ładniejszy wariant (Aurora)
        "mesh-gift-dark-pretty":
          "radial-gradient(900px 500px at 82% 12%, rgba(255,214,102,0.18), transparent 60%), " +
          "radial-gradient(700px 420px at 8% 88%, rgba(157,124,255,0.20), transparent 65%), " +
          "linear-gradient(120deg, #1c2434 0%, #2b2342 55%, #30223a 100%), " +
          "url('https://www.transparenttextures.com/patterns/diamond-upholstery.png')",
      },

      boxShadow: {
        gold:
          "0 4px 20px 0 rgba(255,215,0,0.14), 0 1.5px 8px 0 rgba(255,215,0,0.14)",
      },

      keyframes: {
        toast: {
          "0%": { opacity: 0, transform: "translateY(-30px) scale(0.95)" },
          "100%": { opacity: 1, transform: "translateY(0) scale(1)" },
        },
        fadeIn: {
          "0%": { opacity: 0, transform: "translateY(18px)" },
          "100%": { opacity: 1, transform: "translateY(0)" },
        },
        "pulse-fancy": {
          "0%, 100%": { transform: "scale(1)", boxShadow: "0 0 0 0 #FFD70077" },
          "50%": {
            transform: "scale(1.13)",
            boxShadow: "0 0 24px 12px #FFD70033",
          },
        },
        wiggle: {
          "0%, 100%": { transform: "rotate(-10deg) scale(1.13)" },
          "15%": { transform: "rotate(6deg) scale(1.18)" },
          "35%": { transform: "rotate(-4deg) scale(1.15)" },
          "60%": { transform: "rotate(4deg) scale(1.14)" },
          "85%": { transform: "rotate(-6deg) scale(1.16)" },
        },
        sparkle: {
          "0%, 100%": { opacity: 0.6, transform: "scale(1) rotate(0deg)" },
          "50%": { opacity: 1, transform: "scale(1.15) rotate(10deg)" },
        },
        "sparkle-flash": {
          "0%,100%": { opacity: 0.7, transform: "rotate(0) scale(1)" },
          "30%": { opacity: 1, transform: "rotate(12deg) scale(1.18)" },
          "80%": { opacity: 0.7, transform: "rotate(-6deg) scale(0.96)" },
        },
        "sparkle-rotate": {
          "0%": { transform: "rotate(0deg) scale(1)" },
          "60%": { transform: "rotate(12deg) scale(1.15)" },
          "100%": { transform: "rotate(0deg) scale(1)" },
        },
      },

      animation: {
        toast: "toast 0.35s cubic-bezier(.36,1.2,.58,1) both",
        fadeIn: "fadeIn 0.33s cubic-bezier(.36,1.2,.58,1) both",
        "pulse-fancy": "pulse-fancy 1.7s infinite cubic-bezier(.4,0,.6,1)",
        wiggle: "wiggle 0.75s 1 cubic-bezier(.6,.2,.6,1)",
        sparkle: "sparkle 1.2s infinite",
        "sparkle-flash": "sparkle-flash 1.3s infinite cubic-bezier(.8,.2,.6,1)",
        "sparkle-rotate": "sparkle-rotate 1.3s infinite cubic-bezier(.77,.2,.6,1)",
      },

      transitionDuration: {
        4000: "4000ms",
        5000: "5000ms",
      },
    },
  },

  plugins: [
    // ⬇️ KLUCZOWE — plugin formularzy tylko po klasach `form-*`
    require("@tailwindcss/forms")({ strategy: "class" }),
    require("@tailwindcss/typography"),
  ],
};
