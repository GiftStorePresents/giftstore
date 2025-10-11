/* Gift Store SW */
const VERSION = "v2";
const STATIC_CACHE = `gs-static-${VERSION}`;
const RUNTIME_CACHE = `gs-runtime-${VERSION}`;
const ASSETS = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/offline.html",
  "/icons/icon-192.png",
  "/icons/icon-512.png"
];

self.addEventListener("install", (e) => {
  self.skipWaiting(); // natychmiast aktywuj nowy SW
  e.waitUntil(caches.open(STATIC_CACHE).then((c) => c.addAll(ASSETS)));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== STATIC_CACHE && k !== RUNTIME_CACHE)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim(); // przejmij kontrolę nad otwartymi kartami
    })()
  );
});

/**
 * Strategia:
 * - Nawigacje (HTML): network-first -> fallback do /offline.html
 * - Inne GET (css/js/img): stale-while-revalidate
 */
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const acceptsHTML = req.headers.get("accept")?.includes("text/html");

  if (acceptsHTML) {
    e.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(RUNTIME_CACHE);
          cache.put(req, fresh.clone());
          return fresh;
        } catch {
          const cached = await caches.match(req);
          return cached || (await caches.match("/offline.html"));
        }
      })()
    );
    return;
  }

  // inne zasoby → stale-while-revalidate
  e.respondWith(
    (async () => {
      const cached = await caches.match(req);
      const fetchPromise = fetch(req)
        .then(async (res) => {
          const cache = await caches.open(RUNTIME_CACHE);
          cache.put(req, res.clone());
          return res;
        })
        .catch(() => null);
      return cached || (await fetchPromise) || (await caches.match("/offline.html"));
    })()
  );
});
