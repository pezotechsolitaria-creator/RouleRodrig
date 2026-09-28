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
  night: boolean;
  nightRule: NightMode | null;
  /** Minor units added by a fixed surcharge or a multiplier. */
  nightAdjustment: number;
  /** True when the owner sets this fare by hand (night, or a large group). */
  manual: boolean;
  manualReason: "night" | "group" | null;
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
  manualReasons: ("night" | "group")[];
  night: boolean;
  nightWindow: { from: number; to: number };
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
  bookable: boolean;
  places: ZonedPlace[];
};

/** "Rs 1,200" from minor units, whole rupees. */
export function rupees(minor: number): string {
  return `Rs ${Math.round(minor / 100).toLocaleString("en-GB")}`;
}
