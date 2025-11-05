// src/components/CategoryTiles.jsx
import { useEffect, useState, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import SmartImage from "./SmartImage";
import { API_BASE } from "../api";

/* =========================
 * Stałe / helpers
 * ========================= */
const SOURCE_UNCAT_SLUG = "bez-kategorii";

function safeJoin(base, path) {
  if (!path) return "";
  try {
    if (/^https?:|^data:/.test(path)) return path; // absolutne → zostaw
    return path.startsWith("/") ? `${base}${path}` : `${base}/${path}`; // względne → doklej API_BASE
  } catch {
    return path;
  }
}

function withVersion(url, v) {
  if (!url) return url;
  try {
    const u = new URL(url, window.location.origin);
    u.searchParams.set("v", String(v));
    return u.toString().replace(window.location.origin, "");
  } catch {
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}v=${encodeURIComponent(String(v))}`;
  }
}

function normalizeCategories(payload) {
  const arr = Array.isArray(payload)
    ? payload
    : payload?.items || payload?.categories || [];

  return (arr || []).map((c) => ({
    id: c.id || c.slug,
    name: c.name,
    slug: c.slug,
    showInTiles: c.showInTiles !== false,
    showInHero: c.showInHero === true,
    imageUrl: c.imageUrl || c.image_url || null,
    // count nadal możemy zostawić w danych, ale NIE używamy go w UI
    count:
      c?._count?.products ??
      c?.count ??
      (typeof c?.products === "number" ? c.products : undefined),
    updatedAt: c.updatedAt || null,
  }));
}

async function safeFetchJson(url, init) {
  const r = await fetch(url, init);
  const txt = await r.text();
  let json = {};
  try {
    json = txt ? JSON.parse(txt) : {};
  } catch {}
  if (!r.ok) {
    const msg = json?.error || json?.message || txt || `HTTP ${r.status}`;
    throw new Error(msg);
  }
  return json;
}

/* =========================
 * Component
 * ========================= */
export default function CategoryTiles() {
  const [cats, setCats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [imgVersion, setImgVersion] = useState(Date.now()); // cache-busting

  const fetchCats = useCallback(async () => {
    setLoading(true);
    setErr("");

    try {
      // ✅ tylko PUBLICZNY endpoint (proxy przez Vite)
      const data = await safeFetchJson(`${API_BASE}/api/categories`, {
        cache: "no-store",
      });

      const list = normalizeCategories(data).filter(
        (c) => c.showInTiles && c.slug !== SOURCE_UNCAT_SLUG
      );

      setCats(list);
    } catch (e) {
      setErr(e?.message || "Nie udało się pobrać kategorii.");
      setCats([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      await fetchCats();
      if (!alive) return;
    })();
    return () => {
      alive = false;
    };
  }, [fetchCats]);

  // 🔄 auto-odświeżenie po zmianach w Adminie
  useEffect(() => {
    const reload = () => {
      setImgVersion(Date.now());
      fetchCats();
    };
    window.addEventListener("categories:refresh", reload);
    return () => window.removeEventListener("categories:refresh", reload);
  }, [fetchCats]);

  const visibleCats = useMemo(
    () => cats.slice(0, 12).sort((a, b) => a.name.localeCompare(b.name)),
    [cats]
  );

  /* =========================
   * Render
   * ========================= */
  if (loading) {
    return (
      <section id="categories" className="my-10 md:my-12">
        <div className="mx-auto max-w-[1200px] px-4 md:px-6">
          <h3 className="text-2xl md:text-3xl font-extrabold mb-6 md:mb-7 text-mainRed">
            Wybierz kategorię prezentów
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5 md:gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-[22px] p-[2px] bg-gradient-to-br from-mainRed via-gold to-mainRed">
                <div className="rounded-[20px] overflow-hidden aspect-[16/10] bg-neutral-200 dark:bg-[#0f1424]">
                  <div className="w-full h-full animate-pulse bg-neutral-300/60 dark:bg-white/10" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (err || !visibleCats.length) return null;

  return (
    <section id="categories" className="my-10 md:my-12">
      <div className="mx-auto max-w-[1200px] px-4 md:px-6">
        <h3 className="text-2xl md:text-3xl font-extrabold mb-6 md:mb-7 text-mainRed">
          Wybierz kategorię prezentów
        </h3>
      </div>

      <div className="mx-auto max-w-[1200px] px-4 md:px-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5 md:gap-6">
          {visibleCats.map((cat) => {
            const hasImg = !!cat.imageUrl;
            const imgSrc = hasImg
              ? withVersion(safeJoin(API_BASE, cat.imageUrl), imgVersion)
              : `https://source.unsplash.com/800x600/?${encodeURIComponent(
                  cat.slug || cat.name || "gift"
                )}`;

            return (
              <Link
                key={String(cat.id) + ":" + imgVersion}
                to={`/categories/${cat.slug}`}
                aria-label={cat.name}
                className="group block focus:outline-none focus-visible:ring-4 focus-visible:ring-gold/40 rounded-[22px]"
              >
                <div className="relative rounded-[22px] p-[2px] bg-gradient-to-br from-mainRed via-gold to-mainRed shadow-lg transition-[filter,box-shadow] duration-300 group-hover:shadow-gold">
                  <div className="relative rounded-[20px] overflow-hidden bg-neutral-200 dark:bg-[#0f1424] aspect-[16/10]">
                    <SmartImage
                      src={imgSrc}
                      alt={cat.name}
                      fill
                      className="rounded-[20px]"
                      imgClassName="rounded-[20px] object-cover transition-transform duration-500 ease-out group-hover:scale-[1.06]"
                      onError={(e) => {
                        try {
                          e.currentTarget.style.display = "none";
                        } catch {}
                      }}
                    />

                    <div className="absolute inset-0 rounded-[20px] bg-gradient-to-t from-black/45 via-black/10 to-transparent z-10 group-hover:from-black/55 transition-colors" />

                    <div
                      className="absolute inset-0 rounded-[20px] z-10 pointer-events-none hidden dark:block"
                      style={{
                        background:
                          "radial-gradient(600px 260px at 78% 22%, rgba(255,215,0,.18), transparent 70%)," +
                          "radial-gradient(520px 220px at 18% 88%, rgba(215,38,61,.22), transparent 70%)",
                      }}
                    />

                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex justify-center">
                      <span
                        className="
                          inline-flex items-center justify-center px-5 py-2 rounded-full
                          text-white font-extrabold tracking-wide
                          bg-black/45 backdrop-blur [box-shadow:0_6px_22px_rgba(0,0,0,0.25)]
                          group-hover:bg-black/55 group-hover:text-gold transition-colors
                          whitespace-nowrap truncate
                          text-[17px] sm:text-[17px] md:text-[18px] lg:text-[19px]
                          max-w-[90%]
                        "
                        title={cat.name} // ✅ bez liczby produktów
                      >
                        {cat.name}
                      </span>
                    </div>

                    <div className="pointer-events-none absolute inset-0 rounded-[20px] ring-0 ring-gold/0 group-hover:ring-4 group-hover:ring-gold/20 transition-all duration-300" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
