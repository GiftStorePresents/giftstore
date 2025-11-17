import { useMemo } from "react";

/**
 * <PaymentPicker
 *   value={paymentMethod}                   // "card" | "blik" | "pbl_p24" | "payu" | "pbl_autopay" | "paypo" | "cod" | "crypto"
 *   onChange={(id) => setPaymentMethod(id)}
 *   disabledIds={[]}                        // opcjonalnie
 *   className=""                            // opcjonalnie
 *   compact                                 // opcjonalnie: krótsze etykiety, brak długich opisów
 * />
 */

const GROUPS = [{ id: "fast", title: "Wybierz metodę płatności" }];

const ALL_METHODS = [
  // szybkie przelewy / BLIK / karta
  {
    id: "pbl_p24",
    group: "fast",
    label: "Przelewy24",
    labelShort: "Przelewy24",
    sublabel: "Przelew natychmiastowy, BLIK, PayPo",
    sublabelShort: "Szybkie przelewy",
    logos: ["p24"],
  },
  {
    id: "payu",
    group: "fast",
    label: "PayU",
    labelShort: "PayU",
    sublabel: "Przelew natychmiastowy, BLIK, PayPo",
    sublabelShort: "Szybkie przelewy",
    logos: ["payu"],
  },
  {
    id: "pbl_autopay",
    group: "fast",
    label: "Autopay",
    labelShort: "Autopay",
    sublabel: "Płatności Shoper — wybierz bank",
    sublabelShort: "Wybierz bank",
    logos: ["autopay"],
  },
  {
    id: "blik",
    group: "fast",
    label: "BLIK",
    labelShort: "BLIK",
    sublabel: "Szybka płatność BLIK",
    sublabelShort: "Szybka płatność",
    logos: ["blik"],
  },
  {
    id: "card",
    group: "fast",
    label: "Karta (Visa/Mastercard)",
    labelShort: "Karta",
    sublabel: "Visa, Mastercard, Apple Pay, Google Pay",
    sublabelShort: "Visa, Mastercard",
    logos: ["visa", "mastercard", "applepay", "googlepay"],
    recommended: true,
  },

  // inne
  {
    id: "paypo",
    group: "fast",
    label: "PayPo",
    labelShort: "PayPo",
    sublabel: "Kup teraz, zapłać za 30 dni",
    sublabelShort: "Zapłać później",
    logos: ["paypo"],
  },
  {
    id: "cod",
    group: "fast",
    label: "Za pobraniem",
    labelShort: "Pobranie",
    sublabel: "+5 zł",
    sublabelShort: "+5 zł",
    logos: ["cod"],
  },
  {
    id: "crypto",
    group: "fast",
    label: "Kryptowaluty",
    labelShort: "Kryptowaluty",
    sublabel: "Coinbase / Zonda",
    sublabelShort: "Coinbase / Zonda",
    logos: ["coinbase", "zonda"],
  },
];

function Logo({ name }) {
  const base =
    "inline-flex items-center justify-center rounded-md px-2 h-6 text-[11px] font-semibold border bg-white whitespace-nowrap";
  const map = {
    visa: <span className={base}>VISA</span>,
    mastercard: (
      <span className={base}>
        <svg viewBox="0 0 48 24" className="h-3 w-6 mr-1" aria-hidden="true">
          <circle cx="18" cy="12" r="8" />
          <circle cx="30" cy="12" r="8" opacity="0.6" />
        </svg>
        Mastercard
      </span>
    ),
    applepay: <span className={base}> Pay</span>,
    googlepay: <span className={base}>G Pay</span>,
    p24: <span className={base}>Przelewy24</span>,
    payu: <span className={base}>PayU</span>,
    autopay: <span className={base}>Autopay</span>,
    blik: (
      <span className={base}>
        b<span className="inline-block w-1.5 h-1.5 rounded-full mx-0.5" style={{ background: "#e30613" }} />
        ik
      </span>
    ),
    paypo: <span className={base}>PayPo</span>,
    coinbase: <span className={base}>Coinbase</span>,
    zonda: <span className={base}>Zonda</span>,
    cod: <span className={base}>Pobranie</span>,
  };
  return map[name] || null;
}

function Badge({ children }) {
  return <span className="ml-2 rounded-full bg-amber-100 text-amber-800 text-[10px] px-2 py-0.5">{children}</span>;
}

function MethodRow({ method, checked, disabled, onChange, compact }) {
  const title = `${compact ? (method.labelShort || method.label) : method.label} — ${
    compact ? method.sublabelShort || method.sublabel || "" : method.sublabel || ""
  }`.trim();

  return (
    <label
      title={title}
      className={[
        "relative flex items-center gap-3 rounded-xl border bg-white p-3 sm:p-4 transition",
        checked ? "border-rose-400 ring-2 ring-rose-200" : "border-slate-200 hover:border-slate-300",
        disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
        "min-h-[72px]",
      ].join(" ")}
      aria-disabled={disabled || undefined}
    >
      <input
        type="radio"
        name="payment"
        className="peer h-4 w-4 shrink-0 accent-rose-500"
        checked={checked}
        onChange={() => !disabled && onChange(method.id)}
        disabled={disabled}
      />

      {/* logo pack (limit ikon w trybie compact) */}
      <div className="hidden sm:flex flex-wrap items-center gap-1.5 shrink-0">
        {(method.logos || [])
          .slice(0, compact ? 2 : 4)
          .map((n) => (
            <Logo key={n} name={n} />
          ))}
      </div>

      {/* text */}
      <div className="min-w-0">
        <div className="text-sm font-semibold text-slate-800 flex items-center">
          <span className="truncate max-w-[28ch] sm:max-w-[32ch]">
            {compact ? method.labelShort || method.label : method.label}
          </span>
          {method.recommended && <Badge>polecane</Badge>}
        </div>
        {((compact ? method.sublabelShort : method.sublabel) || "") && (
          <div className="text-xs text-slate-500 truncate max-w-[34ch]">
            {compact ? method.sublabelShort : method.sublabel}
          </div>
        )}
      </div>

      <span
        className={[
          "pointer-events-none absolute inset-0 rounded-xl",
          checked ? "ring-2 ring-rose-300" : "hover:ring-1 hover:ring-slate-300",
        ].join(" ")}
      />
    </label>
  );
}

export default function PaymentPicker({ value, onChange, disabledIds = [], className = "", compact = true }) {
  const grouped = useMemo(() => {
    const by = Object.fromEntries(GROUPS.map((g) => [g.id, []]));
    for (const m of ALL_METHODS) {
      if (!by[m.group]) by[m.group] = [];
      by[m.group].push(m);
    }
    return by;
  }, []);

  return (
    <div className={["space-y-4", className].join(" ")}>
      {GROUPS.map((g) => (
        <div key={g.id} className="overflow-hidden">
          <h4 className="mb-2 text-xs font-bold tracking-wide text-slate-600 uppercase">{g.title}</h4>

          {/* 1 kolumna na mobile, 2 na >=sm, 3 na >=lg dla większej szerokości */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {grouped[g.id].map((m) => (
              <MethodRow
                key={m.id}
                method={m}
                compact={compact}
                checked={value === m.id}
                disabled={disabledIds.includes(m.id)}
                onChange={onChange}
              />
            ))}
          </div>

          <p className="mt-3 text-[11px] text-slate-500">
            Wszystkie połączenia są szyfrowane. Nie zapisujemy danych kart na naszych serwerach.
          </p>
        </div>
      ))}
    </div>
  );
}
