// ── THE WORDS AND RULES OF A RIDE, IN ONE PLACE ─────────────────────────────
//
// Taxi and transfer were a tap counter before this: a request wrote one row to
// lead_events (kind, target_name, category, type, ref) and nothing else — no
// customer, no pickup, no status. There was never a ride to dispatch, track or
// complete.
//
// Now there is, and this module holds everything about it that does not need a
// database: what each service is called, which status follows which, what a
// customer is told versus what an operator sees. Pure, so the rules are testable
// without a server and the same labels appear on every screen.

export const RIDE_SERVICES = ["taxi", "airport", "hotel", "ferry", "private"] as const;
export type RideService = (typeof RIDE_SERVICES)[number];

export const RIDE_STATUSES = [
  "new", "dispatching", "assigned", "driver_on_way",
  "arrived", "on_trip", "completed", "cancelled", "no_driver",
] as const;
export type RideStatus = (typeof RIDE_STATUSES)[number];

export type ServiceMeta = {
  label: string;
  /** What the customer is buying, in their words. */
  blurb: string;
  /** Does this journey need flight/ferry details and a meeting arrangement? */
  needsArrival: boolean;
};

export const RIDE_SERVICE_META: Record<RideService, ServiceMeta> = {
  taxi:    { label: "Taxi",             blurb: "A ride across the island",              needsArrival: false },
  airport: { label: "Airport transfer", blurb: "To or from Plaine Corail",              needsArrival: true },
  ferry:   { label: "Ferry transfer",   blurb: "To or from the Port Mathurin terminal", needsArrival: true },
  hotel:   { label: "Hotel transfer",   blurb: "To or from where you are staying",      needsArrival: false },
  private: { label: "Private hire",     blurb: "A driver for the day, or a set route",   needsArrival: false },
};

/**
 * What the CUSTOMER is told at each stage.
 *
 * Deliberately not the status name. "dispatching" is a word about the platform's
 * internals; the brief was explicit that a customer must never read
 * "searching radius stage 3", so what they see is what is happening to them.
 */
export const CUSTOMER_STATUS: Record<RideStatus, string> = {
  new:           "We have your request",
  dispatching:   "Finding your driver…",
  assigned:      "Driver found",
  driver_on_way: "Your driver is on the way",
  arrived:       "Your driver has arrived",
  on_trip:       "On the way to your destination",
  completed:     "Trip complete",
  cancelled:     "Cancelled",
  // Never "dispatch failed". The customer did nothing wrong and there is a human
  // on the other end of this.
  no_driver:     "We're arranging this for you by hand",
};

/** What the OPERATOR sees — precise, because they are acting on it. */
export const ADMIN_STATUS: Record<RideStatus, string> = {
  new:           "Waiting to dispatch",
  dispatching:   "Offers out",
  assigned:      "Driver assigned",
  driver_on_way: "Driver en route",
  arrived:       "Driver waiting",
  on_trip:       "On trip",
  completed:     "Completed",
  cancelled:     "Cancelled",
  no_driver:     "NOBODY ACCEPTED — needs you",
};

/** Which rides are still somebody's problem today. */
export const OPEN_RIDE_STATUSES: RideStatus[] = [
  "new", "dispatching", "assigned", "driver_on_way", "arrived", "on_trip", "no_driver",
];

export function isOpenRide(status: RideStatus): boolean {
  return OPEN_RIDE_STATUSES.includes(status);
}

/**
 * The status graph, mirroring admin_set_ride_status() in SQL.
 *
 * Duplicated on purpose, and the duplication is the point: the server is the
 * authority and refuses an illegal jump, while this lets a screen avoid OFFERING
 * a button that would be refused. A test asserts the two agree.
 */
export const NEXT_STATUSES: Record<RideStatus, RideStatus[]> = {
  new:           ["cancelled"],
  // Back to 'new' is the REOPEN path, not a mistake: when every live offer has
  // been declined or has expired, the ride drops back so the next round can go
  // out immediately instead of waiting for a timeout nobody is watching.
  // decline_ride_by_token() and sweep_ride_offers() both do this. The
  // SQL-agreement test caught this missing — which is the whole reason it exists.
  dispatching:   ["new", "cancelled"],
  assigned:      ["driver_on_way", "arrived", "on_trip", "cancelled"],
  driver_on_way: ["arrived", "on_trip", "cancelled"],
  arrived:       ["on_trip", "cancelled"],
  on_trip:       ["completed", "cancelled"],
  completed:     [],
  cancelled:     [],
  no_driver:     ["new", "cancelled"],
};

export function canTransition(from: RideStatus, to: RideStatus): boolean {
  return NEXT_STATUSES[from]?.includes(to) ?? false;
}

/**
 * How the customer's waiting message should read as the search widens.
 *
 * The brief asked for this specifically: not "radius stage 3", but something that
 * feels like patience rather than failure. Each round says a little more without
 * ever admitting the platform is running out of people to ask.
 */
export function searchingMessage(round: number): string {
  if (round <= 1) return "Checking drivers near you…";
  if (round === 2) return "Still looking nearby…";
  if (round === 3) return "Checking more drivers across the island…";
  return "Still working on it — we'll call you if we need to.";
}

/**
 * A ride reference a person can read down a phone line.
 *
 * Same shape as the booking reference the rest of the platform uses, so a
 * customer holding "RR-4F2A91" does not have to know which system it came from.
 */
export function rideReference(id: string): string {
  return `RR-${id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

/** Minor units → "Rs 1,800". Prices are server-set; this only displays them. */
export function formatRidePrice(minor: number | null | undefined, currency = "MUR"): string {
  if (minor == null) return "Price on request";
  const major = Math.round(minor / 100);
  const sep = major.toLocaleString("en-GB");
  return currency === "MUR" ? `Rs ${sep}` : `${currency} ${sep}`;
}

/**
 * The WhatsApp message a driver receives.
 *
 * This IS the dispatch channel — taxi drivers have no accounts by the owner's
 * decision, so there is no push notification and no app to open. Everything the
 * driver needs to decide has to survive being read once, on a phone, possibly
 * while driving. Hence: what, where, when, how much, then the link.
 */
export function offerMessage(o: {
  driverName: string;
  service: RideService;
  pickup: string;
  dropoff: string;
  passengers: number;
  whenText: string;
  price: number | null;
  acceptUrl: string;
}): string {
  const meta = RIDE_SERVICE_META[o.service];
  return [
    `Bonjour ${o.driverName} — ${meta.label} available:`,
    ``,
    `Pickup: ${o.pickup}`,
    `Drop-off: ${o.dropoff}`,
    `When: ${o.whenText}`,
    `Passengers: ${o.passengers}`,
    `You earn: ${formatRidePrice(o.price)}`,
    ``,
    `Tap to accept (first to accept gets it):`,
    o.acceptUrl,
  ].join("\n");
}
