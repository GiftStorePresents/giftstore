import { useState } from "react";
import SeoHead from "../../components/SeoHead";

const QA = [
  {
    q: "Jaki jest czas realizacji zamówienia?",
    a: "Najczęściej 24–48h + czas dostawy przewoźnika. Dokładny czas podajemy w koszyku.",
  },
  {
    q: "Jakie metody płatności są dostępne?",
    a: "Szybkie płatności, karta, BLIK, przelew tradycyjny; pobranie na wybranych produktach.",
  },
  {
    q: "Czy mogę zwrócić produkt?",
    a: "Tak, masz 14 dni na odstąpienie od umowy (szczegóły w Regulaminie).",
  },
  {
    q: "Jak śledzić przesyłkę?",
    a: "Po wysyłce dostaniesz link do śledzenia od przewoźnika oraz podgląd w panelu zamówień.",
  },
  {
    q: "Jak skontaktować się z obsługą?",
    a: 'Napisz na <a href="mailto:support@giftstore.pl">support@giftstore.pl</a> lub zadzwoń +48 123 456 789 (pn–pt 9:00–17:00).',
  },
];

function FaqItem({ q, a, i }) {
  const [open, setOpen] = useState(i === 0);
  return (
    <div className="border border-yellow-200 dark:border-yellow-500/30 rounded-xl bg-white/70 dark:bg-neutral-900/60 backdrop-blur">
      <button
        onClick={() => setOpen(!open)}
        className="w-full text-left px-4 py-3 font-medium flex justify-between items-center"
      >
        <span>{q}</span>
        <span className="text-xl">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div
          className="px-4 pb-4 text-sm text-neutral-700 dark:text-neutral-200"
          // odpowiedzi jako prosty HTML/tekst (bez skryptów)
          dangerouslySetInnerHTML={{ __html: a }}
        />
      )}
    </div>
  );
}

export default function FAQPage() {
  const SITE_URL = (
    import.meta.env?.VITE_SITE_URL ||
    (typeof window !== "undefined" ? window.location.origin : "")
  ).replace(/\/+$/, "");
  const canonical = `${SITE_URL}/faq`;

  // JSON-LD dla FAQPage i BreadcrumbList
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    ...(Array.isArray(QA) && QA.length
      ? {
          mainEntity: QA.map((it) => ({
            "@type": "Question",
            name: it.q,
            acceptedAnswer: { "@type": "Answer", text: it.a },
          })),
        }
      : {}),
  };

  const breadcrumbsJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Strona główna", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "FAQ", item: canonical },
    ],
  };

  return (
    <div className="max-w-3xl mx-auto py-10 px-4">
      <SeoHead
        title="FAQ – najczęstsze pytania"
        description="Odpowiedzi na najczęstsze pytania klientów Gift Store."
        canonical={canonical}
        type="webpage"
        jsonLd={[faqJsonLd, breadcrumbsJsonLd]}
      />

      <h1 className="text-3xl font-bold">FAQ</h1>
      <p className="mt-2 text-sm text-neutral-500">
        Szybkie odpowiedzi na najczęstsze pytania.
      </p>

      <div className="mt-8 space-y-3">
        {QA.map((item, i) => (
          <FaqItem key={i} q={item.q} a={item.a} i={i} />
        ))}
      </div>

      <div className="mt-10 text-sm">
        Nie znalazłeś odpowiedzi? Napisz do nas:{" "}
        <a className="underline" href="mailto:support@giftstore.pl">
          support@giftstore.pl
        </a>
      </div>
    </div>
  );
}
