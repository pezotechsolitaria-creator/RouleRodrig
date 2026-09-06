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
// v134 — food stops speaking marketplace: /cart, /checkout and /orders take
// their nouns from the seller, and a food order no longer offers "continue
// shopping" into the shop directory.
// Past v133, which main reached for at the same time this branch did. Two
// builds under one cache name is the failure v128's note describes, and it is
// cheaper to burn a number than to debug it later.
// v135 — partner applicants are told the decision. Same story as v134: main and
// this branch both reached for 134, so this one steps past rather than share it.
// v136 — the events checkout, and the receipt upload on /orders/track. Third
// time two branches reached for the same number; burning one is still cheaper
// than two builds sharing a cache name.
// v137 — the cube's motion redesign. Fourth collision; same resolution.
// v138 — three separate carts (food / shop / events), the quick-action grid and
// the homepage cards. The cart moved to NEW localStorage keys, so a client still
// running the old bundle would keep writing to a key nothing reads any more —
// this bump is what stops that.
// v139 — forces a fresh CSS chunk for the cube motion redesign, which deployed
// under v137 but was served from a stale build artifact. Fifth number collision.
// v140 — the ticket scanner, and the buyer QR on both order pages. SIXTH time
// two branches reached for the same number. The pattern is now the rule rather
// than the exception, which is the argument for deriving this at build time from
// the commit sha instead of incrementing it by hand.
// v141 — HOTFIX: /checkout returned a 500. A server component was importing a
// plain value from a "use client" module and got a client reference back.
// v142 — the pickup location everywhere it matters, and a service worker that
// actually notices a new build instead of serving yesterday's homepage.
// v143 — the ticket email, event status wording, and venue capacity.
// v144 — quick actions become intents (massage/fishing/sea trips added, food,
// shops and events removed in favour of their stronger entry points), taxi and
// transfers finally separate, and the events carousel.
// v147 — door staff + managed ticketing. Also repairs a live drift: main had
// sw.js on v146 while /api/health still read v145, so v146 named two different
// builds. The sw-cache test caught it on rebase, which is what it is for.
// v148 — unified tracking at /track (one reference finds a rental, a place
// booking or an order) and card-first beach/viewpoint discovery.
// Also repairs a real drift the sw-cache test caught: sw.js was on v146 while
// /api/health still reported v145, after a rebase resolved one side only.
// v150 — the tracking card names the vehicle instead of its database slug.
// v151 — /orders becomes "Your activity": rentals and place bookings appear
// alongside orders, so the signed-in half of Suivi covers everything too.
// v152 — hero videos. Sixth number collision with a parallel branch; stepping
// past is still cheaper than two builds sharing one cache name.
// v154 — a YouTube link in the hero now plays. It was rendered in a <video>,
// which fetches HTML, fails to decode, and silently unmounted the whole layer.
// Past v153, which a parallel branch took at the same moment.
// v155 — the admin can finally create and publish an event. Seventh number
// collision with a parallel branch; stepping past, as ever.
// v156 — THE hero video fix: the CSP never declared media-src, so every clip
// served from Supabase Storage was blocked and the layer silently unmounted.
// v159 — commerce finally has a door: an Order tab and an /order hub, because
// Food, Shops and Tickets were reachable only from the homepage.
// v166 — the visitor's tab bar is off every console, and Track became Account:
// one page that lists whichever dashboards your own account actually has.
// (Past v165, taken by a parallel branch at the same moment.)
// v167 — the hero's poster-to-video fade comes back down to 180ms: 260ms was
// smooth but read as the still lingering.
// v175 — delivery fees and car body styles are the owner's to set, and the
// fleet grew a second filter row, so the shipped bundle changed.
// v177 — the vehicle deposit is owner-set, and activities are paid in full to
// confirm rather than leaving a balance for the day.
// v178 — Ti Roulé is back in the middle of the tab bar, so the cached shell has
// to be refetched or the old order keeps rendering.
// v179 — rentals and activities can upload proof of a bank transfer, and the
// owner can open it from /admin instead of scrolling WhatsApp.
// v180 — a Money desk that lists everyone waiting on a payment decision, and
// an email the moment somebody says they have paid.
// v194 — owner alerts can no longer be switched off by a missing env var,
// and /admin now says out loud which inbox they go to.
// v195 — refunds: a cancelled paid order now opens a tracked obligation
// the customer, the shop and the owner can all see.
// v197 — a rental is checked with its partner BEFORE anyone pays; approval
// reserves the vehicle for a stated, disclosed window.
// v198 — refunds are chased until they are sent, repeat taxi no-shows are held
// for a phone call, and the refund policy says who actually returns the money.
// v199 — /admin/food now says when a kitchen is hidden by an archived owner
// account, the one reason no screen could show.
// v200 — anything left waiting an hour now phones the owner on WhatsApp,
// and the Command Centre says whether that is actually armed.
// v201 — a dish with no photograph gets a designed tile instead of an empty
// box; 17 of 19 live dishes had no image and the menu looked unfinished.
// v202 — the Command Centre reports WhatsApp escalation correctly: an empty
// category list means ALL, so both live numbers are armed.
// v203 — /food is two dishes across on a phone again, the way a menu reads,
// with the price no longer breaking in half at that width.
// v204 — /food swipes again: scroll-snapping rails, two dishes visible with
// a peek of the third, and the price no longer breaking in half.
// v205 — a taxi driver who cannot turn alerts on is now TOLD why, instead
// of the switch silently doing nothing.
// v206 — every dish can show the kitchen's WhatsApp, so a visitor who
// cannot make a local bank transfer still has a way to order.
// v207 — "Blocked in settings" is no longer a dead end: it explains that the
// SITE permission differs from the phone permission, and offers Check again.
// v208 — closes the provider=manual bypass, and checkout now shows the
// seller's WhatsApp to a customer who cannot make a local bank transfer.
// v209 — whether a driver has a registered phone is now its own column,
// not two words of grey micro-text under the accept rate.
// v210 — taxi drivers are visible again (a policy with no grant showed none),
// no fare is quoted, and admin can onboard a driver with a QR.
// v211 — a shop owner can publish their own WhatsApp from /merchant, so a
// customer who cannot bank-transfer has someone to ask.
// v212 — a Send test notification button in /admin proves the push chain
// end to end and names whichever of its six invisible links is broken.
// v213 — the driver page can be installed to the home screen, and the
// blocked-notifications message names the exact route for that browser.
// v214 — a seller can finally edit their own shop: name, description,
// address, map pin and contact, from /merchant/profile.
// v215 — allowing notifications now sends a confirmation push immediately,
// Kitchen and Taxi alert categories exist, and autofill cannot poison a number.
// v217 — Turn on rebuilds the push subscription instead of reusing a stale
// one, and reports whether a notification was actually accepted.
// v218 — the alerts page leads with browser notifications; WhatsApp is
// labelled as the backup it now is.
// v219 — a driver who lost the link can get back in at /d with their
// phone number and a 6-character code.
// v220 — a food order carrying proof of payment stays on the kitchen
// board for 7 days instead of 24 hours.
// v221 — a driver opens their page from Account with just a code.
// v222 — private hire can be booked without inventing a destination.
// v223 — a shop is woken on its own phone when an order lands.
// v224 — the hero video appears again: a cued YouTube player could
// suppress it forever.
// v225 — the hero YouTube video appears again: a cued player could hold
// it invisible forever.
// v226 — the hero video keeps playing once started, and a failed upload
// says why instead of hanging on "Uploading…".
// v227 — a stay is priced by the night, and the total is shown before booking.
// v228 — modals open above the header again; the hero stops showing YouTube chrome.
// v229 — hiking gets its own guide at /guide/hiking, and 20 dead components go.
// v230 — hiking guides are people now: admin-managed, reached on WhatsApp.
// v231 — listing cards cycle through their photos instead of showing one.
// v232 — dishes and marketplace products cycle their photos too.
// v233 — the YouTube hero plays on Android and iPhone, or offers a tap.
// v234 — a large item is dispatched only to a car or a van.
// v235 — the hero has no Play button on it again.
// v236 — Beaches & Viewpoints fuse; Delivery takes the freed quick action.
// v237 — the phone field is dressed again, and viewpoints sit above the fold.
// v238 — the admin sidebar can find hiking guides.
// v239 — the delivery form uses the booking form's fields.
// v240 — experiences split by day and night.
// v241 — night changes the light, and curated shelves land.
// v242 — a day-only or night-only experience says so on its card.
// v243 — the day/night switch comes off the individual vertical pages.
// v244 — one shared category vocabulary across every experience vertical.
// v245 — sapphire dark palette; sponsors and the announcement bar connected.
// v276 — Curated gets its own page, and its own place in the admin.
// v277 — both worlds get a page and an editor; Curated is dark copper again.
// v278 — the first screen carries the hero, the actions and the first cards.
// v279 — rentals are back on both worlds; the sparkle pill is gone.
// v280 — Authentic is the homepage again; Curated gains cards, events, reviews.
// v281 — Curated owns its cards and tiles; editing them leaves the homepage alone.
// v282 — Curated drops the duplicate shortcuts and the grid; a chauffeur joins.
// v283 — Curated stays your home; the header stops clipping; the hero button toggles.
// v284 — the footer reaches the curated world, repainted.
// v285 — no flash on "/", and a private chauffeur is its own product.
// v286 — Authentic gets its outdoors and its island life on the homepage.
// v287 — a YouTube link works in the curated hero too.
// v288 — the world switch works on every page again.
// v289 — the hero video follows you into Curated.
// v290 — People & Operations: one desk for merchants and delivery partners.
// v291/v292 — taken by the Curated hero background on main while this branch
// was in flight. SEVENTH time two branches reached for the same number.
// v293 — M109 live driver tracking. The driver's page, the customer's tracking
// screen and the admin map all ship new client bundles, and globals.css gains
// the map styles. A driver still running an older bundle would have no way to
// advance their own ride, which is the one thing this release exists to give
// them — so this bump is what actually delivers it. Stepping past 292 rather
// than sharing it: a cache name that identifies two builds identifies neither.
// v294 — satellite basemap, real road routing, the GPS quality pipeline, and
// the live view on delivery and in admin. New client bundles everywhere and new
// map CSS in globals.css; a client on v293 would keep drawing straight lines
// over street tiles.
// v295 — the satellite basemap changes provider for LICENCE reasons (Esri out,
// EOX 2016 CC BY 4.0 in), plus fleet presence and the recent-path trail. A
// client left on v294 would keep requesting Esri tiles this platform is not
// licensed to use commercially, so this bump is the thing that actually stops
// that.
// v296 — the road path is finally REACHABLE. The map and the OSRM call were
// both gated on a driver position that has never existed in production, so no
// customer had ever seen a route. A client left on v295 keeps the old gate and
// keeps showing a paragraph where the map belongs.
// v297 — the camera works again, and the server can read the visitor's language.
// v298 - the booking form and order tracking speak all three languages.
// v299 - signing in and resetting a password speak all three languages.
// v300 - the two pages that recruit partners speak all three languages.
// v301 - the account and every order screen speak all three languages.
// v302 - the app shell, dish panel and screen-reader labels speak all three languages.
// v303 - the organiser console speaks all three languages.
// v304 - the last of the customer-facing English is translated.
// v305 - every client-rendered customer string is translated.
// v306 - event cards get a Get tickets button, and stop promising cash at the door.
// v308 - events come back: the section, the routes and the sitemap.
// v309 - the kitchen can see what to cook in total, not one ticket at a time.
// v310 - All day never merges two kitchens into one pan.
// v311 - the product page prices what you are actually taking.
const CACHE = "rr-cache-v329";
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

// ── Push: a job exists, and the driver is not looking at the page ───────────
//
// This is the only reason the delivery network works without a dispatcher.
// Everything is defended, because a service worker that throws in `push` shows
// the browser's own "This site has been updated in the background" notice —
// which tells the driver nothing and looks broken.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  const title = data.title || "Roulé Rodrigues";
  const options = {
    body: data.body || "",
    // /icons/icon-192.png was a 404 — the assets live at the ROOT of /public,
    // not in an /icons folder. Chrome silently fell back to its generic bell,
    // so the notification carried no branding at all. A wrong icon path never
    // errors; it just quietly looks like somebody else's notification.
    icon: "/icon-192.png",
    // The badge is the small monochrome glyph in the status bar. Android
    // silhouettes it, so the maskable variant (full-bleed, no transparent
    // margin) survives that treatment where the padded icon turns to mush.
    badge: "/icon-192-maskable.png",
    // Same tag replaces rather than stacks, so a driver who missed three
    // updates about one delivery sees the current state, not a pile.
    tag: data.tag || "rr",
    data: { url: data.url || "/driver" },
    // A delivery offer expires. Keeping it on screen until dismissed is the
    // difference between earning and finding out too late.
    requireInteraction: Boolean(data.urgent),
    vibrate: data.urgent ? [200, 80, 200] : undefined,
    timestamp: Date.now(),
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/driver";

  // Focus the tab the driver already has open rather than piling up new ones —
  // they are one-handed on a scooter, not managing windows.
  //
  // ── THE TAP THAT LANDED ON THE HOMEPAGE ────────────────────────────────────
  // The old order was focus-then-navigate, and it bailed out after the focus
  // when client.navigate was unsupported (iOS home-screen PWAs, notably). So a
  // driver whose open tab happened to be the homepage tapped "a job is
  // waiting", the homepage came to the front, and nothing else happened — the
  // exact broken journey drivers reported. Now: navigate an existing tab FIRST
  // and only then focus it, and if that tab cannot be navigated, open a fresh
  // window at the target instead of stranding the tap on the wrong page.
  // Matching also compares pathname (plus query when the payload carries a
  // deep link), not substring — "/driver?delivery=x" must prefer a tab already
  // on /driver and then bring it to the right card.
  event.waitUntil(
    (async () => {
      const targetUrl = new URL(target, self.location.origin);
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });

      // A tab already showing the exact target (path AND query): just focus.
      // A tab on the right page but the wrong query (yesterday's job): try to
      // re-navigate it to this notification's deep link before focusing.
      for (const client of all) {
        let u;
        try { u = new URL(client.url); } catch { continue; }
        if (u.origin !== targetUrl.origin || u.pathname !== targetUrl.pathname) continue;
        if (!("focus" in client)) continue;
        if (u.search !== targetUrl.search && "navigate" in client) {
          try { await client.navigate(targetUrl.href); } catch { /* focus is still right */ }
        }
        return client.focus();
      }

      // Some other page of ours is open: navigate it to the target, THEN focus.
      // If it cannot navigate, fall through to a fresh window rather than
      // fronting an unrelated page.
      const open = all.find((c) => "focus" in c && "navigate" in c);
      if (open) {
        try {
          await open.navigate(targetUrl.href);
          return open.focus();
        } catch { /* fall through */ }
      }
      return self.clients.openWindow(targetUrl.href);
    })(),
  );
});
