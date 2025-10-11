import SeoHead from "../../components/SeoHead";

export default function PolitykaPrywatnosciPage() {
  const updated = new Date().toISOString().slice(0, 10);

  const SITE_URL = (
    import.meta.env?.VITE_SITE_URL ||
    (typeof window !== "undefined" ? window.location.origin : "")
  ).replace(/\/+$/, "");
  const canonical = `${SITE_URL}/polityka-prywatnosci`;

  const webPageJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Polityka prywatności",
    url: canonical,
  };

  const breadcrumbsJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Strona główna", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Polityka prywatności", item: canonical },
    ],
  };

  return (
    <div className="max-w-3xl mx-auto py-10 px-4">
      <SeoHead
        title="Polityka prywatności – Gift Store"
        description="Polityka prywatności i zasady przetwarzania danych w Gift Store."
        canonical={canonical}
        type="webpage"
        jsonLd={[webPageJsonLd, breadcrumbsJsonLd]}
      />

      <h1 className="text-3xl font-bold">Polityka prywatności</h1>
      <p className="mt-2 text-sm text-neutral-500">
        Ostatnia aktualizacja: {updated}
      </p>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold">Administrator danych</h2>
        <p>
          Administratorem danych jest Gift Store Sp. z o.o., ul. Prezentowa 7, 00-000
          Warszawa, e-mail:{" "}
          <a className="underline" href="mailto:iod@giftstore.pl">
            iod@giftstore.pl
          </a>
          .
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold">Cele i podstawy przetwarzania</h2>
        <ul className="list-disc ml-6 space-y-1">
          <li>Realizacja zamówień i obsługa klienta (art. 6 ust. 1 lit. b RODO).</li>
          <li>Rozliczenia i obowiązki podatkowe (art. 6 ust. 1 lit. c RODO).</li>
          <li>Marketing własnych produktów (art. 6 ust. 1 lit. f lub a RODO).</li>
          <li>Analiza i statystyka – poprawa działania serwisu (art. 6 ust. 1 lit. f RODO).</li>
        </ul>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold">Kategorie danych</h2>
        <p>
          Dane identyfikacyjne, kontaktowe, adresowe, historia zamówień, płatności, dane
          techniczne (logi, cookies).
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold">Odbiorcy danych</h2>
        <p>
          Podmioty realizujące płatności, dostawy, hosting, analitykę oraz wsparcie IT –
          wyłącznie na podstawie umów powierzenia.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold">Okres przechowywania</h2>
        <p>
          Dane przechowujemy przez czas trwania umowy, a następnie zgodnie z przepisami
          dotyczącymi rachunkowości i przedawnienia roszczeń.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold">Prawa użytkownika</h2>
        <ul className="list-disc ml-6 space-y-1">
          <li>dostęp do danych,</li>
          <li>sprostowanie, usunięcie, ograniczenie przetwarzania,</li>
          <li>przenoszenie danych,</li>
          <li>sprzeciw wobec przetwarzania,</li>
          <li>cofnięcie zgody (jeśli przetwarzanie odbywa się na podstawie zgody),</li>
          <li>skarga do Prezesa UODO.</li>
        </ul>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold">Pliki cookies</h2>
        <p>
          Wykorzystujemy cookies w celach funkcjonalnych, statystycznych i
          marketingowych. Ustawieniami cookies możesz zarządzać w swojej przeglądarce.
        </p>
      </section>
    </div>
  );
}
