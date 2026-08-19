import "server-only";
import { approxEta, type Eta } from "./model";

// ── ROUTES AND ETAs, BEHIND ONE SEAM ────────────────────────────────────────
//
// Server-only on purpose. A routing provider that ever needs a key must not have
// that key in a browser bundle, and a router that ever needs rate limiting must
// have one place to limit.
//
// ── THE DEFAULT IS NO NETWORK AT ALL ────────────────────────────────────────
// Straight-line distance × road_factor ÷ avg_speed_kmh, using the dials already
// in dispatch_settings. It is an approximation and the UI says so — but it costs
// nothing, cannot rate-limit, cannot time out, and cannot be down. On an island
// 18 km across with one ring road, the error against a real route is small: the
// road_factor of 1.35 exists precisely because somebody measured that.
//
// ── WHERE THE ROUTES ACTUALLY COME FROM ─────────────────────────────────────
// A straight line between driver and destination is not a route. On Rodrigues
// it is actively misleading: the island is a ridge with a coast road, so the
// crow-flies distance from Port Mathurin to the airport is 10.2 km and the
// drive is 18.9 km. A dashed line across the middle tells a waiting passenger
// their taxi is roughly twice as close as it is.
//
// So the DEFAULT is a real router. Measured 2026-08-19, Port Mathurin ->
// Plaine Corail Airport:
//
//   routing.openstreetmap.de/routed-car   18.9 km · 41 min · 2175-point line
//   router.project-osrm.org               18.9 km · 41 min · 2175-point line
//   valhalla1.openstreetmap.de            16.6 km · 44 min
//
// OSM road coverage on Rodrigues is good enough to route on. That was not a
// given and it is why this was measured before being relied on.
//
// FOSSGIS's `routing.openstreetmap.de` is the default: it is the OSRM instance
// openstreetmap.org's own directions tab uses, community-funded rather than a
// demo, and needs no key. It is still somebody else's free service — see the
// failure policy below.
//
// `router.project-osrm.org` is explicitly documented as a DEMO with no uptime
// guarantee, and its operators ask that it not be used in production. It stays
// reachable behind TRACKING_ROUTING_ALLOW_DEMO for evaluation, never by default.
//
// ── FAILURE POLICY ──────────────────────────────────────────────────────────
// Every failure — timeout, 429, malformed JSON, DNS — falls through to the
// straight-line approximation, and the caller is TOLD which it got via
// `eta.source`. The UI labels an approximation as one. An ETA that is missing
// because a third party is down is worse than an honest estimate.

export type RouteResult = {
  eta: Eta;
  /**
   * The driven line, [lat,lng] pairs, for drawing. Null when no router is
   * configured — the map then draws a soft dashed direct line, which is honest
   * about being a direction rather than a route.
   */
  polyline: [number, number][] | null;
};

/** How long we will wait for a router before falling back. */
const ROUTING_TIMEOUT_MS = 2500;

// ── BEING A GOOD GUEST ──────────────────────────────────────────────────────
// Every watcher polls every 25 s, and each poll would otherwise be a fresh
// request to somebody else's free routing service. The route between a driver
// and their destination does not meaningfully change every 25 s, so it is
// cached against a QUANTISED origin: ~50 m of driver movement reuses the
// previous answer.
//
// Per-instance and best-effort — this is a serverless runtime, so it is a
// politeness measure and a latency win, never a correctness assumption.
const CACHE_TTL_MS = 30_000;
const CACHE_MAX = 200;
const routeCache = new Map<string, { at: number; value: RouteResult }>();

/** ~4 decimal places ≈ 11 m. Rounding to 3 ≈ 110 m, which is the reuse radius. */
function cacheKey(a: number, b: number, c: number, d: number): string {
  const q = (n: number) => n.toFixed(3);
  return `${q(a)},${q(b)}>${q(c)},${q(d)}`;
}

function cacheGet(k: string): RouteResult | null {
  const hit = routeCache.get(k);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) { routeCache.delete(k); return null; }
  return hit.value;
}

function cacheSet(k: string, value: RouteResult): void {
  if (routeCache.size >= CACHE_MAX) {
    // Oldest insertion first — Map preserves insertion order.
    const oldest = routeCache.keys().next().value;
    if (oldest !== undefined) routeCache.delete(oldest);
  }
  routeCache.set(k, { at: Date.now(), value });
}

/**
 * FOSSGIS community OSRM — the instance openstreetmap.org's own directions use.
 * No key, no account, and not a "demo". Overridable, and the first thing to
 * point at a self-hosted OSRM the day this platform outgrows a shared service.
 */
const DEFAULT_ROUTER = "https://routing.openstreetmap.de/routed-car";

function configuredRouterBase(): string | null {
  const raw = process.env.TRACKING_ROUTING_URL?.trim() || DEFAULT_ROUTER;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.hostname !== "localhost") return null;
    // The demo server, unless the deployment has explicitly accepted it.
    if (
      u.hostname.endsWith("project-osrm.org") &&
      process.env.TRACKING_ROUTING_ALLOW_DEMO !== "true"
    ) {
      return null;
    }
    return u.origin + u.pathname.replace(/\/$/, "");
  } catch {
    return null;
  }
}

/** Set TRACKING_ROUTING_URL="off" to force the approximation everywhere. */
function routingDisabled(): boolean {
  return process.env.TRACKING_ROUTING_URL?.trim().toLowerCase() === "off";
}

/**
 * OSRM returns a polyline5 string by default. Decoding it here rather than
 * adding @mapbox/polyline keeps the dependency list where it is; the algorithm
 * is twenty lines and has not changed since Google published it.
 */
function decodePolyline(str: string, precision = 5): [number, number][] {
  const factor = 10 ** precision;
  const out: [number, number][] = [];
  let index = 0, lat = 0, lng = 0;
  while (index < str.length) {
    let result = 0, shift = 0, b: number;
    do {
      b = str.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    result = 0; shift = 0;
    do {
      b = str.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    out.push([lat / factor, lng / factor]);
  }
  return out;
}

/**
 * An ETA, and a route if one is available.
 *
 * NEVER throws and never leaves a caller waiting: any failure — no router, a
 * timeout, a malformed answer, a 429 — falls through to the approximation, which
 * is always computable. A tracking screen that shows no ETA because a third
 * party is down is worse than one showing an honest estimate.
 */
export async function routeBetween(
  fromLat: number, fromLng: number, toLat: number, toLng: number,
  roadFactor: number, avgSpeedKmh: number,
): Promise<RouteResult> {
  const fallback: RouteResult = {
    eta: approxEta(fromLat, fromLng, toLat, toLng, roadFactor, avgSpeedKmh),
    polyline: null,
  };

  if (routingDisabled()) return fallback;
  const base = configuredRouterBase();
  if (!base) return fallback;

  const key = cacheKey(fromLat, fromLng, toLat, toLng);
  const cached = cacheGet(key);
  if (cached) return cached;

  try {
    // overview=simplified, NOT full. Measured on the airport run: `full` is 881
    // points / 2175 chars, `simplified` is 64 points / 255 chars — for the
    // IDENTICAL distance and duration. The extra 800 points are shape detail
    // finer than a phone can draw, sent every poll over mobile data.
    const url =
      `${base}/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}` +
      `?overview=simplified&geometries=polyline&alternatives=false&steps=false`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(ROUTING_TIMEOUT_MS),
      headers: { "User-Agent": "RouleRodrigues/1.0 (+https://roulerodrig.com)" },
      cache: "no-store",
    });
    if (!res.ok) return fallback;

    const body = (await res.json()) as {
      code?: string;
      routes?: { duration?: number; distance?: number; geometry?: string }[];
    };
    const r = body?.code === "Ok" ? body.routes?.[0] : null;
    if (!r || typeof r.duration !== "number" || typeof r.distance !== "number") {
      return fallback;
    }

    const result: RouteResult = {
      eta: {
        minutes: Math.max(1, Math.ceil(r.duration / 60)),
        km: r.distance / 1000,
        source: "route",
      },
      polyline: r.geometry ? decodePolyline(r.geometry) : null,
    };
    cacheSet(key, result);
    return result;
  } catch {
    // Timeout, DNS, TLS, malformed JSON — all the same answer. The approximation
    // is not a degraded mode here, it is the documented default.
    return fallback;
  }
}

/** Whether a real router is wired up, for the production-readiness report. */
export function routingProviderName(): string {
  if (routingDisabled()) return "off (straight-line × road_factor)";
  const base = configuredRouterBase();
  if (!base) return "none (straight-line × road_factor)";
  try {
    return new URL(base).hostname;
  } catch {
    return "configured";
  }
}
