// ── ONE ACTIVITY MODEL, FOUR BACKENDS ──────────────────────────────────────
//
// A customer does not care which table produced their transaction. They rented
// a scooter, booked a boat trip, bought two tickets and ordered dinner — and
// until now those lived in three unrelated lookups with three different
// reference formats, one of which (place bookings) had no customer-facing
// tracking at all.
//
// This is the presentation layer that makes them one list. It is deliberately
// PURE: every function here takes a row and returns a shape, with no database
// and no React, because the interesting logic — which status vocabulary
// applies, whether a thing is still ahead of you, what the customer can do next
// — is exactly the logic that is worth testing directly.
//
// ── WHAT IT DOES NOT DO ────────────────────────────────────────────────────
// It does NOT introduce a unified `activities` table. The brief explicitly
// allows respecting the existing schema, and four healthy tables with correct
// constraints are worth more than one denormalised table that has to be kept in
// sync with all four. The unification the customer asked for is a UI promise,
// not a storage decision.
//
// ── AND IT DOES NOT FLATTEN THE STATUS VOCABULARY ──────────────────────────
// A taxi is not "preparing" and a curry is not "checked in". Each kind keeps
// the words that are true for it, and only the STAGE is shared — which is what
// lets one component draw one progress line for all of them.

export const ACTIVITY_KINDS = ["vehicle", "place", "order"] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

/**
 * Where this sits in its own lifecycle. Shared across kinds ONLY at this level
 * of abstraction — the human-readable label stays kind-specific.
 */
export const ACTIVITY_STAGES = ["pending", "confirmed", "active", "done", "cancelled"] as const;
export type ActivityStage = (typeof ACTIVITY_STAGES)[number];

export type Activity = {
  kind: ActivityKind;
  /** Stable id within its own table. */
  id: string;
  /** What the customer quotes to us: RR-XXXXXX, or an order number. */
  reference: string;
  /** "Scooter · Vespa 125", "Sunset Lagoon Cruise", "Ourite Rougaille ×2". */
  title: string;
  /** The kitchen, shop, organiser or place. Null for a vehicle — that is us. */
  provider: string | null;
  /** ISO date this is FOR (not when it was booked). Sorting key. */
  date: string | null;
  /** Minor units. Null when nothing is owed or known. */
  amount: number | null;
  currency: string;
  stage: ActivityStage;
  /** The kind-specific word shown on the badge. */
  statusLabel: string;
  /** Where tapping it goes. */
  href: string;
};

// ── Vehicle rentals ─────────────────────────────────────────────────────────
// `bookings.status` is pending | confirmed | cancelled, and the interesting
// distinction the customer feels — "am I currently holding this scooter?" — is
// not in the column at all. It is derived from the dates.
const VEHICLE_LABEL: Record<ActivityStage, string> = {
  pending: "Awaiting confirmation",
  confirmed: "Confirmed",
  active: "Out now",
  done: "Returned",
  cancelled: "Cancelled",
};

export function vehicleStage(
  status: string | null | undefined,
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  today: string,
): ActivityStage {
  if (status === "cancelled") return "cancelled";
  if (status === "pending") return "pending";
  // Confirmed and in the past is finished; confirmed and spanning today is a
  // scooter currently in the customer's hands, which is a different thing to
  // say to them than "confirmed".
  if (endDate && endDate < today) return "done";
  if (startDate && endDate && startDate <= today && today <= endDate) return "active";
  return "confirmed";
}

// ── Place bookings (Stay·Eat·Do, and now massage / fishing / sea trips) ─────
// `place_bookings.status` is pending | confirmed | cancelled. A deposit that
// has been paid means the reservation is genuinely held, which the status
// column alone does not say.
const PLACE_LABEL: Record<ActivityStage, string> = {
  pending: "Requested",
  confirmed: "Confirmed",
  active: "Today",
  done: "Completed",
  cancelled: "Cancelled",
};

export function placeStage(
  status: string | null | undefined,
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  today: string,
  depositPaidAt?: string | null,
): ActivityStage {
  if (status === "cancelled") return "cancelled";
  const last = endDate || startDate;
  if (last && last < today) return "done";
  if (startDate && startDate === today) return "active";
  // A paid deposit is a held reservation even while the owner has not pressed
  // "confirm" — telling that customer "Requested" understates what they hold.
  if (status === "confirmed" || depositPaidAt) return "confirmed";
  return "pending";
}

// ── Marketplace / food / event orders ───────────────────────────────────────
// These already have a rich, correct status enum (M50 order_status). It is
// mapped rather than replaced.
const ORDER_STAGE: Record<string, ActivityStage> = {
  pending_payment: "pending",
  awaiting_payment_confirmation: "pending",
  paid: "confirmed",
  preparing: "active",
  ready_for_pickup: "active",
  out_for_delivery: "active",
  collected: "done",
  cancelled: "cancelled",
  refunded: "cancelled",
};

export function orderStage(status: string | null | undefined): ActivityStage {
  return ORDER_STAGE[status ?? ""] ?? "pending";
}

/**
 * The word on the badge.
 *
 * Kind-specific on purpose: "Out now" is right for a scooter and meaningless
 * for a curry; "Ready" is right for a curry and wrong for a hotel. Collapsing
 * them into one vocabulary is exactly the flattening the brief warned against.
 */
export function activityLabel(kind: ActivityKind, stage: ActivityStage, orderStatusLabel?: string): string {
  if (kind === "vehicle") return VEHICLE_LABEL[stage];
  if (kind === "place") return PLACE_LABEL[stage];
  // Orders already have a customer-facing label per status (lib/orders/status)
  // which is more precise than the stage — "Ready" rather than "active".
  return orderStatusLabel ?? stage;
}

/** Still ahead of the customer, or currently happening. */
export function isOpen(stage: ActivityStage): boolean {
  return stage === "pending" || stage === "confirmed" || stage === "active";
}

/**
 * Sort for the tracking list: what is happening NOW first, then what is coming,
 * then history — and within each group the soonest first.
 *
 * Not simply "newest created first". A rental that starts tomorrow matters more
 * than an order placed an hour ago and already collected, and a list that
 * cannot express that is a log rather than a tracker.
 */
const GROUP: Record<ActivityStage, number> = {
  active: 0,
  confirmed: 1,
  pending: 1,
  done: 2,
  cancelled: 3,
};

export function compareActivities(a: Activity, b: Activity): number {
  const g = GROUP[a.stage] - GROUP[b.stage];
  if (g !== 0) return g;

  // Undated things sort last within their group rather than to the top, which
  // is where an empty string would otherwise put them.
  if (!a.date && !b.date) return 0;
  if (!a.date) return 1;
  if (!b.date) return -1;

  // History reads best newest-first; everything still open reads best
  // soonest-first, because the next thing to happen is the thing you want.
  return GROUP[a.stage] === 2 || GROUP[a.stage] === 3
    ? b.date.localeCompare(a.date)
    : a.date.localeCompare(b.date);
}

/** Split for the three sections the tracking page renders. */
export function groupActivities(list: Activity[]): {
  now: Activity[];
  upcoming: Activity[];
  past: Activity[];
} {
  const sorted = [...list].sort(compareActivities);
  return {
    now: sorted.filter((a) => a.stage === "active"),
    upcoming: sorted.filter((a) => a.stage === "pending" || a.stage === "confirmed"),
    past: sorted.filter((a) => a.stage === "done" || a.stage === "cancelled"),
  };
}

/** "RR-" + the first 6 hex of a uuid — the format used in every email. */
export function bookingReference(id: string): string {
  return "RR-" + id.replace(/-/g, "").slice(0, 6).toUpperCase();
}

/**
 * What KIND of reference did the customer type?
 *
 * The unified lookup needs this so one box can accept any of them and still
 * query the right backend. Deliberately conservative: anything it cannot
 * confidently classify is tried against every backend rather than rejected,
 * because a customer mistyping their own reference should not be told it does
 * not exist.
 */
export function classifyReference(raw: string): ActivityKind | "unknown" {
  const s = raw.trim().toUpperCase();
  // Vehicle and place bookings both use RR-XXXXXX (6 hex).
  if (/^RR-?[0-9A-F]{6}$/.test(s)) return "vehicle";
  // Order numbers are RR<date>-<suffix>, e.g. RR260811-D9220F.
  if (/^RR\d{6}-[0-9A-Z]+$/.test(s)) return "order";
  return "unknown";
}
