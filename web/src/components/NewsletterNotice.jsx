import React from "react";
import { X, CheckCircle, BellMinus } from "lucide-react";

export default function NewsletterNotice() {
  const [state, setState] = React.useState(null); // "confirmed" | "unsubscribed" | null
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const url = new URL(window.location.href);
    const val = url.searchParams.get("newsletter");
    if (val === "confirmed" || val === "unsubscribed") {
      setState(val);
      setVisible(true);
      // wyczyść query param z paska adresu (ładny URL)
      url.searchParams.delete("newsletter");
      window.history.replaceState({}, "", url.pathname + url.search + url.hash);

      // auto-hide po 7s
      const t = setTimeout(() => setVisible(false), 7000);
      return () => clearTimeout(t);
    }
  }, []);

  if (!visible || !state) return null;

  const isOk = state === "confirmed";

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-[1000] max-w-sm"
    >
      <div
        className={[
          "rounded-xl shadow-xl border px-4 py-3 pr-10 relative",
          "backdrop-blur-0", // bez szkła/przezroczystej ramki
          isOk
            ? "bg-white border-emerald-200"
            : "bg-white border-rose-200",
        ].join(" ")}
      >
        <button
          aria-label="Zamknij powiadomienie"
          onClick={() => setVisible(false)}
          className="absolute top-2.5 right-2.5 inline-flex items-center justify-center rounded-md hover:bg-black/5 transition p-1"
        >
          <X size={18} />
        </button>

        <div className="flex items-start gap-3">
          <div className={isOk ? "text-emerald-600 mt-0.5" : "text-rose-600 mt-0.5"}>
            {isOk ? <CheckCircle size={22} /> : <BellMinus size={22} />}
          </div>

          <div className="text-sm">
            {isOk ? (
              <>
                <p className="font-semibold text-gray-900">Dziękujemy za zapis! 🎉</p>
                <p className="text-gray-600 mt-0.5">
                  Subskrypcja została potwierdzona. Pierwsze inspiracje wpadną wkrótce do skrzynki.
                </p>
              </>
            ) : (
              <>
                <p className="font-semibold text-gray-900">Zostałeś wypisany.</p>
                <p className="text-gray-600 mt-0.5">
                  Nie będziemy już wysyłać wiadomości. Zawsze możesz zapisać się ponownie.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
