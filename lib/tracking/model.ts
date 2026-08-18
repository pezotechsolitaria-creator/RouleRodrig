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
