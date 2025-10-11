// src/components/Footer.jsx
import { Link } from "react-router-dom";
import { Facebook, Instagram, Twitter, Mail, Phone, MapPin } from "lucide-react";
import NewsletterForm from "./NewsletterForm";
import InstallPWAButton from "./InstallPWAButton";

export default function Footer() {
  const year = new Date().getFullYear();

  // prosta detekcja iOS + brak trybu standalone
  const isIOS =
    typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);
  const notStandalone =
    typeof window !== "undefined" && !window.matchMedia("(display-mode: standalone)").matches;

  return (
    <footer className="relative mt-16 bg-gradient-to-br from-rose-600 via-pink-600 to-red-500 text-white">
      {/* warstwa tła NIE blokuje kliknięć */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm pointer-events-none"
        aria-hidden
      />

      <div className="relative z-10 max-w-7xl mx-auto px-6 py-14 grid gap-10 sm:gap-12 md:grid-cols-4">
        {/* Logo & opis */}
        <div>
          <h3 className="text-2xl font-bold">🎁 Gift Store</h3>
          <p className="mt-4 text-sm text-gray-200 leading-relaxed">
            Wyjątkowe prezenty na każdą okazję — od drobiazgów po luksusowe upominki.
          </p>

          {/* Social */}
          <div className="flex space-x-4 mt-5" aria-label="Social media">
            <a
              href="https://facebook.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-yellow-300 transition"
              aria-label="Facebook"
              title="Facebook"
            >
              <Facebook size={22} />
            </a>
            <a
              href="https://instagram.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-yellow-300 transition"
              aria-label="Instagram"
              title="Instagram"
            >
              <Instagram size={22} />
            </a>
            <a
              href="https://twitter.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-yellow-300 transition"
              aria-label="Twitter"
              title="Twitter/X"
            >
              <Twitter size={22} />
            </a>
          </div>

          {/* ▶️ Przyciski instalacji PWA – NAD linią, pod social */}
          <div className="mt-6">
            <InstallPWAButton
              variant="button"
              label="Zainstaluj aplikację"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl 
                         border-[1.25px] border-[#FFD44D]
                         text-[#FFF7CC] hover:text-rose-800 
                         hover:bg-[#FFD44D]/95 font-semibold shadow-sm 
                         transition-colors"
            />

            {/* iOS podpowiedź (Safari nie ma beforeinstallprompt) */}
            {isIOS && notStandalone && (
              <p className="mt-2 text-xs text-yellow-100/90">
                Na iOS zainstalujesz przez: <strong>Udostępnij</strong> →{" "}
                <strong>Do ekranu początkowego</strong>.
              </p>
            )}
          </div>
        </div>

        {/* Nawigacja */}
        <nav aria-label="Nawigacja">
          <h4 className="font-semibold text-lg mb-4">Nawigacja</h4>
          <ul className="space-y-2 text-sm">
            <li><Link to="/" className="hover:underline">Strona główna</Link></li>
            <li><Link to="/blog" className="hover:underline">Blog</Link></li>
            <li><Link to="/categories/wszystkie" className="hover:underline">Kategorie</Link></li>
            <li><Link to="/wishlist" className="hover:underline">Ulubione</Link></li>
            <li><Link to="/cart" className="hover:underline">Koszyk</Link></li>
          </ul>
        </nav>

        {/* Informacje */}
        <nav aria-label="Informacje">
          <h4 className="font-semibold text-lg mb-4">Informacje</h4>
          <ul className="space-y-2 text-sm">
            <li><Link to="/regulamin" className="hover:underline">Regulamin</Link></li>
            <li><Link to="/polityka-prywatnosci" className="hover:underline">Polityka prywatności</Link></li>
            <li><Link to="/faq" className="hover:underline">FAQ</Link></li>
          </ul>
        </nav>

        {/* Kontakt */}
        <div>
          <h4 className="font-semibold text-lg mb-4">Kontakt</h4>
          <ul className="space-y-3 text-sm">
            <li className="flex items-center gap-2">
              <Mail size={18} aria-hidden />
              <span>support@giftstore.pl</span>
            </li>
            <li className="flex items-center gap-2">
              <Phone size={18} aria-hidden />
              <span>+48 792 872 009</span>
            </li>
            <li className="flex items-center gap-2">
              <MapPin size={18} aria-hidden />
              <span>Warszawa, ul. Szeligowska 39A</span>
            </li>
          </ul>
        </div>
      </div>

      {/* Newsletter + prawa */}
      <div className="relative z-10 border-t border-white/20">
        <div className="max-w-7xl mx-auto px-6 py-6 flex flex-col sm:flex-row justify-between items-center gap-4 text-sm">
          <p className="text-gray-200">© {year} Gift Store. Wszystkie prawa zastrzeżone.</p>

          <div className="w-full sm:w-auto">
            <NewsletterForm className="w-full sm:w-auto" />
            <p className="mt-2 text-[12px] text-gray-200/80">
              Zapisując się, akceptujesz{" "}
              <Link to="/polityka-prywatnosci" className="underline">
                Politykę prywatności
              </Link>
              .
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
