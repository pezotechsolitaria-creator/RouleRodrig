// ── AIRPORT TRANSFERS: THE SHAPES, NOT THE PRICES ───────────────────────────
//
// M220 prices an airport transfer by zone — ≤ 7 km, > 7 and < 15 km, ≥ 15 km
// by road from Plaine Corail — one way or as a return package, plus a fee for
// each passenger after the first. Every one of those numbers lives in
// transfer_pricing_versions and is applied by quote_airport_transfer() in
// Postgres.
//
// This file deliberately holds NO fares, thresholds or night hours. The owner
// was explicit that pricing is never hard-coded in the frontend, and there is a
// sharper reason too: a second copy of the formula is how the screen and the
// charge come to disagree. What lives here is the SHAPE the database answers
// with, so the booking screen, the API and the admin desk read one type, and a
// couple of pure formatters that turn stored values into words.

export const TRIP_TYPES = ["one_way", "return"] as const;
export type TripType = (typeof TRIP_TYPES)[number];

export const NIGHT_MODES = ["none", "manual", "fixed", "multiplier"] as const;
export type NightMode = (typeof NIGHT_MODES)[number];

/** M221 · two time bands with their own rules: evening, then night. */
export type TimeBand = "evening" | "night";
export type ManualReason = TimeBand | "group";

/** A band's window and rule, as the quote reports it. */
export type BandWindow = {
  from: number;
  to: number;
  mode?: NightMode;
  /** Minor units, when mode is "fixed". */
  surcharge?: number;
  multiplier?: number;
};

/** One direction of one trip, exactly as price_transfer_leg() returns it. */
export type TransferLeg = {
  leg: "outbound" | "return";
  zone: number;
  tripType: TripType;
  /** Null = "as soon as possible", priced at the moment of quoting. */
  at: string | null;
  /** Minor units. The zone fare for this product, before passengers. */
  base: number;
  passengers: number;
  extraPassengers: number;
  /** Minor units. extraPassengers × the per-passenger fee. */
  passengerFee: number;
  /** True inside EITHER band (evening or night) — the key older readers use. */
  night: boolean;
  /** M221 · which band the time fell in. Night wins where the two overlap. */
  band?: TimeBand | null;
  nightRule: NightMode | null;
  /** Minor units added by the band's fixed surcharge or multiplier. */
  nightAdjustment: number;
  /** True when the owner sets this fare by hand (a band set to "manual", or a
   *  group too large to price automatically). */
  manual: boolean;
  manualReason: ManualReason | null;
  /** Minor units. Null while manual. */
  fare: number | null;
  commission: number | null;
  driverEarnings: number | null;
};

/** What POST /api/rides/quote answers for an airport transfer. */
export type TransferQuote = {
  ok: true;
  quoteId?: string;
  expiresAt?: string;
  service: "airport";
  direction: "from" | "to";
  tripType: TripType;
  zone: number;
  roadKm: number;
  /** "place:<id>" for a measured place, "router" for a routed pin. */
  distanceSource: string;
  pricingVersion: { id: number; label: string };
  legs: TransferLeg[];
  /** Minor units, both legs together. Null while any leg is manual. */
  total: number | null;
  /** Same as total — the key every older reader already uses. */
  price: number | null;
  currency: string;
  needsManual: boolean;
  manualReasons: ManualReason[];
  night: boolean;
  nightWindow: BandWindow;
  /** M221. Absent from quotes written before the evening band existed. */
  eveningWindow?: BandWindow;
  tripMinutes: number | null;
  message?: string | null;
};

export function isTransferQuote(q: unknown): q is TransferQuote {
  return (
    !!q &&
    typeof q === "object" &&
    (q as { ok?: unknown }).ok === true &&
    Array.isArray((q as { legs?: unknown }).legs)
  );
}

/**
 * "17:00–04:59" from the hours a price list stores.
 *
 * The hours are inclusive and whole: `to_hour = 4` means the night runs to the
 * end of 04:xx, which is exactly how the owner wrote it.
 */
export function nightWindowLabel(from: number, to: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(from)}:00–${pad(to)}:59`;
}

/** A named place and the zone the database puts it in. */
export type ZonedPlace = { id: string; label: string; roadKm: number; zone: 1 | 2 | 3 };

/**
 * The active price list as transfer_price_sheet() publishes it, for pages that
 * sell transfers. Each place's zone is computed by price_transfer_leg() itself,
 * so the page cannot put Port Mathurin in a different zone from the charge.
 */
export type TransferPricing = {
  id: number;
  label: string;
  zone1MaxKm: number;
  zone2MaxKm: number;
  oneWay: [number, number, number];
  /** Per direction. */
  returnEach: [number, number, number];
  includedPassengers: number;
  extraPassengerFee: number;
  maxPricedPassengers: number;
  nightMode: NightMode;
  nightFromHour: number;
  nightToHour: number;
  nightSurcharge: number;
  nightMultiplier: number;
  // M221 · the evening band. Optional: a sheet read before M221 has none.
  eveningMode?: NightMode;
  eveningFromHour?: number;
  eveningToHour?: number;
  eveningSurcharge?: number;
  eveningMultiplier?: number;
  bookable: boolean;
  places: ZonedPlace[];
};

/**
 * What a return package saves per trip in each zone, in minor units — the
 * one-way fare minus the return fare, both READ from the price list. Zero where
 * the package costs the same as two one-way trips (the owner's decision for
 * Zones 1 and 2 at launch), so a page can say so instead of implying a
 * discount that does not exist.
 */
export function returnSavings(p: Pick<TransferPricing, "oneWay" | "returnEach">): [number, number, number] {
  return [0, 1, 2].map((i) => Math.max(p.oneWay[i] - p.returnEach[i], 0)) as [number, number, number];
}

/**
 * The SIGNED per-trip difference, one-way minus return, per zone. Positive: the
 * package saves that much. Zero: same price. Negative: the package costs MORE
 * — never the owner's intent, and refused at publish, but a sentence must not
 * call it "the same" if it ever happens (review finding, M221).
 */
export function returnDifference(p: Pick<TransferPricing, "oneWay" | "returnEach">): [number, number, number] {
  return [0, 1, 2].map((i) => p.oneWay[i] - p.returnEach[i]) as [number, number, number];
}

/** The hours a band covers, in its own order — 22→4 is [22, 23, 0, 1, 2, 3, 4].
 *  The same inclusive, midnight-wrapping rule as transfer_is_night(). */
export function bandHours(from: number, to: number): number[] {
  const out: number[] = [];
  let h = ((from % 24) + 24) % 24;
  for (let i = 0; i < 24; i++) {
    out.push(h);
    if (h === to) break;
    h = (h + 1) % 24;
  }
  return out;
}

/**
 * The evening band as it actually applies: its hours MINUS the night band's,
 * because where the two overlap the night rule wins in price_transfer_leg().
 * Returns "17:00–21:59" (or several ranges, comma-joined), or null when night
 * covers every evening hour — in which case the evening rule never applies and
 * must not be advertised (review finding, M221).
 */
export function effectiveEveningLabel(
  evening: { from: number; to: number } | null | undefined,
  night: { from: number; to: number; mode?: NightMode } | null | undefined,
): string | null {
  if (!evening) return null;
  const nightSet = new Set(night && night.mode !== "none" ? bandHours(night.from, night.to) : []);
  const left = bandHours(evening.from, evening.to).filter((h) => !nightSet.has(h));
  if (!left.length) return null;
  const ranges: [number, number][] = [];
  for (const h of left) {
    const last = ranges[ranges.length - 1];
    if (last && (last[1] + 1) % 24 === h) last[1] = h;
    else ranges.push([h, h]);
  }
  return ranges.map(([a, b]) => nightWindowLabel(a, b)).join(", ");
}

/** "Rs 1,200" from minor units, whole rupees. */
export function rupees(minor: number): string {
  return `Rs ${Math.round(minor / 100).toLocaleString("en-GB")}`;
}
