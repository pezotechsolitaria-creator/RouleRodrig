# Live driver tracking (M109)

Real GPS from real drivers, on a map, for taxi, transfer and delivery — with no
paid map, tracking or routing service anywhere in it.

---

## 1. What was already here, and what was actually missing

The dispatch engine already had a geography (`dispatch_geography.sql`, m74–m77):
`driver_locations`, `update_driver_location()`, `haversine_km()`,
`dispatch_candidates()` with a radius ladder, and `dispatch_settings` holding
`stale_location_minutes`, `road_factor` and `avg_speed_kmh`.

**None of it had ever run.** On the live database before this work:

| | |
|---|---|
| `driver_locations` rows | **0** |
| callers of `update_driver_location()` in the app | **0** |
| `delivery_drivers` | 0 |
| `taxi_drivers` | 1 active, 0 with a base location |

So every dispatch decision ever made took the "position unknown" branch and
scored 0.25. And it could not have been otherwise for the fleet that exists:

```sql
driver_locations.driver_id references delivery_drivers(id)
```

The drivers doing the work are **taxi** drivers, who by the owner's decision have
no accounts. A taxi driver was *structurally incapable* of reporting a position.

M109 wires the existing engine to real screens and makes it reach both kinds of
driver. It adds one table.

---

## 2. The identity problem, which decided the architecture

Four parties take part in tracking. **Only one holds a Supabase JWT.**

| Party | Credential | JWT? |
|---|---|---|
| taxi / transfer driver | `taxi_drivers.driver_token` in a URL | ✗ |
| delivery driver | `delivery_drivers.user_id` (Supabase auth) | ✓ |
| customer | booking reference + the phone they booked with | ✗ |
| admin | `ADMIN_PASSWORD` cookie + service_role | ✗ |

Supabase Realtime's **private** channels authorise with RLS on
`realtime.messages`, which reads `auth.uid()`. Three of the four parties have
none, so **RLS cannot be the authorisation boundary for tracking.**

Our Next.js server is — which is not a compromise. It is already what guards
`/api/rides/track`, `/api/driver-home` and every `/api/admin/*` route here.

Therefore:

* every tracking table is **RLS-on with no policy and grants revoked**, reachable
  only through `SECURITY DEFINER` functions and the service-role client — the
  same posture `ride_offers` and `dispatch_settings` already take;
* the Realtime topic is named by an unguessable per-trip **capability key**
  (`trip_tracking.channel_key`, 64 hex = 256 bits, the same construction
  `ride_offers.token` uses), handed out only by a server route that has just
  checked a credential;
* **Broadcast is not the source of truth.** The database is, polled through a
  guarded endpoint that re-checks authorisation on every request.

### The honest cost of a public channel

Anyone who knows a topic name can also *write* to it, so a key-holder could
broadcast a false position. Holding the key already grants watching, and a
customer faking their own map fools nobody. The real mitigation is that the
tracking page **also polls `/api/tracking/trip` every 25 s**, which returns the
database's last-known position — so a spoofed or missing frame self-corrects
within one poll, and a dropped socket degrades to a slower dot rather than a
blank map.

---

## 3. How a position travels

```
  DRIVER'S PHONE
    watchPosition()                      every fix
      ├── broadcast  ──► Realtime topic  every 4 s   ephemeral, no DB write
      │                    trip-<channel_key>
      └── POST /api/tracking/ping        every 20 s  ← the authority
                 │                       + immediately on every status change
                 ▼
           record_driver_position()  (service_role)
                 │
                 ├──► driver_locations   "who is near this pickup"  → dispatch
                 └──► trip_tracking      "where is my taxi"         → watchers

  WATCHER (customer / admin)
      ├── subscribe  ──► same topic       smooth movement between fixes
      └── POST /api/tracking/trip        every 25 s  authority + freshness + ETA
```

**One write per twenty fixes.** High-frequency broadcast only runs while a driver
is *on a job*; while merely on duty, the 20-second database write is enough for
dispatch and the admin map.

`/api/tracking/ping` is the only path to the database, and it **resolves the
driver from a credential** — a taxi token, or `auth.uid()` via `current_driver()`.
There is no parameter in which a caller could name somebody else. The trip id is
checked against the one the database says is theirs, so a driver cannot publish
their position onto a stranger's map.

---

## 4. Files

### New — database (`supabase/migrations/20260818120000_m109_live_trip_tracking.sql`)
Applied to production as `m109a` … `m109d`.

| Object | What it is |
|---|---|
| `driver_locations` (altered) | now polymorphic: `driver_kind`, `heading`, `speed_kmh`, `tracking_status`, `trip_kind`, `trip_id`; PK is `(driver_kind, driver_id)` |
| `trip_tracking` (new) | one row per watched journey: the capability key, the endpoints, the last-known position |
| `ensure_trip_tracking()` | lazily starts a watch, so nothing in the four proven assignment paths had to be touched |
| `record_driver_position()` | the single writer, service_role only |
| `sane_heading()` | one definition of "a heading of 0 from a stationary phone is noise, not north" |
| `clear_driver_position()` | going off duty *erases* the position |
| `driver_advance_ride_by_token()` | **a taxi driver moves their own ride** |
| `driver_tracking_context()` / `delivery_tracking_context()` | what a driver's phone needs |
| `tracking_snapshot()` | the authoritative answer for a watcher |
| `admin_live_map()` | the whole fleet in one query |
| `sweep_trip_tracking()` | ends orphaned watches, erases old positions |
| `lookup_ride()` (extended) | additively returns `tripId` + `channelKey` |
| `taxi_driver_home()` (extended) | additively returns the job's id, key and coordinates |
| `ride_candidates()` (changed) | **prefers a fresh live fix over the static base** |
| `dispatch_candidates()` (changed) | one line: the `driver_locations` join now names `driver_kind` |

### New — app

```
lib/tracking/model.ts              pure: distance, bearing, staleness, ETA, vocabulary
lib/tracking/tiles.ts              swappable tile provider
lib/tracking/routing.ts            swappable routing provider (server-only)
lib/tracking/channel.ts            Realtime Broadcast publish/subscribe
lib/tracking/smooth-marker.ts      the animator
lib/tracking/useDriverTracking.ts  the driver's half
lib/tracking/useTripTracking.ts    the watcher's half
lib/tracking/model.test.ts         39 tests
lib/tracking/smooth-marker.test.ts 10 tests

components/tracking/TrackingMap.tsx      the map, for all three surfaces
components/tracking/DriverGpsStatus.tsx  why the dot is or is not there
components/tracking/DriverJobPanel.tsx   taxi Driver Mode
components/tracking/DeliveryTracking.tsx delivery Driver Mode
components/tracking/LiveTripView.tsx     the customer's screen
components/admin/LiveOperationsMap.tsx   the admin board

app/api/tracking/ping/route.ts     POST a position · DELETE go off duty
app/api/tracking/trip/route.ts     the authoritative snapshot
app/api/admin/live-map/route.ts    the fleet
app/admin/live/page.tsx            /admin/live
```

### Changed
`app/d/[token]/DriverHome.tsx` · `app/driver/DriverDashboard.tsx` ·
`app/taxi/track/TrackRide.tsx` · `app/api/driver-home/route.ts` ·
`components/admin/AdminShell.tsx` · `components/admin/CommandPalette.tsx` ·
`app/globals.css` · `public/sw.js` (v291) · `app/api/health/route.ts`

### New dependencies
**None.** Leaflet 1.9.4 and `@types/leaflet` were already in `package.json`.

---

## 5. Free services, and their real limits

| Service | Used for | Free limit | Where we sit |
|---|---|---|---|
| **Supabase Realtime** | position broadcast | 200 concurrent connections; **2,000,000 messages/month**; 256 KB max message | ~240 messages per 20-minute trip. 20 trips/day ≈ **144k/month**, ~7% of the allowance |
| **Supabase Postgres** | last-known position, trip state | existing project | 1 write per driver per 20 s while on duty |
| **OpenStreetMap tiles** | the map sheet | no hard number — the [OSMF Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/) forbids "heavy use", requires an identifying User-Agent/Referer, forbids bulk downloading, and permits blocking without warning | `maxZoom` capped at 18, `keepBuffer: 2`, `panTo` instead of `setView` while following. The whole island at z14 is a few hundred tiles |
| **Routing** | ETA + route line | none configured | Default is **no network call at all** — straight-line × `road_factor` ÷ `avg_speed_kmh`, labelled "approx" in the UI |

### The Realtime arithmetic
`4 s` publish interval → 15 messages/minute → 300 per 20-minute trip, and only
one subscriber per trip in the normal case. Broadcast runs **only while a driver
is on a job**, never merely while online. To stay inside the free tier the
things to watch, in order: number of *concurrent live trips* (connections), then
total trip-minutes per month (messages).

### If OSM ever blocks us
Set two environment variables and redeploy — see §7. Nothing else changes.

---

## 6. Browser and PWA GPS limits — stated plainly

**This is the honest ceiling of any web-based driver app**, and it is said in the
Driver Mode UI as well as here:

* **Page open and visible** — `watchPosition()` runs normally. ✅
* **Backgrounded** (another app on top, screen locked) — browsers throttle or
  suspend timers and may stop delivering positions. iOS Safari is strictest;
  Android Chrome is better but not guaranteed. ⚠️
* **Tab or PWA fully closed** — tracking stops completely. There is **no web API
  for background geolocation**: the Geolocation API is not available to a service
  worker, and Background Sync cannot read location. ❌

What is done about it:

* Driver Mode says *"Keep this page open while you drive. If you close it or lock
  your phone for a long time, your passenger stops seeing you move — that's a
  limit of the phone, not a fault."*
* The last good fix is persisted every 20 s, so a phone that sleeps leaves a
  truthful **"Last seen 3 min ago"** rather than a frozen dot claiming to be live.
* `visibilitychange` forces a fresh fix and an immediate write when the driver
  comes back.
* `keepalive: true` on the ping so the final position still lands if the tab is
  closed mid-request.

Anything better needs a native app (or Capacitor), which is outside the
zero-cost, no-install constraint this platform is built on.

---

## 7. Swapping the map tiles or the routing provider

### Tiles
```bash
NEXT_PUBLIC_MAP_TILE_URL="https://tiles.example.com/{z}/{x}/{y}.png?key=…"
NEXT_PUBLIC_MAP_TILE_ATTRIBUTION="© Example, © OpenStreetMap contributors"
NEXT_PUBLIC_MAP_TILE_MAX_ZOOM="19"          # optional
NEXT_PUBLIC_MAP_TILE_SUBDOMAINS="abc"       # optional
```
Anything speaking the XYZ/slippy convention drops in: self-hosted OSM, MapTiler,
Stadia, Thunderforest, Protomaps. **Both** URL and attribution are required —
a half-configured swap falls back to OSM rather than shipping a map that credits
the wrong people, which for any OSM-derived source is a licence breach.

CSP already permits it: `img-src 'self' data: blob: https:`.

### Routing
```bash
TRACKING_ROUTING_URL="https://osrm.example.com"
```
Any OSRM-compatible endpoint. Self-hosting is a Docker image plus the ~30 MB
Mauritius OSM extract — the whole of Rodrigues is a rounding error in it.

The public demo server `router.project-osrm.org` is **refused unless
`TRACKING_ROUTING_ALLOW_DEMO=true`** is also set. Its operators document it as a
demo with no uptime guarantee and ask that it not be used in production; wiring a
customer-facing ETA to it means the ETA silently degrades the day they throttle
us.

With no router configured, `routeBetween()` returns the approximation and the UI
labels it **"approx"**. Every failure mode — timeout, 429, malformed JSON, DNS —
falls through to the same answer, so the ETA can never be missing.

---

## 8. Tests performed

**Unit — 49 new tests, 1275 total, all passing**
* `model.test.ts` (39): distance against **values read out of the live database**
  (`haversine_km` agrees to 9 decimal places); bearing; the short-way-round turn
  at north; which GPS samples are lies (out-of-order, teleport, useless
  accuracy, jitter); freshness bands and their wording; ETA using the dispatch
  dials; the ETA pointing at the right end of the trip; and an assertion that no
  platform vocabulary leaks into customer-facing text.
* `smooth-marker.test.ts` (10): rAF driven by hand, so the animation is
  deterministic — walks through >15 distinct positions rather than teleporting,
  eases out, snaps on an impossible jump, retargets mid-flight without rewinding,
  stops on destroy, and never fights a user's pan.

**Security — 15 assertions executed AS `anon` and AS `authenticated`**, not by
asking `pg_catalog` what it thinks the grants are. On this codebase an
`auth.uid()`-null gate *passes* for anon (M28), so only a real attempt proves a
boundary. Confirmed: neither role can read `trip_tracking` or `driver_locations`,
call `record_driver_position`, `admin_live_map`, `lookup_ride`,
`tracking_snapshot`, `driver_tracking_context`, `ensure_trip_tracking` or
`clear_driver_position`. `driver_advance_ride_by_token` **stays** anon-callable
(a token is a taxi driver's only identity) and a bogus token achieves nothing.

**End-to-end lifecycle** against the real schema, inside a transaction that was
deliberately aborted so production kept exactly its 4 rides and 0 tracking rows:
channel key minted (64 chars) → position + heading + age reach the snapshot →
a stationary heading of 0 is discarded → **the customer's two-factor lookup
returns the same key the driver got** → the reference *alone* reveals nothing →
the step ladder advances → an illegal jump is refused without erroring → the
trip ends, **the capability key is withdrawn**, and the driver is released.

**Build**: `npm run build` clean; `/admin/live` and `/api/admin/live-map` present.
**Typecheck**: `tsc --noEmit` clean.
**Browser**: Leaflet mounts at 420 px, **18/18 OSM tiles loaded** from
`tile.openstreetmap.org`, driver marker present and pulsing, 2 place pins, route
line drawn, attribution rendered. (The animation itself is unobservable in this
project's headless pane — it runs hidden, so `requestAnimationFrame` never fires;
measured `rafFiredCount: 0`, `document.hidden: true`. That is why the animator is
covered by deterministic unit tests instead.)

---

## 9. Remaining production risks

| Risk | Severity | Detail |
|---|---|---|
| **No driver has ever done this** | High | `driver_locations` was empty. The first real driver going on duty is the first true test of permission prompts on their actual phone. Watch `/admin/live` the first day. |
| **Background suspension** | High | §6. A driver who locks their phone stops being tracked. Mitigated by honest "last seen", not solved. |
| **iOS Safari geolocation in a non-installed tab** | Medium | Works, but is throttled harder. The existing "add to Home Screen" prompt (already there for push) matters here too. |
| **Public-channel spoofing** | Low | A key-holder could broadcast a false position. Corrected within one 25-second poll; impact is limited to a view the holder already had. |
| **OSM tile blocking** | Low | Hobby-scale traffic, but the policy permits blocking without warning. §7 is the ten-minute fix. |
| **Realtime free-tier ceiling** | Low | ~7% of the message allowance at 20 trips/day. Concurrent *connections* bite before messages do. |
| **Approximate ETA** | Low | Straight-line × 1.35 ÷ 35 km/h. Labelled "approx" everywhere it appears. Real routing is one env var away. |
| **`sweep_trip_tracking()` is not scheduled** | Medium | It exists and is verified, but nothing calls it yet. See below. |

### The one thing left to wire
`sweep_trip_tracking()` should run on the existing cron. It ends watches whose
ride or delivery finished, ends anything older than 12 hours, erases positions
from trips ended more than 2 hours ago, and deletes driver positions untouched
for 6 hours. Without it, a driver whose phone died mid-trip leaves a live
capability key and a last-known position behind indefinitely.

Add to `app/api/cron/reminders/route.ts` (or a new cron route) alongside the
existing `sweep_ride_offers()` call:

```ts
await admin.rpc("sweep_trip_tracking");
```

---

## 10. Things that were deliberately *not* built

* **A second location table.** "Where is this driver now" is one question with
  one answer; `driver_locations` became polymorphic instead of gaining a
  taxi-shaped twin.
* **A second status ladder for deliveries.** `/driver` already advances through
  `advance_delivery()`. Tracking added position and nothing else.
* **A Leaflet marker plugin.** `Leaflet.MovingMarker` (last released 2015) and
  `Leaflet.MarkerMotion` animate along a *known* path; live tracking is the
  opposite problem — the path is unknown and the animation must retarget
  mid-flight. The technique is sixty lines and is now unit-tested.
* **PostGIS.** The reasoning in `dispatch_geography.sql` still holds: revisit at
  >2,000 located providers, or when a zone needs a real boundary.
* **Wiring tracking into the four assignment RPCs.** `ensure_trip_tracking()` is
  lazy on purpose — a fault in tracking must never cost a driver a fare.
