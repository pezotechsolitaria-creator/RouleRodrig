// Service worker — correctness first.
//
// Pages (HTML) are fetched NETWORK-FIRST so the served HTML always matches the
// currently-deployed JS bundles. (A stale-cached HTML that points at old
// /_next hashes fails to hydrate → every onClick button goes dead. Never do
// that.) The homepage is ISR-cached at the edge, so network-first is still
// fast, and iOS launch images cover the cold-start gap.
//
// Immutable hashed build assets are cache-first (safe — their URL changes when
// they change). Everything else is network-first with an offline fallback.
const CACHE = "rr-cache-v51";
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
  if (url.pathname.startsWith("/admin") || url.pathname.startsWith("/api")) return;

  const sameOrigin = url.origin === self.location.origin;

  // ── Page navigations: NETWORK-FIRST (fresh HTML matches current JS) ──
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          if (fresh && fresh.ok && sameOrigin) {
            const cache = await caches.open(CACHE);
            cache.put(request, fresh.clone()).catch(() => {});
          }
          return fresh;
        } catch {
          const cache = await caches.open(CACHE);
          return (await cache.match(request)) || (await cache.match(SHELL)) || Response.error();
        }
      })(),
    );
    return;
  }

  // ── Immutable hashed build assets: cache-first ──
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
