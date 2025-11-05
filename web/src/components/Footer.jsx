// src/components/Footer.jsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Facebook, Instagram, Twitter, Mail, Phone, MapPin } from "lucide-react";
import NewsletterForm from "./NewsletterForm";
import InstallPWAButton from "./InstallPWAButton";
import { API_BASE } from "../api";

export default function Footer() {
  const year = new Date().getFullYear();

  // iOS + brak trybu standalone → podpowiedź instalacji
  const isIOS =
    typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);
  const notStandalone =
    typeof window !== "undefined" &&
    !window.matchMedia("(display-mode: standalone)").matches;

  // ── NEW: sprawdzamy, czy użytkownik to ADMIN
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/auth/me`, {
          method: "GET",
          credentials: "include",
          headers: { "Accept": "application/json" },
        });
        if (!res.ok) return;
        const data = await res.json().catch(() => ({}));
        // Oczekiwany kształt: { authenticated: boolean, user: { role: "USER"|"ADMIN", ... } }
        if (alive && data?.authenticated && data?.user?.role === "ADMIN") {
          setIsAdmin(true);
        }
      } catch {
        // cicho ignorujemy
      }
    })();
    return () => { alive = false; };
  }, []);

  return (
    <footer className="relative mt-16 text-white">
      {/* Gradient tła */}
      <div
        className="absolute inset-0 bg-gradient-to-br from-rose-700 via-pink-600 to-red-600"
        aria-hidden
      />
      {/* Przyciemnienie + blur (nie blokuje kliknięć) */}
      <div
        className="absolute inset-0 bg-black/35 backdrop-blur-sm pointer-events-none"
        aria-hidden
      />

      {/* Zawartość */}
      <div className="relative z-10">
        <div className="container mx-auto px-6 lg:px-8 py-14">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 lg:gap-12">
            {/* Brand + Social + PWA */}
            <section aria-labelledby="footer-brand">
              <h3 id="footer-brand" className="text-2xl font-extrabold tracking-tight">
                🎁 Gift Store
              </h3>
              <p className="mt-4 text-sm/6 text-white/85">
                Wyjątkowe prezenty na każdą okazję — od drobiazgów po luksusowe upominki.
              </p>

              {/* Social */}
              <div className="mt-5 flex items-center gap-3" aria-label="Social media">
                <a
                  href="https://facebook.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex size-9 items-center justify-center rounded-full border border-yellow-300/70 text-white/95 hover:bg-yellow-300 hover:text-rose-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-yellow-300 focus-visible:ring-offset-transparent"
                  aria-label="Facebook"
                  title="Facebook"
                >
                  <Facebook size={18} />
                </a>

                <a
                  href="https://instagram.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex size-9 items-center justify-center rounded-full border border-yellow-300/70 text-white/95 hover:bg-yellow-300 hover:text-rose-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-yellow-300 focus-visible:ring-offset-transparent"
                  aria-label="Instagram"
                  title="Instagram"
                >
                  <Instagram size={18} />
                </a>

                <a
                  href="https://twitter.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex size-9 items-center justify-center rounded-full border border-yellow-300/70 text-white/95 hover:bg-yellow-300 hover:text-rose-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-yellow-300 focus-visible:ring-offset-transparent"
                  aria-label="Twitter"
                  title="Twitter/X"
                >
                  <Twitter size={18} />
                </a>
              </div>

              {/* PWA */}
              <div className="mt-6">
                <InstallPWAButton
                  variant="button"
                  label="Zainstaluj aplikację"
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl
                             border-[1.25px] border-yellow-300
                             text-yellow-50 hover:text-rose-800
                             hover:bg-yellow-300 font-semibold shadow-sm
                             transition-colors focus-visible:outline-none
                             focus-visible:ring-2 focus-visible:ring-yellow-300"
                />
                {isIOS && notStandalone && (
                  <p className="mt-2 text-xs text-yellow-100/90">
                    Na iOS zainstalujesz przez: <strong>Udostępnij</strong> →{" "}
                    <strong>Do ekranu początkowego</strong>.
                  </p>
                )}
              </div>
            </section>

            {/* Nawigacja */}
            <nav aria-labelledby="footer-nav" className="min-w-0">
              <h4 id="footer-nav" className="font-semibold text-lg mb-4">
                Nawigacja
              </h4>
              <ul className="space-y-2 text-sm/6">
                <li>
                  <Link
                    to="/"
                    className="text-white/95 hover:text-yellow-300 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-300 rounded"
                  >
                    Strona główna
                  </Link>
                </li>
                <li>
                  <Link
                    to="/blog"
                    className="text-white/95 hover:text-yellow-300 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-300 rounded"
                  >
                    Blog
                  </Link>
                </li>
                <li>
                  <Link
                    to="/categories/wszystkie"
                    className="text-white/95 hover:text-yellow-300 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-300 rounded"
                  >
                    Kategorie
                  </Link>
                </li>
                <li>
                  <Link
                    to="/wishlist"
                    className="text-white/95 hover:text-yellow-300 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-300 rounded"
                  >
                    Ulubione
                  </Link>
                </li>
                <li>
                  <Link
                    to="/cart"
                    className="text-white/95 hover:text-yellow-300 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-300 rounded"
                  >
                    Koszyk
                  </Link>
                </li>

                {/* ── NEW: Link widoczny tylko dla ADMINA */}
                {isAdmin && (
                  <li>
                    <Link
                      to="/admin"
                      className="text-white/95 hover:text-yellow-300 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-300 rounded"
                    >
                      Admin
                    </Link>
                  </li>
                )}
              </ul>
            </nav>

            {/* Informacje */}
            <nav aria-labelledby="footer-info" className="min-w-0">
              <h4 id="footer-info" className="font-semibold text-lg mb-4">
                Informacje
              </h4>
              <ul className="space-y-2 text-sm/6">
                <li>
                  <Link
                    to="/regulamin"
                    className="text-white/95 hover:text-yellow-300 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-300 rounded"
                  >
                    Regulamin
                  </Link>
                </li>
                <li>
                  <Link
                    to="/polityka-prywatnosci"
                    className="text-white/95 hover:text-yellow-300 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-300 rounded"
                  >
                    Polityka prywatności
                  </Link>
                </li>
                <li>
                  <Link
                    to="/faq"
                    className="text-white/95 hover:text-yellow-300 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-300 rounded"
                  >
                    FAQ
                  </Link>
                </li>
              </ul>
            </nav>

            {/* Kontakt */}
            <section aria-labelledby="footer-contact" className="min-w-0">
              <h4 id="footer-contact" className="font-semibold text-lg mb-4">
                Kontakt
              </h4>
              <ul className="space-y-3 text-sm/6">
                {/* E-mail */}
                <li className="flex items-center gap-2">
                  <Mail size={18} aria-hidden />
                  <a
                    href="mailto:support@giftstore.pl"
                    className="text-white hover:text-yellow-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-300 rounded transition"
                  >
                    support@giftstore.pl
                  </a>
                </li>

                {/* Formularz kontaktowy */}
                <li className="flex items-center gap-2">
                  <Mail size={18} aria-hidden />
                  <Link
                    to="/contact"
                    className="text-white hover:text-yellow-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-300 rounded transition"
                  >
                    Formularz kontaktowy
                  </Link>
                </li>
              </ul>
            </section>
          </div>

          {/* Divider + Newsletter + prawa */}
          <div className="mt-10 border-t border-white/25 pt-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-white/85">
                © {year} Gift Store. Wszystkie prawa zastrzeżone.
              </p>

              <div className="w-full sm:w-auto max-w-xl">
                {/* Newsletter → komunikaty ZAWSZE pod formularzem */}
                <NewsletterForm className="w-full sm:w-auto" messagesBelow />

                <p className="mt-2 text-[12px] text-white/80">
                  Zapisując się, akceptujesz{" "}
                  <Link
                    to="/polityka-prywatnosci"
                    className="underline underline-offset-4 hover:text-yellow-300"
                  >
                    Politykę prywatności
                  </Link>
                  .
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
