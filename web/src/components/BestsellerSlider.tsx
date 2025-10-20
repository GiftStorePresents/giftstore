// src/components/BestsellerSlider.tsx
import { useMemo } from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, Pagination, Autoplay, EffectCoverflow } from "swiper/modules";

// nie mieszaj bundle + pojedynczych css – trzymaj się jednego wariantu
import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";
import "swiper/css/effect-coverflow";

import ProductCard from "./ProductCard";
import { useApiProducts } from "../hooks/useApiProducts";
import { mapApiProductToCard } from "../utils/productMapper";

/** API */
export interface ApiProduct {
  id?: string | number;
  slug?: string;
  name?: string;
  description?: string;
  price?: number;
  priceCents?: number;
  featured?: boolean;
  isFeatured?: boolean;
  bestseller?: boolean;
  tags?: string[];
  media?: { url: string }[];
  image?: string;
  rating?: number;
  stock?: number;
  oldPrice?: number | null;
}

/** UI */
type BaseCard = NonNullable<ReturnType<typeof mapApiProductToCard>>;
type CardProduct = BaseCard & { bestseller: boolean };

const isFeatured = (p: ApiProduct) =>
  !!(p.featured || p.isFeatured || p.bestseller || p.tags?.includes?.("featured"));

interface Props { setToast?: (msg: string) => void; }

export default function BestsellerSlider({ setToast }: Props) {
  const { items, loading, error } = useApiProducts({ page: 1, limit: 50 });

  const products = useMemo<ApiProduct[]>(
    () => (Array.isArray(items) ? items : []),
    [items]
  );

  const bestsellers = useMemo<CardProduct[]>(() => {
    const featured = products.filter(isFeatured);
    const base = (featured.length ? featured : products).slice(0, 12);
    return base
      .map((p) => {
        const m = mapApiProductToCard(p);
        return m ? ({ ...m, bestseller: isFeatured(p) } as CardProduct) : null;
      })
      .filter((x): x is CardProduct => !!x);
  }, [products]);

  if (loading) return <section className="my-14 p-4">Ładowanie…</section>;
  if (error)   return <section className="my-14 p-4 text-red-600">{String(error)}</section>;
  if (!bestsellers.length) return null;

  /** Ile slajdów max widać jednocześnie przy szerokim ekranie */
  const MAX_SPV = 3;

  /**
   * Swiper ma wymagania dla loop:
   * - liczba slajdów > slidesPerView * 2 (bezpiecznie: >= 2×MAX_SPV)
   * Jeżeli jest mniej – loop off, autoplay off, żeby nie było przeskoków/ostrzeżeń.
   */
  const canLoop = bestsellers.length >= MAX_SPV * 2;

  return (
    <section className="my-14" aria-labelledby="bestseller-heading">
      <h3 id="bestseller-heading" className="text-2xl font-bold text-mainRed mb-6">
        Bestsellery
      </h3>

      <div className="relative w-[80vw] max-w-7xl mx-auto rounded-3xl pt-[25px] pb-[50px] overflow-visible">
        <Swiper
          key={`${bestsellers.length}-${canLoop ? "loop" : "noloop"}`} // wymusza re-init po dociągnięciu danych
          className="bestseller-swiper"
          modules={[Navigation, Pagination, Autoplay, EffectCoverflow]}
          effect="coverflow"
          centeredSlides
          grabCursor
          allowTouchMove
          /** loop włączamy tylko gdy jest „bezpiecznie” */
          loop={canLoop}
          loopAdditionalSlides={canLoop ? 4 : 0}
          speed={650}
          autoplay={
            canLoop
              ? {
                  delay: 3200,
                  disableOnInteraction: false,
                  pauseOnMouseEnter: false,
                  stopOnLastSlide: false,
                  waitForTransition: true,
                }
              : undefined
          }
          navigation
          pagination={{ clickable: true }}
          onSwiper={(sw) => {
            // Po inicjalizacji dociągniętych danych dobijamy aktualizacje,
            // żeby nawigacja/paginacja i autoplay były zsynchronizowane.
            setTimeout(() => {
              // @ts-ignore – metody istnieją w runtime
              sw.update?.();
              // @ts-ignore
              sw.navigation?.update?.();
              // @ts-ignore
              sw.pagination?.render?.();
              // @ts-ignore
              sw.pagination?.update?.();
              // jeśli autoplay jest, upewnij się że działa
              // @ts-ignore
              sw.autoplay?.start?.();
            }, 0);
          }}
          coverflowEffect={{
            rotate: 30,
            stretch: 0,
            depth: 150,
            modifier: 1,
            slideShadows: true,
          }}
          breakpoints={{
            0:    { slidesPerView: 1,   spaceBetween: 12 },
            480:  { slidesPerView: 1.2, spaceBetween: 14, centeredSlides: true },
            640:  { slidesPerView: 2,   spaceBetween: 16 },
            900:  { slidesPerView: 3,   spaceBetween: 18 },
            1280: { slidesPerView: 3,   spaceBetween: 24 },
          }}
        >
          {bestsellers.map((p, i) => (
            <SwiperSlide key={String((p as any).id ?? (p as any).slug ?? i)}>
              <div className="flex justify-center items-stretch py-6 sm:py-8 h-full">
                <div className="w-full max-w-[360px]">
                  <ProductCard
                    product={p}
                    setToast={setToast}
                    large
                    scaleOnHover={false}
                    fixedHeight={500}
                  />
                </div>
              </div>
            </SwiperSlide>
          ))}
        </Swiper>
      </div>
    </section>
  );
}
