import { useEffect, useMemo, useState } from "react";

/**
 * LaunchCountdown
 *  - Domyślnie odlicza 30 dni od TERAZ (możesz podać targetDate).
 *  - Po zakończeniu pokazuje „Otwarte!” + CTA.
 *
 * Props:
 *  - targetDate?: Date | string | number
 *  - title?: string
 */
export default function LaunchCountdown({
  targetDate,
  title = "Otwarcie sklepu za",
}) {
  // 30 dni od teraz (domyślne)
  /*const defaultTarget = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);*/
  
  // 30 dni od teraz (domyślne)  ❌ usuń
  // const defaultTarget = useMemo(() => {
  //   const d = new Date();
  //   d.setDate(d.getDate() + 30);
  //   d.setHours(0, 0, 0, 0);
  //   return d;
  // }, []);

  // ✅ domyślnie: 01.01.2026 00:00 czasu lokalnego
  const defaultTarget = useMemo(() => {
    return new Date(2026, 0, 1, 0, 0, 0, 0);
  }, []);

  const target = useMemo(
    () => (targetDate ? new Date(targetDate) : defaultTarget),
    [targetDate, defaultTarget]
  );

  const getDiff = () => {
    const now = Date.now();
    const t = target.getTime();
    const delta = Math.max(0, t - now);

    const days = Math.floor(delta / (1000 * 60 * 60 * 24));
    const hours = Math.floor((delta / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((delta / (1000 * 60)) % 60);
    const seconds = Math.floor((delta / 1000) % 60);

    return { delta, days, hours, minutes, seconds };
  };

  const [time, setTime] = useState(getDiff());

  useEffect(() => {
    const id = setInterval(() => setTime(getDiff()), 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.getTime()]);

  const finished = time.delta === 0;

  return (
    <section
      aria-label="Licznik otwarcia sklepu"
      className="
        countdown-section
        relative isolate mx-auto w-full
        mt-6 md:mt-8
        rounded-3xl
        p-4 sm:p-5 md:p-6
        glass shadow-gold fade-in-glass
      "
    >
      {/* gradient tła (light/dark kontrolujemy w CSS) */}
      <div aria-hidden="true" className="countdown-bg" />

      {/* delikatny ring */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 rounded-3xl"
        style={{
          background:
            "linear-gradient(135deg, rgba(255, 238, 0, 0.28), rgba(255, 0, 34, 0.22))",
          mask:
            "linear-gradient(#000,#000) content-box, linear-gradient(#000,#000)",
          WebkitMask:
            "linear-gradient(#000,#000) content-box, linear-gradient(#000,#000)",
          padding: "1px",
        }}
      />

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight">
            {/* light: czerwony | dark: złoty */}
            <span className="text-mainRed dark:text-gold">{title}</span>
          </h2>
          <p className="text-muted mt-1">Złap najlepsze oferty na start! 🎁</p>
        </div>

        {!finished ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full md:w-auto">
            <TimeTile label="dni" value={time.days} />
            <TimeTile label="godz." value={time.hours} twoDigits />
            <TimeTile label="min" value={time.minutes} twoDigits />
            <TimeTile label="sek" value={time.seconds} twoDigits pulse />
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center rounded-2xl px-4 py-2 text-base md:text-lg font-bold bg-gold text-mainRed shadow-gold">
              Otwarte! ✨
            </span>
            <a
              href="/categories/nowosci"
              className="btn checkout-btn !font-bold !rounded-xl !px-4 !py-2"
            >
              Zobacz nowości
            </a>
          </div>
        )}
      </div>

      {/* progress (opcjonalny, od 0 do 100%) */}
      {!finished && <ProgressBar target={target} />}
    </section>
  );
}

function TimeTile({ label, value, twoDigits = false, pulse = false }) {
  const formatted = twoDigits ? String(value).padStart(2, "0") : String(value);
  return (
    <div className="countdown-tile">
      <div className={`countdown-value ${pulse ? "countdown-pulse" : ""}`}>
        {formatted}
      </div>
      <div className="countdown-label">{label}</div>
    </div>
  );
}

function ProgressBar({ target }) {
  const start = useMemo(() => {
    // start = 30 dni przed target
    const s = new Date(target);
    s.setDate(s.getDate() - 30);
    s.setHours(0, 0, 0, 0);
    return s;
  }, [target]);

  const [pct, setPct] = useState(() => pctFromNow(start, target));

  useEffect(() => {
    const id = setInterval(() => setPct(pctFromNow(start, target)), 1000);
    return () => clearInterval(id);
  }, [start, target]);

  return (
    <div className="mt-4">
      <div className="h-2 w-full rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
        <div
          className="h-full rounded-full bg-gold"
          style={{ width: `${pct}%`, transition: "width .6s ease" }}
          aria-hidden="true"
        />
      </div>
      <p className="sr-only">Postęp przygotowań: {Math.round(pct)}%</p>
    </div>
  );
}

function pctFromNow(start, end) {
  const now = Date.now();
  const a = start.getTime();
  const b = end.getTime();
  const t = Math.min(Math.max(now, a), b);
  return ((t - a) / (b - a)) * 100;
}
