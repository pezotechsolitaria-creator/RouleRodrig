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
// ── WHY NOT THE PUBLIC OSRM DEMO SERVER ─────────────────────────────────────
// router.project-osrm.org is explicitly documented as a DEMO with no uptime
// guarantee, no support, and a request cap, and its operators ask that it not be
// used in production. Wiring a customer-facing ETA to it would mean the ETA
// silently degrades the day they throttle us. It is supported here as an opt-in
// for evaluation, and refused unless the deployment names it deliberately.
//
// ── TURNING REAL ROUTING ON LATER ───────────────────────────────────────────
// Self-host OSRM (a Docker image plus the ~30 MB Mauritius OSM extract — the
// whole of Rodrigues is a rounding error), then set:
//
//   TRACKING_ROUTING_URL="https://osrm.example.com"
//
// Any OSRM-compatible endpoint works, including Valhalla or GraphHopper behind a
// compatibility layer. Nothing else in the app changes: callers ask for an ETA
// and get one, labelled with how it was derived.

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

function configuredRouterBase(): string | null {
  const raw = process.env.TRACKING_ROUTING_URL?.trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.hostname !== "localhost") return null;
    // The demo server, unless the deployment has explicitly accepted it. Left
    // reachable for evaluation; never the accidental default.
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

  const base = configuredRouterBase();
  if (!base) return fallback;

  try {
    const url =
      `${base}/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}` +
      `?overview=full&geometries=polyline&alternatives=false&steps=false`;
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

    return {
      eta: {
        minutes: Math.max(1, Math.ceil(r.duration / 60)),
        km: r.distance / 1000,
        source: "route",
      },
      polyline: r.geometry ? decodePolyline(r.geometry) : null,
    };
  } catch {
    // Timeout, DNS, TLS, malformed JSON — all the same answer. The approximation
    // is not a degraded mode here, it is the documented default.
    return fallback;
  }
}

/** Whether a real router is wired up, for the production-readiness report. */
export function routingProviderName(): string {
  const base = configuredRouterBase();
  if (!base) return "none (straight-line × road_factor)";
  try {
    return new URL(base).hostname;
  } catch {
    return "configured";
  }
}
