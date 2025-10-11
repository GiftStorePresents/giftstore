import { useMemo } from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, Pagination, Autoplay, EffectCoverflow } from "swiper/modules";

import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";
import "swiper/css/effect-coverflow";

import ProductCard from "./ProductCard";
import { useApiProducts } from "../hooks/useApiProducts";
import { mapApiProductToCard } from "../utils/productMapper";

/* --- Typy z backendu --- */
export interface ApiProduct {
  id: string | number;
  slug: string;
  name: string;
  description?: string;
  price?: number;
  priceCents?: number;
  featured?: boolean;
  promo?: boolean;
  media?: { url: string }[];
  image?: string;
  rating?: number;
  stock?: number;
  oldPrice?: number | null;
}

/* --- Typ karty w UI --- */
export interface CardProduct {
  id: string | number;
  slug: string;
  name: string;
  description: string;
  price: number;
  oldPrice?: number | null;
  rating: number;
  bestseller: boolean;
  promo: boolean;
  stock?: number;
  image: string;
  media?: { url: string }[];
}

interface BestsellerSliderProps {
  setToast?: (msg: string) => void;
}

export default function BestsellerSlider({ setToast }: BestsellerSliderProps) {
  const { items, loading, error } = useApiProducts({ page: 1, limit: 50 });

  const bestsellers: CardProduct[] = useMemo(() => {
    const featured = items.filter((p: ApiProduct) => !!p.featured);
    const base = (featured.length ? featured : items).slice(0, 12);

    return base
      .map((p: ApiProduct) => {
        const mapped = mapApiProductToCard(p) as Omit<CardProduct, "bestseller"> | null;
        if (!mapped) return null;
        return { ...mapped, bestseller: !!p.featured } as CardProduct;
      })
      .filter((x): x is CardProduct => x !== null);
  }, [items]);

  if (loading) {
    return (
      <section className="my-14 p-4" aria-label="Ładowanie bestsellerów">
        Ładowanie…
      </section>
    );
  }

  if (error) {
    return (
      <section className="my-14 p-4 text-red-600" aria-label="Błąd ładowania bestsellerów">
        {String(error)}
      </section>
    );
  }

  if (!bestsellers.length) return null;

  return (
    <section className="my-14" aria-labelledby="bestseller-heading">
      <h3 id="bestseller-heading" className="text-2xl font-bold text-mainRed mb-6">
        Bestsellery
      </h3>

      <div className="w-[80vw] max-w-7xl mx-auto overflow-hidden rounded-3xl pt-[25px] pb-[50px]">
        <Swiper
          modules={[Navigation, Pagination, Autoplay, EffectCoverflow]}
          effect="coverflow"
          grabCursor
          centeredSlides
          loop
          navigation
          pagination={{ clickable: true }}
          autoplay={{ delay: 3200, disableOnInteraction: false }}
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
          style={{ width: "100%" }}
        >
          {bestsellers.map((product) => (
            <SwiperSlide key={product.id}>
              <div className="flex justify-center items-stretch py-6 sm:py-8 h-full">
                <div className="w-full max-w-[360px]">
                  <ProductCard
                    product={product}
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
