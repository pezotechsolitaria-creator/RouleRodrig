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
// v95 — M9/M10 release: stale-quote guard (RR012), payment-ledger fix and
// checkout idempotency. Bumping evicts every older cache on activate, so no
// client can keep running a checkout bundle that predates those fixes.
// v124 — new logo + continuous spin. The icons had ALREADY been deployed and
// were byte-identical on the origin, yet devices kept showing the old mark:
// runtime-cached images survive a deploy on their own, so shipping an asset is
// not the same as delivering it. This bump is what evicts them.
// Deliberately ahead of BOTH sides of a rebase conflict: main had gone back to
// v122 while v123 was already live, and a version that moves backwards cannot
// evict anything — an existing client keeps its cache unless the name changes.
// v125 — the iOS splash screens carry the new mark too.
// v126 — M47 partner application categories.
// v128 — the mark becomes a rotating cube. Skips v127 deliberately: main had
// already taken sw.js to v127 while app/api/health/route.ts still read v126, so
// v127 named two different builds. A cache version is only useful as an
// identifier if it is unique, so this moves past it and restores the mirror.
// v129 — the food platform. /food is a different page than it was, and the old
// one is sitting in a lot of runtime caches.
// v130 — marketplace structured data + shops in the sitemap. A separate number
// from v129 deliberately: two parallel branches both reached for v129, and a
// cache name that identifies two different builds identifies neither.
const CACHE = "rr-cache-v133";
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
