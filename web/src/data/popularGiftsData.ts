// src/seed/popularGiftsData.ts
export type PopularGift = {
  name: string;
  slug: string;
  priceCents: number;
  description?: string;
  brand?: string;
  category?: string;
  sku?: string;
  stock?: number;
  color?: string;
  size?: string;
  personalize?: boolean;
  featured?: boolean;
  imageUrl?: string; // pełny URL (http/https)
};

// --- surowe dane dokładnie w formacie, jaki wkleiłeś ---
type RawGift = {
  slug: string;
  name: string;
  description?: string;
  price: number;
  oldPrice?: number | null;
  image: string;
  gallery?: string[];
  rating?: number;
  bestseller?: boolean;
  promo?: boolean;
  tags?: string[];
  stock?: number;
  deliveryTime?: number;
  freeShippingThreshold?: number;
  category?: string;
  personalize?: boolean;
};

// (tu TWOJA długa tablica rawGifts – nie zmieniam zawartości)
const rawGifts: RawGift[] = [
  {
    slug: "zlota-roza-w-pudelku",
    name: "Złota Róża w Pudełku",
    description: "Luksusowy upominek dla wyjątkowej osoby. Trwała i piękna.",
    price: 99,
    image:
      "https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=400&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=600&q=80",
    ],
    rating: 5,
    bestseller: true,
    promo: true,
    oldPrice: 129,
    tags: ["dla niej", "na urodziny", "bez okazji", "ekskluzywne"],
    stock: 3,
    deliveryTime: 2,
    freeShippingThreshold: 200,
    category: "dla niej",
  },
  {
    slug: "pudelko-slodyczy-premium",
    name: "Pudełko Słodyczy Premium",
    description: "Wyselekcjonowane, ekskluzywne smakołyki na każdą okazję.",
    price: 119,
    image:
      "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=400&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=600&q=80",
    ],
    rating: 4,
    bestseller: true,
    promo: false,
    oldPrice: null,
    tags: ["dla niego", "na urodziny", "święta"],
    stock: 10,
    deliveryTime: 3,
    freeShippingThreshold: 200,
    category: "dla niego",
  },
  {
    slug: "zestaw-prezentowy-spa",
    name: "Zestaw Prezentowy Spa",
    description: "Relaks i odprężenie. Zestaw zapakowany w ozdobne pudełko.",
    price: 149,
    image:
      "https://images.unsplash.com/photo-1519125323398-675f0ddb6308?auto=format&fit=crop&w=400&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1519125323398-675f0ddb6308?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1519125323398-675f0ddb6308?auto=format&fit=crop&w=600&q=80",
    ],
    rating: 5,
    bestseller: false,
    promo: true,
    oldPrice: 179,
    tags: ["dla niej", "relaks", "rocznica"],
    stock: 7,
    deliveryTime: 2,
    freeShippingThreshold: 200,
    category: "dla niej",
  },
  {
    slug: "kreatywny-zestaw-diy",
    name: "Kreatywny Zestaw DIY",
    description: "Zrób to sam! Zestaw kreatywny dla dzieci i dorosłych.",
    price: 69,
    oldPrice: null,
    image:
      "https://images.unsplash.com/photo-1464983953574-0892a716854b?auto=format&fit=crop&w=400&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1464983953574-0892a716854b?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1464983953574-0892a716854b?auto=format&fit=crop&w=600&q=80",
    ],
    promo: false,
    bestseller: true,
    rating: 5,
    tags: ["dla dzieci", "na urodziny", "bez okazji"],
    stock: 12,
    deliveryTime: 4,
    freeShippingThreshold: 200,
    category: "dla dzieci",
  },
  {
    slug: "personalizowany-kubek",
    name: "Personalizowany Kubek",
    description: "Twój napis, Twój kubek! Idealny prezent na każdą okazję.",
    price: 49,
    oldPrice: 69,
    image:
      "https://images.unsplash.com/photo-1519125323398-675f0ddb6308?auto=format&fit=crop&w=400&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1519125323398-675f0ddb6308?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1519125323398-675f0ddb6308?auto=format&fit=crop&w=600&q=80",
    ],
    promo: true,
    bestseller: false,
    rating: 4,
    tags: [
      "dla niej",
      "dla niego",
      "dla mamy",
      "dla taty",
      "personalizowane",
      "bez okazji",
    ],
    stock: 15,
    deliveryTime: 3,
    freeShippingThreshold: 200,
    category: "personalizowane",
    personalize: true,
  },
  {
    slug: "ekskluzywny-zegarek",
    name: "Ekskluzywny Zegarek",
    description: "Elegancki zegarek w nowoczesnym stylu.",
    price: 399,
    oldPrice: 499,
    image:
      "https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=400&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=600&q=80",
    ],
    promo: true,
    bestseller: true,
    rating: 5,
    tags: ["dla niego", "ekskluzywne", "rocznica"],
    stock: 5,
    deliveryTime: 1,
    freeShippingThreshold: 200,
    category: "dla niego",
  },
  {
    slug: "swieca-sojowa",
    name: "Pachnąca Świeca Sojowa",
    description: "Relaksujący aromat w designerskim szkle.",
    price: 59,
    oldPrice: null,
    image:
      "https://images.unsplash.com/photo-1515378791036-0648a3ef77b2?auto=format&fit=crop&w=400&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1515378791036-0648a3ef77b2?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1515378791036-0648a3ef77b2?auto=format&fit=crop&w=600&q=80",
    ],
    promo: false,
    bestseller: false,
    rating: 4,
    tags: ["dla niej", "relaks", "bez okazji"],
    stock: 18,
    deliveryTime: 3,
    freeShippingThreshold: 200,
    category: "relaks",
  },
  {
    slug: "powerbank-solar",
    name: "Powerbank Solarny",
    description: "Ładowanie urządzeń dzięki energii słonecznej.",
    price: 89,
    oldPrice: 109,
    image:
      "https://images.unsplash.com/photo-1611079961821-9786a6a5c45e?auto=format&fit=crop&w=400&q=80",
    promo: true,
    bestseller: false,
    rating: 4,
    tags: ["dla niego", "dla niej", "podróże", "technologia"],
  },
  {
    slug: "stacja-meteo",
    name: "Stacja Pogodowa",
    description: "Monitoruj temperaturę i wilgotność w domu.",
    price: 159,
    oldPrice: 189,
    image:
      "https://images.unsplash.com/photo-1583337130417-3346a1af7b06?auto=format&fit=crop&w=400&q=80",
    promo: false,
    bestseller: false,
    rating: 4,
    tags: ["dla taty", "technologia", "dom"],
  },
  {
    slug: "zestaw-do-fondue",
    name: "Zestaw do Fondue",
    description: "Idealny zestaw do wspólnego biesiadowania.",
    price: 199,
    oldPrice: 239,
    image:
      "https://images.unsplash.com/photo-1589307004393-ded1f2b859ee?auto=format&fit=crop&w=400&q=80",
    promo: true,
    bestseller: false,
    rating: 4,
    tags: ["dla rodziny", "dla niej", "dla niego"],
  },
  {
    slug: "drukarka-3d",
    name: "Drukarka 3D",
    description: "Twórz własne projekty w 3D.",
    price: 1599,
    oldPrice: 1899,
    image:
      "https://images.unsplash.com/photo-1581092160562-40aa08e78837?auto=format&fit=crop&w=400&q=80",
    promo: true,
    bestseller: true,
    rating: 5,
    tags: ["technologia", "dla niego", "dla niej"],
  },
  {
    slug: "glosnik-bluetooth",
    name: "Głośnik Bluetooth",
    description: "Bezprzewodowy głośnik o mocnym brzmieniu.",
    price: 249,
    oldPrice: 299,
    image:
      "https://images.unsplash.com/photo-1589308078059-be1415eab4f2?auto=format&fit=crop&w=400&q=80",
    promo: false,
    bestseller: true,
    rating: 5,
    tags: ["dla niego", "dla niej", "muzyka"],
  },
  {
    slug: "zegarek-sportowy",
    name: "Zegarek Sportowy",
    description: "Monitoruje tętno, kroki i aktywność.",
    price: 399,
    oldPrice: 449,
    image:
      "https://images.unsplash.com/photo-1504703395950-b89145a5425b?auto=format&fit=crop&w=400&q=80",
    promo: true,
    bestseller: false,
    rating: 4,
    tags: ["sport", "dla niego", "dla niej"],
  },
  {
    slug: "mini-projektor",
    name: "Mini Projektor",
    description: "Domowe kino w kompaktowej formie.",
    price: 599,
    oldPrice: 699,
    image:
      "https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&fit=crop&w=400&q=80",
    promo: true,
    bestseller: true,
    rating: 5,
    tags: ["dla rodziny", "dla niego", "dla niej"],
  },
  {
    slug: "robot-odkurzacz",
    name: "Robot Odkurzacz",
    description: "Samodzielne sprzątanie całego mieszkania.",
    price: 1299,
    oldPrice: 1499,
    image:
      "https://images.unsplash.com/photo-1610465299995-b14f62f11bf5?auto=format&fit=crop&w=400&q=80",
    promo: true,
    bestseller: true,
    rating: 5,
    tags: ["dom", "technologia", "dla mamy", "dla taty"],
  },
  {
    slug: "mikrofon-usb",
    name: "Mikrofon USB",
    description: "Nagrywaj podcasty i streamuj w jakości studyjnej.",
    price: 399,
    oldPrice: 449,
    image:
      "https://images.unsplash.com/photo-1610468641665-8d8b63f6df2b?auto=format&fit=crop&w=400&q=80",
    promo: false,
    bestseller: false,
    rating: 4,
    tags: ["technologia", "dla niego", "dla niej"],
  },
  {
    slug: "mata-do-jogi",
    name: "Mata do Jogi",
    description: "Antypoślizgowa mata do ćwiczeń.",
    price: 99,
    oldPrice: 129,
    image:
      "https://images.unsplash.com/photo-1571019613914-85f342c1d4b1?auto=format&fit=crop&w=400&q=80",
    promo: false,
    bestseller: true,
    rating: 5,
    tags: ["sport", "dla niej", "dla niego"],
  },
  {
    slug: "lodowka-mini",
    name: "Lodówka Mini",
    description: "Mała lodówka na napoje i przekąski.",
    price: 499,
    oldPrice: 599,
    image:
      "https://images.unsplash.com/photo-1626716493865-29b66fcd2db7?auto=format&fit=crop&w=400&q=80",
    promo: true,
    bestseller: false,
    rating: 4,
    tags: ["technologia", "dom", "dla niego", "dla niej"],
  },
  {
    slug: "tablica-magnetyczna",
    name: "Tablica Magnetyczna",
    description: "Do notatek i planowania dnia.",
    price: 69,
    oldPrice: 89,
    image:
      "https://images.unsplash.com/photo-1616627564782-f16d54e54014?auto=format&fit=crop&w=400&q=80",
    promo: false,
    bestseller: false,
    rating: 4,
    tags: ["dla dzieci", "dom", "organizacja"],
  },
  {
    slug: "zestaw-do-robienia-sushi",
    name: "Zestaw do Robienia Sushi",
    description:
      "Kompletny zestaw do przygotowania pysznego sushi w domu.",
    price: 129,
    oldPrice: 159,
    image:
      "https://images.unsplash.com/photo-1553621042-f6e147245754?auto=format&fit=crop&w=400&q=80",
    promo: true,
    bestseller: false,
    rating: 4,
    tags: ["dla rodziny", "dla niej", "dla niego", "kulinaria"],
  },
  {
    slug: "termos-turystyczny",
    name: "Termos Turystyczny",
    description: "Pojemny termos utrzymujący temperaturę do 12 godzin.",
    price: 79,
    oldPrice: 99,
    image:
      "https://images.unsplash.com/photo-1526403229783-cca7c7f1a2f3?auto=format&fit=crop&w=400&q=80",
    promo: true,
    bestseller: false,
    rating: 4,
    tags: ["podróże", "dla niego", "dla niej"],
  },
  {
    slug: "skrzynka-narzedziowa",
    name: "Skrzynka Narzędziowa",
    description: "Zestaw podstawowych narzędzi w solidnej walizce.",
    price: 199,
    oldPrice: 249,
    image:
      "https://images.unsplash.com/photo-1593062096033-cfda0f6e950d?auto=format&fit=crop&w=400&q=80",
    promo: false,
    bestseller: true,
    rating: 5,
    tags: ["dla taty", "dom", "hobby"],
  },
  {
    slug: "plecak-biznesowy",
    name: "Plecak Biznesowy",
    description: "Elegancki plecak na laptopa i dokumenty.",
    price: 229,
    oldPrice: 279,
    image:
      "https://images.unsplash.com/photo-1622560480654-d96214fdc887?auto=format&fit=crop&w=400&q=80",
    promo: true,
    bestseller: true,
    rating: 5,
    tags: ["dla niego", "dla niej", "praca"],
  },
  {
    slug: "nawilzacz-powietrza",
    name: "Nawilżacz Powietrza",
    description: "Ultradźwiękowy nawilżacz z funkcją aromaterapii.",
    price: 159,
    oldPrice: 199,
    image:
      "https://images.unsplash.com/photo-1606813902914-cf6b6f9da64b?auto=format&fit=crop&w=400&q=80",
    promo: true,
    bestseller: false,
    rating: 4,
    tags: ["dom", "relaks", "zdrowie"],
  },
  {
    slug: "zestaw-do-grilla",
    name: "Zestaw do Grilla",
    description:
      "Kompletny zestaw akcesoriów grillowych w walizce.",
    price: 149,
    oldPrice: 179,
    image:
      "https://images.unsplash.com/photo-1606787366850-de6330128bfc?auto=format&fit=crop&w=400&q=80",
    promo: false,
    bestseller: true,
    rating: 5,
    tags: ["dla taty", "ogród", "impreza"],
  },
  {
    slug: "robot-kuchenny",
    name: "Robot Kuchenny",
    description:
      "Wielofunkcyjny robot kuchenny do gotowania i pieczenia.",
    price: 1299,
    oldPrice: 1499,
    image:
      "https://images.unsplash.com/photo-1599232384259-fd1f6ec1d9b3?auto=format&fit=crop&w=400&q=80",
    promo: true,
    bestseller: true,
    rating: 5,
    tags: ["dom", "kuchnia", "dla mamy"],
  },
  {
    slug: "klocki-dla-dzieci",
    name: "Klocki dla Dzieci",
    description: "Zestaw kreatywnych klocków konstrukcyjnych.",
    price: 89,
    oldPrice: 119,
    image:
      "https://images.unsplash.com/photo-1601758124510-52d97d5bbee9?auto=format&fit=crop&w=400&q=80",
    promo: true,
    bestseller: false,
    rating: 4,
    tags: ["dla dzieci", "hobby", "rozwój"],
  },
  {
    slug: "fotel-biurowy",
    name: "Fotel Biurowy",
    description: "Ergonomiczny fotel z regulacją wysokości.",
    price: 599,
    oldPrice: 699,
    image:
      "https://images.unsplash.com/photo-1586190848861-99aa4a171e90?auto=format&fit=crop&w=400&q=80",
    promo: false,
    bestseller: false,
    rating: 4,
    tags: ["praca", "dom", "dla niego", "dla niej"],
  },
  {
    slug: "parasol-ogrodowy",
    name: "Parasol Ogrodowy",
    description:
      "Duży parasol przeciwsłoneczny na taras lub balkon.",
    price: 249,
    oldPrice: 299,
    image:
      "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=400&q=80",
    promo: true,
    bestseller: false,
    rating: 4,
    tags: ["ogród", "lato", "relaks"],
  },
  {
    slug: "gimbal-smartfon",
    name: "Gimbal do Smartfona",
    description:
      "Stabilizator obrazu dla miłośników nagrań wideo.",
    price: 399,
    oldPrice: 449,
    image:
      "https://images.unsplash.com/photo-1621881536151-6d6c6fdf042a?auto=format&fit=crop&w=400&q=80",
    promo: true,
    bestseller: true,
    rating: 5,
    tags: ["technologia", "podróże", "dla niego", "dla niej"],
  },
  {
    slug: "lodka-pontoon",
    name: "Łódka Pontonowa",
    description:
      "Ponton dla 4 osób – idealny na jeziora i rzeki.",
    price: 899,
    oldPrice: 1099,
    image:
      "https://images.unsplash.com/photo-1627662234797-986acde4d7f5?auto=format&fit=crop&w=400&q=80",
    promo: true,
    bestseller: false,
    rating: 4,
    tags: ["sport", "podróże", "dla rodziny"],
  },
  {
    slug: "czajnik-elektryczny",
    name: "Czajnik Elektryczny",
    description: "Szybko gotuje wodę, energooszczędny i stylowy.",
    price: 149,
    oldPrice: 179,
    image:
      "https://images.unsplash.com/photo-1605647532429-9a6f5e4a5113?auto=format&fit=crop&w=400&q=80",
    promo: false,
    bestseller: true,
    rating: 5,
    tags: ["kuchnia", "dom", "dla mamy", "dla taty"],
  },
  {
    slug: "latarka-led",
    name: "Latarka LED",
    description: "Mocna latarka LED z trybami świecenia.",
    price: 69,
    oldPrice: 89,
    image:
      "https://images.unsplash.com/photo-1581091012184-5c4a1c1ff717?auto=format&fit=crop&w=400&q=80",
    promo: true,
    bestseller: false,
    rating: 4,
    tags: ["podróże", "dla niego", "technologia"],
  },
  {
    slug: "namiot-rodzinny",
    name: "Namiot Rodzinny",
    description:
      "Przestronny namiot dla 4 osób z przedsionkiem.",
    price: 699,
    oldPrice: 799,
    image:
      "https://images.unsplash.com/photo-1593693397693-5f6e4aeb79c3?auto=format&fit=crop&w=400&q=80",
    promo: false,
    bestseller: true,
    rating: 5,
    tags: ["podróże", "dla rodziny", "lato"],
  },
  {
    slug: "rower-miejski",
    name: "Rower Miejski",
    description:
      "Stylowy rower do jazdy po mieście z koszykiem.",
    price: 1299,
    oldPrice: 1499,
    image:
      "https://images.unsplash.com/photo-1508979826421-0645f1a81055?auto=format&fit=crop&w=400&q=80",
    promo: true,
    bestseller: true,
    rating: 5,
    tags: ["sport", "dla niej", "dla niego", "podróże"],
  },
  {
    slug: "konsola-retro",
    name: "Konsola Retro",
    description:
      "Mini konsola z klasycznymi grami z lat 80-90.",
    price: 249,
    oldPrice: 299,
    image:
      "https://images.unsplash.com/photo-1598550487032-0b4d4a3e6d4a?auto=format&fit=crop&w=400&q=80",
    promo: true,
    bestseller: false,
    rating: 4,
    tags: ["technologia", "hobby", "dla dzieci"],
  },
  {
    slug: "zestaw-herbat",
    name: "Zestaw Herbat Premium",
    description:
      "Ekskluzywny zestaw herbat z całego świata.",
    price: 119,
    oldPrice: 149,
    image:
      "https://images.unsplash.com/photo-1505577058444-a3dab90d4253?auto=format&fit=crop&w=400&q=80",
    promo: false,
    bestseller: true,
    rating: 5,
    tags: ["kuchnia", "dla mamy", "relaks"],
  },
  {
    slug: "szalik-kaszmirowy",
    name: "Szalik Kaszmirowy",
    description:
      "Miękki i ciepły szalik z naturalnego kaszmiru.",
    price: 299,
    oldPrice: 349,
    image:
      "https://images.unsplash.com/photo-1618354691373-8c80b9dcd51f?auto=format&fit=crop&w=400&q=80",
    promo: true,
    bestseller: false,
    rating: 4,
    tags: ["moda", "dla niej", "zima"],
  },
  {
    slug: "stolik-kawowy",
    name: "Stolik Kawowy",
    description:
      "Nowoczesny stolik kawowy z półką na magazyny.",
    price: 399,
    oldPrice: 449,
    image:
      "https://images.unsplash.com/photo-1628744871361-4c3dbfc2a76d?auto=format&fit=crop&w=400&q=80",
    promo: false,
    bestseller: true,
    rating: 5,
    tags: ["dom", "salon", "dla niej", "dla niego"],
  },
  {
    slug: "kamera-sportowa",
    name: "Kamera Sportowa 4K",
    description: "Wodoodporna kamera z nagrywaniem w 4K.",
    price: 599,
    oldPrice: 699,
    image:
      "https://images.unsplash.com/photo-1508896694512-bb8e93e191f8?auto=format&fit=crop&w=400&q=80",
    promo: true,
    bestseller: true,
    rating: 5,
    tags: ["technologia", "podróże", "sport"],
  },
  {
    slug: "drone-mini",
    name: "Mini Dron z Kamerą",
    description:
      "Kompaktowy dron z kamerą HD i trybem follow-me.",
    price: 349,
    oldPrice: 399,
    image:
      "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=400&q=80",
    promo: false,
    bestseller: false,
    rating: 4,
    tags: ["technologia", "hobby", "dla niego"],
  },
  {
    slug: "biurko-gamingowe",
    name: "Biurko Gamingowe LED",
    description: "Biurko z oświetleniem LED dla graczy.",
    price: 799,
    oldPrice: 899,
    image:
      "https://images.unsplash.com/photo-1587202372775-98973f546f1b?auto=format&fit=crop&w=400&q=80",
    promo: true,
    bestseller: false,
    rating: 4,
    tags: ["praca", "gaming", "dla niego"],
  },
  {
    slug: "perfumy-premium",
    name: "Perfumy Premium",
    description: "Ekskluzywne perfumy o wyjątkowym zapachu.",
    price: 399,
    oldPrice: 449,
    image:
      "https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=400&q=80",
    promo: true,
    bestseller: true,
    rating: 5,
    tags: ["dla niej", "dla niego", "luksus"],
  },
  {
    slug: "walizka-podrozna",
    name: "Walizka Podróżna XL",
    description: "Lekka, wytrzymała walizka na długie podróże.",
    price: 499,
    oldPrice: 599,
    image:
      "https://images.unsplash.com/photo-1582213782179-e0d53f98f2ca?auto=format&fit=crop&w=400&q=80",
    promo: false,
    bestseller: true,
    rating: 5,
    tags: ["podróże", "dla niej", "dla niego"],
  },
  {
    slug: "projektor-domowy",
    name: "Projektor Domowy Full HD",
    description:
      "Kino domowe w Twoim salonie z obrazem do 120 cali.",
    price: 899,
    oldPrice: 1099,
    image:
      "https://images.unsplash.com/photo-1582095133179-2988d1d64447?auto=format&fit=crop&w=400&q=80",
    promo: true,
    bestseller: false,
    rating: 4,
    tags: ["dom", "technologia", "dla rodziny"],
  },
  {
    slug: "mata-do-jogi",
    name: "Mata do Jogi Premium",
    description: "Antypoślizgowa mata do jogi i pilatesu.",
    price: 139,
    oldPrice: 169,
    image:
      "https://images.unsplash.com/photo-1599058917212-d750089bc07d?auto=format&fit=crop&w=400&q=80",
    promo: false,
    bestseller: false,
    rating: 4,
    tags: ["sport", "relaks", "dla niej"],
  },
];

/** prosta normalizacja kategorii do slugów z myślnikami */
function normalizeCategory(input?: string): string | undefined {
  if (!input) return undefined;
  const s = input.trim().toLowerCase();
  const map: Record<string, string> = {
    "dla niej": "dla-niej",
    "dla niego": "dla-niego",
    "dla dzieci": "dla-dzieci",
    "dla mamy": "dla-mamy",
    "dla taty": "dla-taty",
    "na urodziny": "na-urodziny",
    "urodziny": "na-urodziny",
  };
  if (map[s]) return map[s];
  // ogólny fallback: zamień spacje na myślniki i usuń polskie znaki
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** budujemy dane pod panel/admin seed bez undefined na polach opcjonalnych */
export const popularGiftsData: PopularGift[] = rawGifts.map((g) => {
  const priceCents =
    typeof g.price === "number" && !Number.isNaN(g.price)
      ? Math.round(g.price * 100)
      : 0;

  const sku =
    (g.slug || "ITEM")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) + "-SKU";

  const personalizeByName =
    /personalizowan|personalizacja|personalized/i.test(g.name || "");

  const categorySlug = normalizeCategory(g.category);

  const base: PopularGift = {
    name: g.name,
    slug: g.slug,
    priceCents,
    brand: "PopularGifts",
    sku,
    stock: g.stock ?? 10,
    personalize: g.personalize ?? personalizeByName,
    featured: !!(g.bestseller || g.promo),
    imageUrl: g.image,
  };

  // dodaj opcjonalne pola TYLKO gdy mamy wartości (żeby nie wstawić undefined)
  return {
    ...base,
    ...(g.description ? { description: g.description } : {}),
    ...(categorySlug ? { category: categorySlug } : {}),
  };
});

export default popularGiftsData;
