/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],

  safelist: [
    // LIGHT / DARK premium tła
    "bg-gift-wrap",
    "bg-gift-rose",
    "bg-gift-romance",
    "bg-aurora-dark",

    // Twoje wcześniejsze warianty
    "bg-fashion-photo",
    "bg-fashion-pearl",
    "bg-fashion-paper",
    "bg-fashion-glass",
    "bg-fashion-cotton",
    "bg-fashion-atelier",
    "bg-fashion-linen",
    "bg-fashion-marble",
    "bg-fashion-rose",
    "bg-fashion-minimal",
    "bg-fashion-aurora",
    "bg-fashion-noir",

    // helpers / components
    "bg-mesh",
    "bg-fashion-center",
    "btn-search",
    "btn-search-sm",
    "chip-coupon",
    "btn-cta-gold",
  ],

  // >>> PROGI I CONTAINER (drop-in)
  theme: {
    screens: {
      xs: "360px",
      sm: "640px",
      md: "768px",
      lg: "1024px",
      xl: "1280px",
      "2xl": "1536px",
    },
    container: {
      center: true,
      padding: { DEFAULT: "1rem", sm: "1rem", md: "1.25rem", lg: "1.5rem" },
      // maksymalna szerokość głównej kolumny treści
      screens: { lg: "1000px", xl: "1160px", "2xl": "1280px" },
    },

    extend: {
      colors: {
        mainRed: "#D7263D",
        gold: "#FFD700",
        bgLight: "#FFF8F0",
        bgUltraLight: "#F7F7FB",
        graySoft: "#EDEDF4",
        emerald: {
          50: "#ECFDF5",
          100: "#D1FAE5",
          200: "#A7F3D0",
          300: "#6EE7B7",
          700: "#047857",
          800: "#065F46",
        },
      },

      /* --- istniejące tła (zostawione bez zmian) --- */
      backgroundImage: {
        "fashion-photo":
          "url('https://images.unsplash.com/photo-1504208434309-cb69f4fe52b0?q=80&w=1920&auto=format&fit=crop')," +
          "radial-gradient(1200px 600px at 12% 10%, rgba(255,182,193,0.40), transparent 60%)," +
          "radial-gradient(900px 520px at 86% 16%, rgba(255,214,102,0.35), transparent 60%)," +
          "linear-gradient(120deg, rgba(255,254,250,0.92) 0%, rgba(255,247,252,0.88) 55%, rgba(249,251,255,0.92) 100%)," +
          "url('https://www.transparenttextures.com/patterns/noise.png')",

        "fashion-pearl":
          "radial-gradient(900px 520px at 12% 8%, rgba(255,229,236,0.85), transparent 60%)," +
          "radial-gradient(700px 480px at 88% 18%, rgba(255,245,220,0.90), transparent 62%)," +
          "radial-gradient(800px 520px at 18% 92%, rgba(226,244,255,0.90), transparent 60%)," +
          "linear-gradient(120deg, #fffdf9 0%, #fff7fb 55%, #f9fbff 100%)," +
          "url('https://www.transparenttextures.com/patterns/noise.png')",

        "fashion-paper":
          "linear-gradient(120deg, #fffdf8 0%, #fff7ef 100%)," +
          "url('https://www.transparenttextures.com/patterns/paper.png')",

        "fashion-glass":
          "radial-gradient(1200px 700px at 15% 5%, rgba(255,255,255,0.90), rgba(255,255,255,0.60) 60%, transparent 70%)," +
          "linear-gradient(120deg, #fffaf1 0%, #fff5fb 55%, #f5fbff 100%)," +
          "url('https://www.transparenttextures.com/patterns/noise.png')",

        "fashion-cotton":
          "url('https://images.unsplash.com/photo-1514989940723-e8e51635b782?q=80&w=1920&auto=format&fit=crop')," +
          "radial-gradient(1200px 640px at 14% 12%, rgba(255,182,193,0.40), transparent 62%)," +
          "radial-gradient(900px 520px at 86% 22%, rgba(255,214,102,0.32), transparent 62%)," +
          "linear-gradient(120deg, rgba(255,254,250,0.92) 0%, rgba(255,247,252,0.88) 55%, rgba(249,251,255,0.92) 100%)," +
          "url('https://www.transparenttextures.com/patterns/noise.png')",

        "fashion-atelier":
          "radial-gradient(1400px 700px at 12% 10%, rgba(255,221,238,0.55), transparent 60%)," +
          "radial-gradient(1200px 600px at 88% 18%, rgba(255,240,210,0.60), transparent 60%)," +
          "linear-gradient(120deg, #fffdf7 0%, #fff6fb 52%, #f7fbff 100%)," +
          "url('https://www.transparenttextures.com/patterns/noise.png')",

        "fashion-linen":
          "linear-gradient(120deg, #fffdf8 0%, #fff8f1 50%, #f8fbff 100%)," +
          "url('https://www.transparenttextures.com/patterns/linen.png')",

        "fashion-marble":
          "url('https://images.unsplash.com/photo-1523419409543-9e4c0d6f3b1c?q=80&w=1920&auto=format&fit=crop')," +
          "linear-gradient(120deg, rgba(255,255,255,0.86) 0%, rgba(255,253,250,0.90) 50%, rgba(255,255,255,0.86) 100%)," +
          "url('https://www.transparenttextures.com/patterns/noise.png')",

        "fashion-rose":
          "radial-gradient(1200px 680px at 18% 10%, rgba(255,210,224,0.55), transparent 62%)," +
          "radial-gradient(1100px 640px at 80% 18%, rgba(255,231,188,0.45), transparent 62%)," +
          "linear-gradient(120deg, #fffaf6 0%, #fff1f7 50%, #f6fbff 100%)," +
          "url('https://www.transparenttextures.com/patterns/noise.png')",

        "fashion-minimal":
          "linear-gradient(120deg, #ffffff 0%, #fff9f3 50%, #fbfdff 100%)," +
          "url('https://www.transparenttextures.com/patterns/noise.png')",

        "fashion-aurora":
          "radial-gradient(900px 520px at 78% 14%, rgba(255,214,102,0.18), transparent 60%)," +
          "radial-gradient(760px 460px at 18% 86%, rgba(124,215,255,0.16), transparent 62%)," +
          "radial-gradient(680px 420px at 40% 20%, rgba(184,140,255,0.16), transparent 62%)," +
          "linear-gradient(120deg, #121829 0%, #1d2439 55%, #1e1631 100%)," +
          "url('https://www.transparenttextures.com/patterns/asfalt-dark.png')",

        "fashion-noir":
          "radial-gradient(1200px 600px at 85% 12%, rgba(255,214,102,0.10), transparent 60%)," +
          "radial-gradient(900px 500px at 12% 88%, rgba(157,124,255,0.14), transparent 60%)," +
          "linear-gradient(120deg, #0f1424 0%, #1a1530 55%, #20152d 100%)," +
          "url('https://www.transparenttextures.com/patterns/asfalt-dark.png')",
      },

      backgroundSize: {
        mesh: "cover, auto, auto, auto, 200px 200px",
      },
      backgroundPosition: {
        "fashion-center": "center, center, center, center, center",
      },

      boxShadow: {
        gold: "0 4px 20px 0 rgba(255,215,0,0.14), 0 1.5px 8px 0 rgba(255,215,0,0.14)",
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
          "50%": { transform: "scale(1.13)", boxShadow: "0 0 24px 12px #FFD70033" },
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
    require("@tailwindcss/forms")({ strategy: "class" }),
    require("@tailwindcss/typography"),

    // ---------- PREMIUM BACKGROUNDS JAKO KOMPONENTY ----------
    // 1) LIGHT premium (bg-gift-wrap) + DARK (bg-aurora-dark)
    function ({ addComponents }) {
      /* LIGHT */
      const wrapStripes =
        "repeating-linear-gradient(-35deg, rgba(255,255,255,0.0) 0, rgba(255,255,255,0.0) 22px, rgba(255,255,255,0.22) 22px, rgba(255,255,255,0.22) 38px)";
      const foilStreaks =
        "url(\"data:image/svg+xml,%3Csvg width='1400' height='900' viewBox='0 0 1400 900' xmlns='http://www.w3.org/2000/svg'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%23FFE7A6' stop-opacity='.55'/%3E%3Cstop offset='.55' stop-color='%23FFD166' stop-opacity='.22'/%3E%3Cstop offset='1' stop-color='white' stop-opacity='0'/%3E%3C/linearGradient%3E%3Cfilter id='blur'%3E%3CfeGaussianBlur stdDeviation='14'/%3E%3C/filter%3E%3C/defs%3E%3Cpath d='M-80 200 C 200 120, 380 320, 820 280 S 1320 100, 1560 260 L 1560 0 L -80 0 Z' fill='url(%23g)' filter='url(%23blur)'/%3E%3Cpath d='M-120 880 C 220 740, 520 820, 900 760 S 1340 680, 1600 760 L 1600 940 L -120 940 Z' fill='url(%23g)' filter='url(%23blur)'/%3E%3C/svg%3E\")";
      const confetti =
        "url(\"data:image/svg+xml,%3Csvg width='260' height='260' viewBox='0 0 260 260' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' stroke-linecap='round' stroke-width='2'%3E%3Cpath d='M18 28 l6 6' stroke='%23FFD166' stroke-opacity='.45'/%3E%3Cpath d='M120 90 l-5 7' stroke='%23D7263D' stroke-opacity='.35'/%3E%3Cpath d='M200 40 l7 -4' stroke='%23C9B27A' stroke-opacity='.35'/%3E%3Ccircle cx='70' cy='200' r='2' fill='%23FFD166' fill-opacity='.6'/%3E%3Ccircle cx='210' cy='150' r='2' fill='%23D7263D' fill-opacity='.45'/%3E%3Ccircle cx='150' cy='230' r='1.6' fill='%23EADCC2' fill-opacity='.6'/%3E%3C/g%3E%3C/svg%3E\")";
      const paperNoise =
        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 160 160'%3E%3Cfilter id='n'%3E%3CfeTurbulence baseFrequency='0.72' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3CfeComponentTransfer%3E%3CfeFuncA type='table' tableValues='0 0 0 .05 .07 .06 0 0'/%3E%3C/feComponentTransfer%3E%3CfeGaussianBlur stdDeviation='0.25'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

      /* DARK */
      const nebulaPattern =
        "url('https://www.transparenttextures.com/patterns/noise.png')";
      const stripesDark =
        "repeating-linear-gradient(0deg, rgba(255,255,255,.03) 0, rgba(255,255,255,.03) 1px, transparent 1px, transparent 26px)";

      addComponents({
        ".bg-gift-wrap": {
          background:
            "linear-gradient(180deg,#fffaf4 0%,#fff5e9 42%,#fff1e2 100%)," +
            "radial-gradient(1200px 620px at 85% 10%, rgba(255,209,102,.25), transparent 60%)," +
            "radial-gradient(1000px 520px at 12% 88%, rgba(232,210,170,.22), transparent 64%)," +
            wrapStripes + "," +
            foilStreaks + "," +
            confetti + "," +
            paperNoise,
          backgroundBlendMode:
            "normal,screen,screen,soft-light,soft-light,overlay,multiply",
          backgroundSize:
            "cover,cover,cover,320px 320px,cover,260px 260px,160px 160px",
          backgroundRepeat:
            "no-repeat,no-repeat,no-repeat,repeat,no-repeat,repeat,repeat",
          backgroundPosition: "center top,85% 10%,12% 88%,center,center,center,center",
          color: "#1a1a1a",
        },

        ".bg-aurora-dark": {
          background:
            "radial-gradient(1200px 600px at 85% 15%, rgba(32,216,171,.22), transparent 60%)," +
            "radial-gradient(900px 520px at 12% 85%, rgba(122,162,255,.22), transparent 64%)," +
            "radial-gradient(700px 420px at 70% 75%, rgba(255,209,102,.16), transparent 68%)," +
            "linear-gradient(120deg, #0b1020 0%, #111a2e 45%, #1a1030 100%)," +
            nebulaPattern + "," +
            stripesDark,
          backgroundBlendMode: "screen,screen,screen,normal,multiply,soft-light",
          backgroundSize: "cover,cover,cover,cover,auto,auto",
          color: "#eaf1ff",
        },
      });
    },

    // 2) Pretty Rose Gift Background (NOWA bg-gift-rose)
    function ({ addComponents }) {
      const wrapStripes =
        "repeating-linear-gradient(-36deg, rgba(255,255,255,0) 0, rgba(255,255,255,0) 22px, rgba(255,255,255,.22) 22px, rgba(255,255,255,.22) 38px)";
      const foilStreaks =
        "url(\"data:image/svg+xml,%3Csvg width='1400' height='900' viewBox='0 0 1400 900' xmlns='http://www.w3.org/2000/svg'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%23FFC4D6' stop-opacity='.70'/%3E%3Cstop offset='.55' stop-color='%23FFD1A6' stop-opacity='.28'/%3E%3Cstop offset='1' stop-color='white' stop-opacity='0'/%3E%3C/linearGradient%3E%3Cfilter id='b'%3E%3CfeGaussianBlur stdDeviation='14'/%3E%3C/filter%3E%3C/defs%3E%3Cpath d='M-80 220 C 220 120, 420 330, 860 290 S 1320 120, 1560 260 L 1560 0 L -80 0 Z' fill='url(%23g)' filter='url(%23b)'/%3E%3Cpath d='M-120 880 C 220 760, 560 820, 920 780 S 1340 700, 1600 780 L 1600 940 L -120 940 Z' fill='url(%23g)' filter='url(%23b)'/%3E%3C/svg%3E\")";
      const giftOrnaments =
        "url(\"data:image/svg+xml,%3Csvg width='260' height='260' viewBox='0 0 260 260' xmlns='http://www.w3.org/2000/svg'%3E%3Cg stroke-linecap='round' fill='none'%3E%3Cpath d='M24 26 q6 -10 18 0 q-12 10 -18 0 Z' stroke='%23E91E63' stroke-width='1.8'/%3E%3Cpath d='M190 60 q6 -10 18 0 q-12 10 -18 0 Z' stroke='%23FF8FAB' stroke-width='1.6'/%3E%3Ccircle cx='70' cy='200' r='2' fill='%23FFC4D6'/%3E%3Ccircle cx='210' cy='150' r='2' fill='%23FFB3C1'/%3E%3Cpath d='M120 120 l6 6' stroke='%23FFD1A6' stroke-width='2'/%3E%3C/g%3E%3C/svg%3E\")";
      const paperNoise =
        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 160 160'%3E%3Cfilter id='n'%3E%3CfeTurbulence baseFrequency='0.72' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3CfeComponentTransfer%3E%3CfeFuncA type='table' tableValues='0 0 0 .05 .07 .06 0 0'/%3E%3C/feComponentTransfer%3E%3CfeGaussianBlur stdDeviation='0.25'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

      addComponents({
        ".bg-gift-rose": {
          background:
            "linear-gradient(180deg, #FFF1F4 0%, #FFE3EA 40%, #FFD8E4 100%)," +
            "radial-gradient(1100px 600px at 82% 12%, rgba(255,140,170,.28), transparent 60%)," +
            "radial-gradient(900px 520px at 12% 88%, rgba(255,200,150,.22), transparent 64%)," +
            wrapStripes + "," +
            foilStreaks + "," +
            giftOrnaments + "," +
            paperNoise,
          backgroundBlendMode:
            "normal,screen,screen,soft-light,soft-light,overlay,multiply",
          backgroundSize:
            "cover,cover,cover,320px 320px,cover,260px 260px,160px 160px",
          backgroundRepeat:
            "no-repeat,no-repeat,no-repeat,repeat,no-repeat,repeat,repeat",
          backgroundPosition: "center top,82% 12%,12% 88%,center,center,center,center",
          color: "#1a1a1a",
        },
        ".dark .bg-gift-rose": { background: "none !important" },
      });
    },

    // 3) Romantic Gift Background (NOWA bg-gift-romance)
    function ({ addComponents }) {
      const shimmer =
        "url(\"data:image/svg+xml,%3Csvg width='1400' height='900' viewBox='0 0 1400 900' xmlns='http://www.w3.org/2000/svg'%3E%3Cdefs%3E%3ClinearGradient id='shine' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%23FFD6A5' stop-opacity='.45'/%3E%3Cstop offset='.55' stop-color='%23FFB5C2' stop-opacity='.25'/%3E%3Cstop offset='1' stop-color='white' stop-opacity='0'/%3E%3C/linearGradient%3E%3Cfilter id='blur'%3E%3CfeGaussianBlur stdDeviation='14'/%3E%3C/filter%3E%3C/defs%3E%3Cpath d='M-80 220 C 200 120, 420 340, 860 300 S 1320 120, 1560 260 L 1560 0 L -80 0 Z' fill='url(%23shine)' filter='url(%23blur)'/%3E%3Cpath d='M-120 880 C 220 740, 520 820, 900 760 S 1340 680, 1600 760 L 1600 940 L -120 940 Z' fill='url(%23shine)' filter='url(%23blur)'/%3E%3C/svg%3E\")";

      const confetti =
        "url(\"data:image/svg+xml,%3Csvg width='260' height='260' viewBox='0 0 260 260' xmlns='http://www.w3.org/2000/svg'%3E%3Cg stroke-linecap='round' fill='none'%3E%3Cpath d='M30 20 q6 -10 18 0 q-12 10 -18 0 Z' stroke='%23E91E63' stroke-width='1.8'/%3E%3Cpath d='M200 60 q6 -10 18 0 q-12 10 -18 0 Z' stroke='%23FF8FAB' stroke-width='1.6'/%3E%3Ccircle cx='70' cy='200' r='2' fill='%23FFD6A5'/%3E%3Ccircle cx='210' cy='150' r='2' fill='%23FFB3C1'/%3E%3C/g%3E%3C/svg%3E\")";

      const paperNoise =
        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 160 160'%3E%3Cfilter id='n'%3E%3CfeTurbulence baseFrequency='0.72' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3CfeComponentTransfer%3E%3CfeFuncA type='table' tableValues='0 0 0 .05 .07 .06 0 0'/%3E%3C/feComponentTransfer%3E%3CfeGaussianBlur stdDeviation='0.25'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

      addComponents({
        ".bg-gift-romance": {
          background:
            "linear-gradient(180deg, #FFF1F3 0%, #FFE8E0 35%, #FFD8C8 100%)," +
            "radial-gradient(1000px 600px at 80% 10%, rgba(255,130,150,.25), transparent 60%)," +
            "radial-gradient(900px 520px at 10% 90%, rgba(255,200,150,.22), transparent 64%)," +
            shimmer + "," +
            confetti + "," +
            paperNoise,
          backgroundBlendMode:
            "normal, screen, screen, soft-light, overlay, multiply",
          backgroundSize:
            "cover, cover, cover, 300px 300px, 260px 260px, 160px 160px",
          backgroundRepeat: "no-repeat, no-repeat, no-repeat, no-repeat, repeat, repeat",
          backgroundPosition: "center top, 80% 10%, 10% 90%, center, center, center",
          color: "#1a1a1a",
        },
        ".dark .bg-gift-romance": { background: "none !important" },
      });
    },

    // ---------- Twoje przyciski/komponenty ----------
    function ({ addComponents, theme }) {
      const mainRed = theme("colors.mainRed");
      const gold = theme("colors.gold");

      addComponents({
        ".btn-search": {
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "10px 16px",
          borderRadius: "12px",
          border: `1px solid ${gold}`,
          backgroundColor: gold,
          color: "#111",
          fontWeight: "700",
          lineHeight: "1",
          transition: "background-color .2s, color .2s, border-color .2s",
          boxShadow: "none",
          textShadow: "none",
        },
        ".btn-search:hover": {
          backgroundColor: mainRed,
          color: gold,
          borderColor: mainRed,
        },
        ".btn-search:focus-visible": {
          outline: "none",
          boxShadow: `0 0 0 2px ${gold}80`,
        },

        ".btn-search-sm": {
          padding: "6px 10px",
          borderRadius: "10px",
          fontSize: "0.875rem",
        },

        ".chip-coupon": {
          display: "inline-flex",
          alignItems: "center",
          gap: "8px",
          padding: "4px 8px",
          borderRadius: "9999px",
          backgroundColor: "#A7F3D0",
          border: "1px solid #6EE7B7",
          color: "#065F46",
          fontSize: "12px",
          lineHeight: "16px",
          fontWeight: 500,
          boxShadow: "none",
          textShadow: "none",
        },

        ".btn-cta-gold": {
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "10px 16px",
          borderRadius: "12px",
          backgroundColor: gold,
          color: mainRed,
          fontWeight: 700,
          transition: "background-color .2s, color .2s",
        },
        ".btn-cta-gold:hover": {
          backgroundColor: mainRed,
          color: gold,
        },
      });
    },
  ],
};