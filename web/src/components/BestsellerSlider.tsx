// src/components/BestsellerSlider.tsx
import { useMemo, useRef } from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, Pagination, Autoplay, EffectCoverflow } from "swiper/modules";
import { ChevronLeft, ChevronRight } from "lucide-react";

import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";
import "swiper/css/effect-coverflow";

import ProductCard from "./ProductCard";
import { useApiProducts } from "../hooks/useApiProducts";
import { mapApiProductToCard } from "../utils/productMapper";

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

type BaseCard = NonNullable<ReturnType<typeof mapApiProductToCard>>;
type CardProduct = BaseCard & { bestseller: boolean };

const isFeatured = (p: ApiProduct) =>
  !!(p.featured || p.isFeatured || p.bestseller || p.tags?.includes?.("featured"));

interface Props { setToast?: (msg: string) => void; }

export default function BestsellerSlider({ setToast }: Props) {
  const { items, loading, error } = useApiProducts({ page: 1, limit: 50 });

  const prevRef = useRef<HTMLButtonElement | null>(null);
  const nextRef = useRef<HTMLButtonElement | null>(null);

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

  const MAX_SPV = 3;
  const canLoop = bestsellers.length >= MAX_SPV * 2;

  if (loading) return <section className="my-14 p-4">Ładowanie…</section>;
  if (error)   return <section className="my-14 p-4 text-red-600">{String(error)}</section>;
  if (!bestsellers.length) return null;

  return (
    <section className="my-14" aria-labelledby="bestseller-heading">
      <h3 id="bestseller-heading" className="text-2xl font-bold text-mainRed mb-6">
        Bestsellery
      </h3>

      {/* Lokalne style: tylko skala na hover (0.95) */}
      <style>{`
        /* Kontrolujemy TYLKO skalowanie kart w tym sliderze */
        .bestseller-swiper .card-scale {
          transform-origin: center;
          transform: scale(1);
          transition: transform .14s ease;
          will-change: transform;
        }
        .bestseller-swiper .card-scale:hover {
          transform: scale(0.98); /* zmniejszenie na hover -> "przebija" inne efekty */
        }

        /* Gdy użytkownik preferuje mniejszy ruch — bez animacji */
        @media (prefers-reduced-motion: reduce) {
          .bestseller-swiper .card-scale { transition: none; }
        }
      `}</style>

      {/* Kontener pilnujący granic + padding na dół (pagination + cień kart) */}
      <div className="relative w-full max-w-[1200px] mx-auto px-4 md:px-6 pt-2 pb-10 md:pb-16 overflow-visible">
        {/* Strzałki – pozycjonowane względem kontenera */}
        <button
          ref={prevRef}
          aria-label="Poprzedni"
          className="absolute left-[-6px] top-1/2 -translate-y-1/2 z-20 grid place-items-center w-11 h-11 rounded-full bg-white/90 text-mainRed shadow hover:bg-white"
          type="button"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <button
          ref={nextRef}
          aria-label="Następny"
          className="absolute right-[-6px] top-1/2 -translate-y-1/2 z-20 grid place-items-center w-11 h-11 rounded-full bg-white/90 text-mainRed shadow hover:bg-white"
          type="button"
        >
          <ChevronRight className="w-5 h-5" />
        </button>

        <Swiper
          key={`${bestsellers.length}-${canLoop ? "loop" : "noloop"}`}
          className="bestseller-swiper"
          modules={[Navigation, Pagination, Autoplay, EffectCoverflow]}
          autoHeight
          centeredSlides
          grabCursor
          allowTouchMove
          loop={canLoop}
          loopAdditionalSlides={canLoop ? 4 : 0}
          speed={650}
          autoplay={
            canLoop
              ? { delay: 3200, disableOnInteraction: false, pauseOnMouseEnter: false, stopOnLastSlide: false, waitForTransition: true }
              : undefined
          }
          effect="coverflow"
          coverflowEffect={{ rotate: 28, stretch: 0, depth: 130, modifier: 1, slideShadows: true }}
          pagination={{ clickable: true }}
          onSwiper={(sw) => {
            // @ts-ignore
            sw.params.navigation = { ...(sw.params.navigation || {}), prevEl: prevRef.current, nextEl: nextRef.current };
            // @ts-ignore
            sw.navigation?.init?.();
            // @ts-ignore
            sw.navigation?.update?.();
            setTimeout(() => {
              // @ts-ignore
              sw.update?.();
              // @ts-ignore
              sw.pagination?.render?.();
              // @ts-ignore
              sw.pagination?.update?.();
              // @ts-ignore
              sw.autoplay?.start?.();
            }, 0);
          }}
          breakpoints={{
            0:    { slidesPerView: 1,   spaceBetween: 12 },
            480:  { slidesPerView: 1.18, spaceBetween: 14, centeredSlides: true },
            640:  { slidesPerView: 2,   spaceBetween: 16 },
            900:  { slidesPerView: 3,   spaceBetween: 18 },
            1200: { slidesPerView: 3,   spaceBetween: 22 },
          }}
        >
          {bestsellers.map((p, i) => (
            <SwiperSlide key={String((p as any).id ?? (p as any).slug ?? i)} className="!h-auto pb-8">
              <div className="flex justify-center items-stretch h-full">
                {/* klasa z hover scale */}
                <div className="w-full max-w-[360px] card-scale">
                  {/* wyłączamy ewentualne wewnętrzne skalowanie ProductCard */}
                  <ProductCard product={p} setToast={setToast} large scaleOnHover={false} />
                </div>
              </div>
            </SwiperSlide>
          ))}
        </Swiper>
      </div>
    </section>
  );
}
