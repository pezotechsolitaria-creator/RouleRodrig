// Minimal service worker — required for Android/Chrome installability.
// Network-first so content is always fresh online, with a cached fallback
// for navigations when offline.
const CACHE = "rr-cache-v2";

// Precache the home page so the island guide / routes work offline after one visit
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(["/"]).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  event.respondWith(
    (async () => {
      try {
        const fresh = await fetch(request);
        // Cache same-origin navigations + static assets for offline fallback
        if (request.url.startsWith(self.location.origin)) {
          const cache = await caches.open(CACHE);
          cache.put(request, fresh.clone()).catch(() => {});
        }
        return fresh;
      } catch {
        const cached = await caches.match(request);
        if (cached) return cached;
        // Last resort: offline navigation falls back to the home page
        if (request.mode === "navigate") {
          const home = await caches.match("/");
          if (home) return home;
        }
        throw new Error("offline");
      }
    })()
  );
});
