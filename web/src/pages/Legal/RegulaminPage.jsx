import SeoHead from "../../components/SeoHead";

export default function RegulaminPage() {
  const updated = new Date().toISOString().slice(0, 10);

  const SITE_URL = (
    import.meta.env?.VITE_SITE_URL ||
    (typeof window !== "undefined" ? window.location.origin : "")
  ).replace(/\/+$/, "");
  const canonical = `${SITE_URL}/regulamin`;

  const webPageJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Regulamin",
    url: canonical,
  };

  const breadcrumbsJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Strona główna", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Regulamin", item: canonical },
    ],
  };

  return (
    <div className="max-w-3xl mx-auto py-10 px-4">
      <SeoHead
        title="Regulamin – Gift Store"
        description="Regulamin zakupów w sklepie Gift Store: zasady, płatności, dostawa, reklamacje i zwroty."
        canonical={canonical}
        type="webpage"
        jsonLd={[webPageJsonLd, breadcrumbsJsonLd]}
      />

      <h1 className="text-3xl font-bold">Regulamin sklepu Gift Store</h1>
      <p className="mt-2 text-sm text-neutral-500">Ostatnia aktualizacja: {updated}</p>

      {/* Spis treści */}
      <nav className="mt-6 p-4 rounded-xl bg-white/70 dark:bg-neutral-900/60 backdrop-blur">
        <ol className="list-decimal ml-6 space-y-1">
          <li><a className="hover:underline" href="#postanowienia-ogolne">Postanowienia ogólne</a></li>
          <li><a className="hover:underline" href="#oferta-i-ceny">Oferta i ceny</a></li>
          <li><a className="hover:underline" href="#zamowienia-i-platnosci">Zamówienia i płatności</a></li>
          <li><a className="hover:underline" href="#dostawa">Dostawa</a></li>
          <li><a className="hover:underline" href="#odstapienie">Odstąpienie od umowy</a></li>
          <li><a className="hover:underline" href="#reklamacje">Reklamacje</a></li>
          <li><a className="hover:underline" href="#dane-osobowe">Dane osobowe</a></li>
          <li><a className="hover:underline" href="#postanowienia-koncowe">Postanowienia końcowe</a></li>
        </ol>
      </nav>

      <section id="postanowienia-ogolne" className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold">1. Postanowienia ogólne</h2>
        <p>
          1.1. Właścicielem sklepu internetowego „Gift Store” jest <b>Gift Store Sp. z o.o.</b>
        </p>
        <p>
          1.2. Kontakt: <a className="underline" href="mailto:support@giftstore.pl">support@giftstore.pl</a>.
        </p>
        <p>
          1.3. Regulamin określa zasady korzystania ze sklepu, składania zamówień, realizacji dostaw,
          płatności oraz procedury reklamacyjne i zwroty.
        </p>
      </section>

      <section id="oferta-i-ceny" className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold">2. Oferta i ceny</h2>
        <p>2.1. Ceny prezentowane w sklepie zawierają podatek VAT i podawane są w PLN.</p>
        <p>
          2.2. Prezentowane zdjęcia produktów mają charakter poglądowy oraz promocyjny.
        </p>
      </section>

      <section id="zamowienia-i-platnosci" className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold">3. Zamówienia i płatności</h2>
        <p>3.1. Zamówienia można składać 24/7 poprzez stronę internetową sklepu.</p>
        <p>
          3.2. Dostępne metody płatności: szybkie płatności online, karta, BLIK, płatność kryptowalutami (np. Bitcoin, Ethereum), przelew tradycyjny,
          pobranie (jeśli dostępne).
        </p>
        <p>3.3. Potwierdzenie przyjęcia zamówienia wysyłamy e-mailem.</p>
      </section>

      <section id="dostawa" className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold">4. Dostawa</h2>
        <p>4.1. Dostawy realizujemy na terenie Polski poprzez współpracujących przewoźników.</p>
      </section>

      <section id="odstapienie" className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold">5. Odstąpienie od umowy</h2>
        <p>5.1. Konsument ma 14 dni na odstąpienie od umowy bez podania przyczyny.</p>
      </section>

      <section id="reklamacje" className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold">6. Reklamacje</h2>
        <p>
          6.1. Reklamacje należy zgłaszać na adres:{" "}
          <a className="underline" href="mailto:reklamacje@giftstore.pl">reklamacje@giftstore.pl</a>.
        </p>
        <p>6.2. Odpowiadamy w terminie 14 dni kalendarzowych.</p>
      </section>

      <section id="dane-osobowe" className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold">7. Dane osobowe</h2>
        <p>
          7.1. Administratorem danych jest Gift Store Sp. z o.o. Zasady przetwarzania opisuje{" "}
          <a className="underline" href="/polityka-prywatnosci">Polityka prywatności</a>.
        </p>
      </section>

      <section id="postanowienia-koncowe" className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold">8. Postanowienia końcowe</h2>
        <p>8.1. W sprawach nieuregulowanych zastosowanie mają przepisy prawa polskiego.</p>
        <p>8.2. Regulamin może ulegać zmianom; o zmianach informujemy z wyprzedzeniem na stronie.</p>
      </section>
    </div>
  );
}
