// src/components/SimilarSlider.tsx
import { useMemo, useRef } from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, Pagination, Autoplay } from "swiper/modules";
import type { Swiper as SwiperType } from "swiper";
import { ChevronLeft, ChevronRight } from "lucide-react";

import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";

import ProductCard from "./ProductCard";

export interface SimilarItem {
  id?: string | number;
  slug?: string;
  name: string;
  description?: string;
  price: number;
  oldPrice?: number | null;
  rating?: number;
  image: string;
}

interface Props {
  title?: string;
  products: SimilarItem[];
  setToast?: (msg: string) => void;
}

export default function SimilarSlider({
  title = "Podobne produkty",
  products,
  setToast,
}: Props) {
  const items = useMemo(
    () => (Array.isArray(products) ? products.slice(0, 12) : []),
    [products]
  );

  const prevRef = useRef<HTMLButtonElement | null>(null);
  const nextRef = useRef<HTMLButtonElement | null>(null);

  const MAX_SPV = 3;
  const canLoop = items.length >= MAX_SPV * 2;
  if (!items.length) return null;

  return (
    <section className="my-14" aria-labelledby="similar-heading">
      <h3 id="similar-heading" className="text-2xl font-bold text-mainRed mb-6 text-center">
        {title}
      </h3>

      {/* Centralny kontener – jak w BestsellerSlider */}
      <div className="relative w-full max-w-[1200px] mx-auto px-4 md:px-6 pt-2 pb-10 md:pb-16 overflow-visible">
        {/* Strzałki przy krawędziach kontenera */}
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

        {/* Delikatny hover bez ucinek */}
        <style>{`
          .similar-swiper .swiper-slide { height:auto; }
          .card-zoom {
            will-change: transform, box-shadow;
            transition: transform .2s ease, box-shadow .2s ease, filter .2s ease;
            transform-origin: center;
          }
          .card-zoom:hover {
            transform: translateY(-1px) scale(0.95);
            box-shadow: 0 14px 40px rgba(0,0,0,.28);
            filter: drop-shadow(0 0 18px rgba(255,215,0,.18));
          }
        `}</style>

        <Swiper
          key={`${items.length}-${canLoop ? "loop" : "noloop"}`}
          className="similar-swiper"
          modules={[Navigation, Pagination, Autoplay]}
          autoHeight
          grabCursor
          allowTouchMove
          watchOverflow
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
          pagination={{ clickable: true }}
          // ✅ Typ-bezpieczne podpięcie nawigacji (bez spread)
          onBeforeInit={(sw: SwiperType) => {
            if (!sw.params.navigation || typeof sw.params.navigation === "boolean") {
              (sw.params as any).navigation = {
                enabled: true,
                prevEl: prevRef.current,
                nextEl: nextRef.current,
              };
            } else {
              (sw.params.navigation as any).enabled = true;
              (sw.params.navigation as any).prevEl = prevRef.current;
              (sw.params.navigation as any).nextEl = nextRef.current;
            }
          }}
          onSwiper={(sw) => {
            sw.navigation?.init?.();
            sw.navigation?.update?.();
            requestAnimationFrame(() => {
              sw.update?.();
              sw.pagination?.render?.();
              sw.pagination?.update?.();
              sw.autoplay?.start?.();
            });
          }}
          // 3 → 2 → 1, zawsze w środku kontenera
          breakpoints={{
            0: { slidesPerView: 1, spaceBetween: 12, centeredSlides: true },
            640: { slidesPerView: 2, spaceBetween: 16, centeredSlides: false },
            1024: { slidesPerView: 3, spaceBetween: 22, centeredSlides: false },
            1200: { slidesPerView: 3, spaceBetween: 24, centeredSlides: false },
          }}
        >
          {items.map((p, i) => (
            <SwiperSlide key={String(p.id ?? p.slug ?? i)} className="!h-auto pb-8">
              <div className="flex justify-center items-stretch h-full">
                <div className="w-full max-w-[360px] card-zoom">
                  <ProductCard product={p as any} setToast={setToast} fixedHeight={480} />
                </div>
              </div>
            </SwiperSlide>
          ))}
        </Swiper>
      </div>
    </section>
  );
}
