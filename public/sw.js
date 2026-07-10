// Service worker tuned for a fast, splash-free launch.
//
// The native OS/PWA launch screen (Android's manifest splash, iOS's blank) is
// shown until the web app paints its first frame. On a cold start the cache may
// be gone, so a network-first strategy makes that first paint wait on the
// network — which is exactly the long black/native screen users see.
//
// Fix: serve the app shell (and hashed static assets) CACHE-FIRST so the very
// first paint is instant and hands straight to the in-page animated intro, then
// refresh the cache in the background (stale-while-revalidate).
const CACHE = "rr-cache-v12";
const SHELL = "/";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll([SHELL]).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Admin + API must always be fresh (and never cached).
  if (url.pathname.startsWith("/admin") || url.pathname.startsWith("/api")) return;

  const sameOrigin = url.origin === self.location.origin;

  // ── App shell (page navigations): stale-while-revalidate ──
  // Paint instantly from cache (kills the cold-start black screen), then update.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const cached = (await cache.match(request)) || (await cache.match(SHELL));
        const network = fetch(request)
          .then((res) => {
            if (res && res.ok && sameOrigin) cache.put(request, res.clone()).catch(() => {});
            return res;
          })
          .catch(() => null);
        // Serve cache immediately if we have it; otherwise wait on the network.
        return cached || (await network) || (await cache.match(SHELL)) || Response.error();
      })(),
    );
    return;
  }

  // ── Immutable hashed build assets: cache-first (instant, never change) ──
  if (sameOrigin && url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res && res.ok) cache.put(request, res.clone()).catch(() => {});
        return res;
      })(),
    );
    return;
  }

  // ── Everything else (images, fonts, tiles): network-first, cache fallback ──
  event.respondWith(
    (async () => {
      try {
        const fresh = await fetch(request);
        if (sameOrigin && fresh && fresh.ok) {
          const cache = await caches.open(CACHE);
          cache.put(request, fresh.clone()).catch(() => {});
        }
        return fresh;
      } catch {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === "navigate") {
          const home = await caches.match(SHELL);
          if (home) return home;
        }
        throw new Error("offline");
      }
    })(),
  );
});
