// ── THE RULES OF A LIVE TRIP, WITH NO SERVER AND NO MAP ─────────────────────
//
// Pure functions only. Everything here is testable without a database, a
// browser, a socket or a tile, which is the point: the parts of tracking most
// likely to be wrong are the arithmetic (bearing, distance, ETA) and the
// judgement calls (is this fix stale? is this jump real?), and those are exactly
// the parts a manual test on a phone cannot check.
//
// lib/rides/model.ts does the same job for the ride lifecycle. Same shape, same
// reason.

/** One position report. The wire format for Broadcast, and what the DB stores. */
export type Fix = {
  lat: number;
  lng: number;
  /** Degrees clockwise from true north. Null when the device would not say. */
  heading: number | null;
  speedKmh: number | null;
  /** Metres of horizontal uncertainty, straight from the Geolocation API. */
  accuracyM: number | null;
  /** Epoch milliseconds, taken from the DEVICE that produced the fix. */
  at: number;
};

export type TrackingStatus =
  | "pending"
  | "en_route_pickup"
  | "at_pickup"
  | "on_trip"
  | "ended";

/**
 * What the customer reads at each stage.
 *
 * Deliberately not the status name, for the same reason CUSTOMER_STATUS in
 * lib/rides/model.ts is not: "en_route_pickup" is a word about our plumbing.
 */
export const TRACKING_CUSTOMER_STATUS: Record<TrackingStatus, string> = {
  pending: "Getting ready",
  en_route_pickup: "On the way to you",
  at_pickup: "Waiting for you",
  on_trip: "On the way to your destination",
  ended: "Complete",
};

/** What an operator sees — precise, because they act on it. */
export const TRACKING_ADMIN_STATUS: Record<TrackingStatus, string> = {
  pending: "Not started",
  en_route_pickup: "To pickup",
  at_pickup: "At pickup",
  on_trip: "On trip",
  ended: "Ended",
};

// ── DISTANCE ────────────────────────────────────────────────────────────────

const R_EARTH_KM = 6371;
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

/**
 * Great-circle distance. Mirrors haversine_km() in SQL so a distance shown on a
 * screen and a distance used to rank a driver cannot disagree.
 */
export function haversineKm(
  aLat: number, aLng: number, bLat: number, bLng: number,
): number {
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH_KM * Math.asin(Math.min(1, Math.sqrt(s)));
}

/**
 * Initial bearing from A to B, 0–360 clockwise from north.
 *
 * Used when the device reports no heading, which is most of the time: phones
 * only supply `coords.heading` while genuinely moving, and a parked car reports
 * null or a meaningless 0. Two consecutive fixes always give a usable direction.
 */
export function bearingDeg(
  aLat: number, aLng: number, bLat: number, bLng: number,
): number {
  const φ1 = toRad(aLat), φ2 = toRad(bLat), Δλ = toRad(bLng - aLng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/**
 * Shortest signed turn from one bearing to another, −180…180.
 *
 * Without this a vehicle icon rotating from 350° to 10° spins 340° the wrong way
 * round — the single most obvious "this is a cheap map" tell there is.
 */
export function shortestTurn(from: number, to: number): number {
  return ((((to - from) % 360) + 540) % 360) - 180;
}

// ── IS THIS FIX WORTH BELIEVING? ────────────────────────────────────────────

/** Rodrigues, with a generous margin. ~18 km × 8 km of island. */
export const RODRIGUES_BOUNDS = {
  minLat: -19.82, maxLat: -19.58, minLng: 63.30, maxLng: 63.53,
} as const;

export function isOnRodrigues(lat: number, lng: number): boolean {
  return (
    lat >= RODRIGUES_BOUNDS.minLat && lat <= RODRIGUES_BOUNDS.maxLat &&
    lng >= RODRIGUES_BOUNDS.minLng && lng <= RODRIGUES_BOUNDS.maxLng
  );
}

/**
 * Accuracy beyond which a fix is a neighbourhood, not a position.
 *
 * 150 m is roughly the width of Port Mathurin's grid: past that, drawing a
 * confident dot is a lie, and the UI says "approximate" instead of pretending.
 * A cell-tower fix in a valley routinely reports 1–3 km.
 */
export const POOR_ACCURACY_M = 150;

/** Fixes worse than this are dropped outright rather than shown as approximate. */
export const USELESS_ACCURACY_M = 2000;

/**
 * Should this fix replace the one on screen?
 *
 * Three ways a fix is rejected, and they are different failures:
 *
 *   · it is older than what we already have — GPS callbacks do arrive out of
 *     order, and accepting a late one makes the marker jump backwards;
 *   · it is uselessly imprecise;
 *   · it implies a speed no vehicle on this island reaches. A single wild fix
 *     (the classic "you are now in the Indian Ocean" sample) would otherwise
 *     drag the marker across the map and back, and the animation makes that
 *     worse, not better, because it draws the whole journey.
 */
export function shouldAcceptFix(prev: Fix | null, next: Fix): boolean {
  if (!Number.isFinite(next.lat) || !Number.isFinite(next.lng)) return false;
  if (Math.abs(next.lat) > 90 || Math.abs(next.lng) > 180) return false;
  if (next.accuracyM != null && next.accuracyM > USELESS_ACCURACY_M) return false;
  if (!prev) return true;
  if (next.at <= prev.at) return false;

  const dtHours = (next.at - prev.at) / 3_600_000;
  if (dtHours <= 0) return false;
  const km = haversineKm(prev.lat, prev.lng, next.lat, next.lng);
  // Under ~30 m of movement, the "speed" is accuracy noise, not travel.
  if (km < 0.03) return true;
  const impliedKmh = km / dtHours;
  // 160 km/h is impossible on Rodrigues (the island is 18 km across and the
  // limit is 80). A fix implying it is a bad fix, not a fast driver.
  return impliedKmh <= 160;
}

/**
 * How the last-known position should be described.
 *
 * "live" and "stale" are not the same problem and must not read the same. A
 * customer whose driver's phone lost signal needs to know the dot is old, not to
 * watch a frozen dot and assume the driver has stopped.
 */
export type Freshness = "live" | "delayed" | "stale" | "unknown";

export function freshness(
  ageSeconds: number | null | undefined,
  staleAfterSeconds: number,
): Freshness {
  if (ageSeconds == null || !Number.isFinite(ageSeconds)) return "unknown";
  if (ageSeconds <= 45) return "live";
  if (ageSeconds < staleAfterSeconds) return "delayed";
  return "stale";
}

/** "just now" · "2 min ago" · "1 h 20 min ago". Never a raw timestamp. */
export function lastSeenLabel(ageSeconds: number | null | undefined): string {
  if (ageSeconds == null || !Number.isFinite(ageSeconds)) return "Location unavailable";
  if (ageSeconds < 45) return "Live";
  const mins = Math.floor(ageSeconds / 60);
  if (mins < 1) return "Last seen just now";
  if (mins < 60) return `Last seen ${mins} min ago`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `Last seen ${h} h ago` : `Last seen ${h} h ${m} min ago`;
}

// ── ETA ─────────────────────────────────────────────────────────────────────

export type Eta = {
  minutes: number;
  km: number;
  /**
   * How this number was reached. The UI MUST show the difference: an estimate
   * from a road router and an estimate from crow-flies-times-a-constant deserve
   * different confidence, and quietly presenting the second as the first is how
   * a customer learns not to trust the screen.
   */
  source: "route" | "approx";
};

/**
 * The fallback ETA: straight-line distance inflated to road distance, divided by
 * an average speed.
 *
 * The two constants are dispatch_settings.road_factor and .avg_speed_kmh — the
 * SAME dials the ranking engine already uses, passed in rather than re-declared,
 * so an owner who decides Rodrigues traffic is slower changes one row and every
 * screen agrees. It costs no API quota and cannot fail, which is why it is the
 * default rather than the emergency path.
 */
export function approxEta(
  fromLat: number, fromLng: number, toLat: number, toLng: number,
  roadFactor: number, avgSpeedKmh: number,
): Eta {
  const km = haversineKm(fromLat, fromLng, toLat, toLng) * roadFactor;
  const minutes = Math.max(1, Math.ceil((km / Math.max(avgSpeedKmh, 5)) * 60));
  return { minutes, km, source: "approx" };
}

/** "2 min" · "12 min" · "1 h 05". Rounded honestly — never "0 min". */
export function formatEta(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(minutes) || minutes < 0) return "—";
  if (minutes < 1) return "Under a minute";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h} h ${String(m).padStart(2, "0")}`;
}

/** "800 m" under a kilometre, "4.2 km" over it. */
export function formatDistance(km: number | null | undefined): string {
  if (km == null || !Number.isFinite(km) || km < 0) return "—";
  if (km < 1) return `${Math.max(50, Math.round((km * 1000) / 50) * 50)} m`;
  return `${km.toFixed(1)} km`;
}

/**
 * Where the driver is heading right now, given the trip's stage.
 *
 * Before pickup the destination is the customer; after it, the drop-off. Getting
 * this wrong shows a passenger an ETA to the place they are standing.
 */
export function activeTarget(
  status: TrackingStatus,
  pickup: { lat: number | null; lng: number | null },
  dropoff: { lat: number | null; lng: number | null },
): { lat: number; lng: number } | null {
  const t = status === "on_trip" ? dropoff : pickup;
  return t.lat != null && t.lng != null ? { lat: t.lat, lng: t.lng } : null;
}

// ── SHOULD THE MAP RE-FRAME? ────────────────────────────────────────────────
//
// Extracted from TrackingMap so the rule can be tested without a browser, a
// map, or a container that resizes. It encodes a bug that cost real debugging:
//
// Leaflet decides zoom from the container size it believes it has, and that
// belief is formed when the map is constructed — inside a dynamic import that
// lands mid-layout, so routinely against a box that is not final. Measured: the
// same two points framed three times gave zoom 13, then 14, then 15, and the
// destination sat off the bottom of the map.
//
// The fix is not better arithmetic. It is noticing that the size the framing was
// computed against is no longer the size we have, and framing again.

export type FitState = {
  /** Have we framed at all yet? */
  hasFitted: boolean;
  /** The container size that framing was computed against, e.g. "446x318". */
  fittedAt: string;
  /** Has the user dragged the map? Their choice outranks ours, always. */
  userPanned: boolean;
};

export function shouldRefit(state: FitState, currentSize: string): boolean {
  // A pan is a decision. Never re-frame over it — a map that yanks itself back
  // while somebody is looking at something is worse than one framed badly.
  if (state.userPanned) return false;
  if (!state.hasFitted) return true;
  // An empty reading tells us nothing; do not act on it.
  if (!currentSize) return false;
  return currentSize !== state.fittedAt;
}

/** Is this container big enough to frame anything against? */
export function isFramableSize(width: number, height: number): boolean {
  return Number.isFinite(width) && Number.isFinite(height) && width >= 40 && height >= 40;
}

// ══════════════════════════════════════════════════════════════════════════
// THE GPS QUALITY PIPELINE
// ══════════════════════════════════════════════════════════════════════════
//
// Everything a phone reports passes through here before it is broadcast, drawn
// or written. A consumer GPS on a moving vehicle produces three distinct kinds
// of rubbish, and they need three different answers:
//
//   1. IMPRECISE   a cell-tower or wifi fix, accurate to hundreds of metres.
//                  Answer: refuse it for tracking. A 400 m circle drawn as a
//                  confident dot puts the driver on the wrong road.
//   2. IMPOSSIBLE  a single wild sample — the classic "you are now in the
//                  Indian Ocean". Answer: refuse it. Interpolating toward it
//                  makes it worse, because the animation draws the whole
//                  fictional journey.
//   3. DRIFT       a stationary phone wandering 2-8 m as satellites come and
//                  go. Answer: hold still. Drift is the most VISIBLE failure
//                  of the three: a parked car that keeps twitching reads as a
//                  broken app, and it burns broadcast messages and battery for
//                  movement that is not happening.
//
// Kept pure so each rule is testable without a device, a socket or a map.

/**
 * Accuracy beyond which a fix is not good enough to TRACK with.
 *
 * 50 m is the working figure for vehicle tracking: a real GNSS fix outdoors is
 * 3-15 m, a degraded one under trees or between buildings is 20-40 m, and
 * anything past 50 m is almost always a wifi/cell fallback rather than
 * satellites. Below this the dot is on the right road; above it, it is not.
 */
export const TRACKING_ACCURACY_M = 50;

/**
 * Movement under this, with no speed, is drift rather than travel.
 *
 * 6 m sits just above the noise floor of a good stationary fix and below the
 * length of a car, so a vehicle that has genuinely pulled forward still
 * registers.
 */
export const DRIFT_RADIUS_M = 6;

/** Below this the device is, for our purposes, not moving. */
export const STATIONARY_KMH = 2;

/**
 * How much of the PREVIOUS position to keep when smoothing (the EMA weight).
 *
 * An exponential moving average, not a Kalman filter. A real Kalman needs a
 * motion model and tuned process/measurement covariances to beat this, and
 * mis-tuned it lags worse than doing nothing — which on a tracking map means a
 * driver who visibly turns the corner late. An EMA has ONE parameter, cannot
 * diverge, and removes exactly the jitter this is here to remove.
 *
 * 0.35 is deliberately light: the marker animator is already smoothing the
 * VISIBLE motion between fixes, so this only has to take the edge off the
 * samples themselves. Heavier smoothing here would fight it and add lag.
 */
export const SMOOTHING_ALPHA = 0.35;

export type FilterDecision =
  | { accept: true; fix: Fix; reason: "first" | "moving" | "smoothed" }
  | { accept: false; reason: "imprecise" | "impossible" | "drift" | "invalid" | "stale" };

/**
 * The whole pipeline, as one decision.
 *
 * Returns the fix to USE — which may be a smoothed blend of the reading and
 * what came before — or a refusal with the reason, so the UI can tell a driver
 * "weak signal" instead of going quiet.
 */
export function filterFix(prev: Fix | null, next: Fix): FilterDecision {
  if (!Number.isFinite(next.lat) || !Number.isFinite(next.lng)) {
    return { accept: false, reason: "invalid" };
  }
  if (Math.abs(next.lat) > 90 || Math.abs(next.lng) > 180) {
    return { accept: false, reason: "invalid" };
  }
  // Too imprecise to place on a road.
  if (next.accuracyM != null && next.accuracyM > TRACKING_ACCURACY_M) {
    return { accept: false, reason: "imprecise" };
  }
  if (!prev) return { accept: true, fix: next, reason: "first" };

  // Out-of-order callbacks happen. Accepting a late one walks the marker back.
  if (next.at <= prev.at) return { accept: false, reason: "stale" };

  const metres = haversineKm(prev.lat, prev.lng, next.lat, next.lng) * 1000;

  // Drift: the device says it is not moving, and it has barely moved.
  const speed = next.speedKmh ?? 0;
  if (speed < STATIONARY_KMH && metres < DRIFT_RADIUS_M) {
    return { accept: false, reason: "drift" };
  }

  // Impossible: no vehicle on this island does 160 km/h.
  const hours = (next.at - prev.at) / 3_600_000;
  if (hours > 0 && metres > 30) {
    const impliedKmh = metres / 1000 / hours;
    if (impliedKmh > 160) return { accept: false, reason: "impossible" };
  }

  // Real movement, lightly smoothed toward the reading.
  const a = SMOOTHING_ALPHA;
  return {
    accept: true,
    reason: metres >= DRIFT_RADIUS_M ? "moving" : "smoothed",
    fix: {
      ...next,
      // EMA: a is the weight kept from the PREVIOUS position, so 0.35 means the
      // new reading dominates and only the jitter is damped.
      lat: prev.lat * a + next.lat * (1 - a),
      lng: prev.lng * a + next.lng * (1 - a),
    },
  };
}

/**
 * How often to broadcast, given how fast the driver is going.
 *
 * A parked car does not need four messages a minute — and Supabase's free tier
 * is 2,000,000 realtime messages a month, so a fleet idling at a taxi rank all
 * day is exactly how that gets spent on nothing. Moving gets the fast cadence
 * because that is when the customer is watching the dot travel.
 */
export function publishIntervalMs(speedKmh: number | null | undefined): number {
  const s = speedKmh ?? 0;
  if (s >= 25) return 3000;   // open road
  if (s >= STATIONARY_KMH) return 5000;   // town, or crawling
  return 15000;               // stopped: a heartbeat, not a stream
}
