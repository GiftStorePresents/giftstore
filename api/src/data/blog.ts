// src/data/blog.ts
export type BlogItem = {
  slug: string;
  title: string;
  excerpt: string;
  description?: string;
  content: string;
  image?: string | null;
  tags?: string[];
  author?: string;
  publishedAt: string; // ISO
  updatedAt?: string;  // ISO
};

const now = Date.now();

export const BLOG_FAKE: BlogItem[] = [
  {
    slug: "prezenty-dla-niej-2025",
    title: "Top 15 prezentów dla Niej (2025)",
    excerpt: "Pomysły od 50 do 500 zł — eleganckie, praktyczne i na każdą okazję.",
    description: "Zestaw inspiracji prezentowych dla Niej: od biżuterii po relaks w domu.",
    content:
      "## Pomysły na prezent\n\n1. Personalizowana biżuteria\n2. Zestaw SPA do domu\n3. Notes / planner premium\n\n**Wskazówka:** dołącz kartkę z życzeniami — zwiększa efekt wow!",
    image:
      "https://images.unsplash.com/photo-1519682337058-a94d519337bc?auto=format&fit=crop&w=1200&q=80",
    tags: ["dla-niej", "inspiracje", "poradnik"],
    author: "Gift Store",
    publishedAt: new Date(now - 1000 * 60 * 60 * 24 * 10).toISOString(),
    updatedAt: new Date(now - 1000 * 60 * 60 * 24 * 7).toISOString(),
  },
  {
    slug: "prezenty-dla-niego-2025",
    title: "Co kupić dla Niego? 12 strzałów w dziesiątkę",
    excerpt: "Elektronika, akcesoria EDC, a może doświadczenie? Zebraliśmy najlepsze propozycje.",
    description: "Lista prezentów dla mężczyzny — praktyczne i oryginalne.",
    content:
      "### Dla fana gadżetów\n- Powerbank 20k mAh\n- Organizer na biurko\n\n### Dla aktywnych\n- Bidon termiczny\n- Ręcznik szybkoschnący",
    image:
      "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=1200&q=80",
    tags: ["dla-niego", "inspiracje"],
    author: "Gift Store",
    publishedAt: new Date(now - 1000 * 60 * 60 * 24 * 6).toISOString(),
    updatedAt: new Date(now - 1000 * 60 * 60 * 24 * 5).toISOString(),
  },
  {
    slug: "pakowanie-prezentow-trzy-szybkie-sposoby",
    title: "3 szybkie sposoby na eleganckie pakowanie prezentów",
    excerpt: "Papier, wstążka i jeden trik — efekt butikowy w 3 minuty.",
    description: "Krótki poradnik o estetycznym pakowaniu prezentów.",
    content:
      "- Użyj papieru kraft + kontrastowej wstążki\n- Zastosuj naklejkę z inicjałami\n- Dodatkowo gałązka eukaliptusa 🌿",
    image:
      "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1200&q=80",
    tags: ["poradnik", "pakowanie"],
    author: "Gift Store",
    publishedAt: new Date(now - 1000 * 60 * 60 * 24 * 2).toISOString(),
    updatedAt: new Date(now - 1000 * 60 * 60 * 24 * 1).toISOString(),
  },
];
