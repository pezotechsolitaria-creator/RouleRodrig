import { canPaymentTransition, canTransition, holdsCapacity, type PaymentStatus, type ReservationStatus } from "./status";

// ── Which buttons the Reservation Center shows ──────────────────────────────
//
// Only LEGAL moves, read off the same transition maps the database enforces
// (sql-parity.test.ts keeps the two identical). A button the server would
// refuse is never drawn; the server still refuses it if it were.
//
// Pure, so the rules are tested rather than eyeballed.

export type AdminActionId =
  | "review"
  | "confirm"
  | "request_info"
  | "decline"
  | "cancel"
  | "mark_paid"
  | "allow_cash"
  | "ready"
  | "start"
  | "complete";

/** Money is settled enough for the day to go ahead. */
export function paymentSettled(p: PaymentStatus): boolean {
  return p === "paid" || p === "pay_in_person" || p === "waived" || p === "not_required";
}

export function legalActions(r: { reservation_status: ReservationStatus; payment_status: PaymentStatus }): AdminActionId[] {
  const s = r.reservation_status;
  const p = r.payment_status;
  const out: AdminActionId[] = [];
  if (s === "requested" && canTransition(s, "under_review")) out.push("review");
  // A fresh request may be confirmed in one tap: the database reviews it on
  // the way (requested → under_review → confirmed, both legal moves).
  if (canTransition(s, "confirmed") || (s === "requested" && canTransition("under_review", "confirmed"))) out.push("confirm");
  if (canTransition(s, "needs_information")) out.push("request_info");
  // Money: recorded by the owner, any time the booking stands — including a
  // balance taken in cash on the day after the deposit was paid.
  // Offered only where the payment map lets money land (paid → paid is a
  // second payment, e.g. the balance, and needs no transition).
  if (holdsCapacity(s) && (p === "paid" || canPaymentTransition(p, "paid") || canPaymentTransition(p, "partially_paid"))) out.push("mark_paid");
  if (s === "confirmed" && canPaymentTransition(p, "pay_in_person")) out.push("allow_cash");
  // "Ready" only once the money is settled: a confirmed hold that is still
  // waiting for payment must stay "confirmed", where its deadline can lapse.
  if (canTransition(s, "ready") && paymentSettled(p)) out.push("ready");
  if (canTransition(s, "in_progress")) out.push("start");
  if (canTransition(s, "completed")) out.push("complete");
  if (canTransition(s, "declined")) out.push("decline");
  if (canTransition(s, "cancelled")) out.push("cancel");
  return out;
}

// ── The desk's filters ──────────────────────────────────────────────────────

export const DESK_FILTERS = ["new", "needs_info", "awaiting_payment", "reported", "upcoming", "today", "closed", "all"] as const;
export type DeskFilter = (typeof DESK_FILTERS)[number];

type DeskRow = {
  reservation_status: ReservationStatus;
  payment_status: PaymentStatus;
  payment_reported_at: string | null;
  slot_date: string;
};

const OWED: readonly PaymentStatus[] = ["payment_pending", "partially_paid", "failed"];

export function inFilter(r: DeskRow, f: DeskFilter, today: string): boolean {
  const s = r.reservation_status;
  switch (f) {
    case "new":
      return s === "requested" || s === "under_review";
    case "needs_info":
      return s === "needs_information";
    case "awaiting_payment":
      return s === "confirmed" && OWED.includes(r.payment_status);
    case "reported":
      return s === "confirmed" && OWED.includes(r.payment_status) && r.payment_reported_at != null;
    case "upcoming":
      return (s === "confirmed" || s === "ready") && paymentSettled(r.payment_status) && r.slot_date >= today;
    case "today":
      return holdsCapacity(s) && r.slot_date === today;
    case "closed":
      return s === "completed" || s === "declined" || s === "expired" || s === "cancelled";
    default:
      return true;
  }
}

export function deskCounts(rows: DeskRow[], today: string): Record<DeskFilter, number> {
  const out = Object.fromEntries(DESK_FILTERS.map((f) => [f, 0])) as Record<DeskFilter, number>;
  for (const r of rows) for (const f of DESK_FILTERS) if (inFilter(r, f, today)) out[f] += 1;
  return out;
}
