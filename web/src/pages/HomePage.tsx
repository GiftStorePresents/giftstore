// src/pages/HomePage.tsx
import SeoHead from "../components/SeoHead";
import HeroSection from "../components/HeroSection";
import BestsellerSlider from "../components/BestsellerSlider";
import GiftOfTheWeek from "../components/GiftOfTheWeek";
import Inspirations from "../components/Inspirations";
import CategoryTiles from "../components/CategoryTiles";
import PopularGifts from "../components/PopularGifts";
import Testimonials from "../components/Testimonials";
import GiftChat from "../components/GiftChat";
import LatestBlogTeasers from "../components/LatestBlogTeasers";

type HomePageProps = { setToast?: (msg: string) => void };

export default function HomePage({ setToast }: HomePageProps) {
  const SITE_URL = (
    import.meta.env?.VITE_SITE_URL ||
    (typeof window !== "undefined" ? window.location.origin : "")
  ).replace(/\/+$/, "");

  return (
    <>
      <SeoHead
        title="Gift Store – Wyjątkowe prezenty na każdą okazję"
        description="Najlepsze pomysły na prezenty: dla niej, dla niego i na każdą okazję. Szybka wysyłka, świetne ceny!"
        image="/og-image.jpg"
        canonical={`${SITE_URL}/`}
        jsonLd={[
          {
            "@context": "https://schema.org",
            "@type": "WebSite",
            "name": "Gift Store",
            "url": SITE_URL,
            "potentialAction": {
              "@type": "SearchAction",
              "target": `${SITE_URL}/search?q={query}`,
              "query-input": "required name=query"
            }
          },
          {
            "@context": "https://schema.org",
            "@type": "Organization",
            "name": "Gift Store",
            "url": SITE_URL,
            "logo": `${SITE_URL}/og-image.jpg`
          }
        ]}
      />

      {/* Sekcje landing page */}
      <section className="mb-8 sm:mb-10 lg:mb-12">
        <HeroSection />
      </section>

      <section className="mb-10 sm:mb-12 lg:mb-14">
        <BestsellerSlider setToast={setToast} />
      </section>

      <section className="mb-10 sm:mb-12 lg:mb-14">
        <GiftOfTheWeek setToast={setToast} />
      </section>

      <section className="mb-10 sm:mb-12 lg:mb-14">
        <Inspirations />
      </section>

      <section className="mb-10 sm:mb-12 lg:mb-14">
        <CategoryTiles />
      </section>

      <section className="mb-10 sm:mb-12 lg:mb-16">
        <PopularGifts setToast={setToast} />
      </section>

      <section className="mb-10 sm:mb-12 lg:mb-16">
        <Testimonials />
      </section>

      <section className="mb-8 sm:mb-10 lg:mb-14">
        <GiftChat setToast={setToast} />
      </section>

      <section className="mb-10 sm:mb-12 lg:mb-14">
        <LatestBlogTeasers />
      </section>
    </>
  );
}
