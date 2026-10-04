// ── The reservation engine's two axes ────────────────────────────────────────
//
// A booking has a LIFECYCLE (has Roulé checked it, held it, is it under way?)
// and MONEY (is anything owed, has it arrived?). They are two columns and two
// transition maps, never one enum: "confirmed" means the date is held — it
// never means paid. A confirmed, unpaid reservation is
//   reservation_status = confirmed AND payment_status = payment_pending.
//
// The server is the authority. Every change goes through assertTransition /
// assertPaymentTransition, which throw on an illegal move; the UI only hides
// buttons. Pure module: no IO, no clock of its own (`now` is a parameter), so
// every rule below is unit-tested (lib/reservations/status.test.ts).

export const RESERVATION_STATUSES = [
  "draft",
  "requested",
  "under_review",
  "needs_information",
  "confirmed",
  "ready",
  "in_progress",
  "completed",
  "declined",
  "expired",
  "cancelled",
] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

export const PAYMENT_STATUSES = [
  "not_required",
  "unpaid",
  "payment_pending",
  "partially_paid",
  "paid",
  "pay_in_person",
  "failed",
  "refunded",
  "waived",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** Where a reservation may go next. Absent = terminal. */
export const RESERVATION_TRANSITIONS: Record<ReservationStatus, readonly ReservationStatus[]> = {
  draft: ["requested", "cancelled"],
  requested: ["under_review", "needs_information", "declined", "expired", "cancelled"],
  under_review: ["confirmed", "needs_information", "declined", "expired", "cancelled"],
  needs_information: ["under_review", "declined", "expired", "cancelled"],
  // expired only while money is still outstanding — see assertTransition.
  confirmed: ["ready", "cancelled", "expired"],
  ready: ["in_progress", "cancelled"],
  in_progress: ["completed"],
  completed: [],
  declined: [],
  expired: [],
  cancelled: [],
};

/** Where money may go next. */
export const PAYMENT_TRANSITIONS: Record<PaymentStatus, readonly PaymentStatus[]> = {
  not_required: [],
  unpaid: ["payment_pending", "pay_in_person", "waived", "not_required"],
  // `unpaid` = the deadline rolled the hold back.
  payment_pending: ["paid", "partially_paid", "pay_in_person", "failed", "unpaid", "waived"],
  partially_paid: ["paid", "pay_in_person", "refunded"],
  pay_in_person: ["paid", "payment_pending", "waived"],
  paid: ["refunded"],
  failed: ["payment_pending", "unpaid"],
  refunded: [],
  waived: [],
};

export const TERMINAL: readonly ReservationStatus[] = ["completed", "declined", "expired", "cancelled"];

/** Money that has NOT arrived and is still expected. */
const MONEY_OUTSTANDING: readonly PaymentStatus[] = ["unpaid", "payment_pending", "failed"];

export class TransitionError extends Error {
  constructor(
    readonly axis: "reservation" | "payment",
    readonly from: string,
    readonly to: string,
    reason?: string,
  ) {
    super(reason ?? `Illegal ${axis} transition: ${from} → ${to}`);
    this.name = "TransitionError";
  }
}

export function canTransition(from: ReservationStatus, to: ReservationStatus): boolean {
  return RESERVATION_TRANSITIONS[from]?.includes(to) ?? false;
}

export function canPaymentTransition(from: PaymentStatus, to: PaymentStatus): boolean {
  return PAYMENT_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Throws unless `from → to` is allowed. `payment` is required for the one
 * conditional edge: confirmed → expired only while money is still outstanding
 * (a paid hold never expires).
 */
export function assertTransition(from: ReservationStatus, to: ReservationStatus, payment?: PaymentStatus): void {
  if (!canTransition(from, to)) throw new TransitionError("reservation", from, to);
  if (from === "confirmed" && to === "expired") {
    if (!payment || !MONEY_OUTSTANDING.includes(payment)) {
      throw new TransitionError("reservation", from, to, `A confirmed reservation can only expire while payment is outstanding (payment is ${payment ?? "unknown"}).`);
    }
  }
}

export function assertPaymentTransition(from: PaymentStatus, to: PaymentStatus): void {
  if (!canPaymentTransition(from, to)) throw new TransitionError("payment", from, to);
}

/** The queue an admin works: everything Roulé still has to look at. */
export const PENDING: readonly ReservationStatus[] = ["requested", "under_review", "needs_information"];

/** Does this reservation hold capacity right now? Confirmed and later do;
 *  requests never do (an abandoned request must not freeze a boat). */
export function holdsCapacity(status: ReservationStatus): boolean {
  return status === "confirmed" || status === "ready" || status === "in_progress";
}

/**
 * How long a guest's "I've paid" keeps the hold alive past its deadline
 * while Roulé checks the account (M241). Bounded: a false report must not
 * hold a boat for ever. The SQL says the same number (sql-parity.test.ts).
 */
export const REPORT_GRACE_HOURS = 24;

/** Should the deadline job expire it? Pure: the job passes `now`. */
export function isDueToExpire(
  r: {
    reservation_status: ReservationStatus;
    payment_status: PaymentStatus;
    payment_deadline_at: string | null;
    payment_reported_at?: string | null;
  },
  now: Date,
): boolean {
  if (r.reservation_status !== "confirmed") return false;
  if (!MONEY_OUTSTANDING.includes(r.payment_status)) return false;
  if (!r.payment_deadline_at) return false;
  const deadline = new Date(r.payment_deadline_at).getTime();
  const grace = r.payment_reported_at ? new Date(r.payment_reported_at).getTime() + REPORT_GRACE_HOURS * 3600_000 : deadline;
  return Math.max(deadline, grace) <= now.getTime();
}
