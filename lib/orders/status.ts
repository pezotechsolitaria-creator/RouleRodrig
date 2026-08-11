// Single source of truth for order status display + legal transitions,
// shared between the merchant UI (which buttons to show) and API validation
// (the RPC is the real enforcement — see update_order_status() — but the
// client shouldn't offer a button for a transition the server will reject).
//
// The schema's order_status enum is pending_payment/paid/preparing/
// ready_for_pickup/collected/cancelled/refunded — not literally "Pending/
// Confirmed/Preparing/Ready/Completed/Cancelled" as commonly requested.
// These are DISPLAY labels mapped onto the existing enum, not a schema
// change — renaming `paid` to `confirmed` would blur real payment-gating
// semantics for a cosmetic win.
export type OrderStatus =
  | "pending_payment" | "awaiting_payment_confirmation" | "paid"
  | "preparing" | "ready_for_pickup" | "collected" | "cancelled" | "refunded";

export const STATUS_LABEL: Record<OrderStatus, string> = {
  pending_payment: "Pending payment",
  // The customer says they have transferred the money; only the merchant can
  // attest that it arrived, because the platform never touches the funds.
  awaiting_payment_confirmation: "Awaiting confirmation",
  paid: "Confirmed",
  preparing: "Preparing",
  ready_for_pickup: "Ready",
  collected: "Completed",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

// refunded is deliberately absent as a key — nothing transitions INTO it
// through update_order_status() yet (no refund flow exists), so it's never
// merchant-actionable via a status button. pending_payment IS actionable as
// of M5: a cash/manual order (no online capture step) needs the merchant to
// confirm payment received, or reject it, directly from that state.
export const LEGAL_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  pending_payment: ["paid", "cancelled"],
  // A customer can report a payment that never arrived, so the merchant must be
  // able to reject as well as confirm. Without the reject path the order — and
  // the stock it holds — would be stuck permanently.
  awaiting_payment_confirmation: ["paid", "cancelled"],
  paid: ["preparing", "cancelled"],
  preparing: ["ready_for_pickup", "cancelled"],
  ready_for_pickup: ["collected", "cancelled"],
};

export function legalNextStatuses(current: OrderStatus): OrderStatus[] {
  return LEGAL_TRANSITIONS[current] ?? [];
}

// The five fulfilment milestones a customer actually tracks.
// awaiting_payment_confirmation is deliberately NOT a step: it is a sub-state of
// "not yet paid" that only bank-transfer orders pass through, and adding it
// would show cash customers a step they can never reach. It maps to index 0 and
// is surfaced precisely by the status badge instead.
export const STATUS_ORDER: OrderStatus[] = ["pending_payment", "paid", "preparing", "ready_for_pickup", "collected"];

// ── Events speak a different language, and stop sooner ──────────────────────
//
// Related but separate from lib/food/vocabulary.ts, which owns the SELLER nouns
// ("organiser", "tickets", where "keep browsing" goes). Status words live here,
// with the statuses they name, so a future edit to one enum cannot leave the
// other half stale in a file about shopping baskets.
//
// An event order goes pending_payment → (awaiting_payment_confirmation) → paid
// and STOPS. Nothing moves it to preparing, ready_for_pickup or collected:
// there is nothing to prepare, no counter to collect from, and admission is
// recorded on the TICKET (tickets.used_at), not on the order.
//
// Rendering the marketplace timeline for a ticket therefore gets two things
// wrong at once — it calls `paid` "Confirmed" when the buyer is looking for the
// word "ticket", and it shows three further steps that can never light up, so
// somebody holding a perfectly good ticket sees a progress bar stuck at 40%.
export const EVENT_STATUS_LABEL: Record<OrderStatus, string> = {
  pending_payment: "Payment due",
  awaiting_payment_confirmation: "Checking your payment",
  paid: "Ticket issued",
  // Unreachable for an event today. Mapped anyway rather than left to fall back
  // to marketplace words, so that if some future flow ever does set one, a
  // ticket holder is not suddenly told their concert is "Preparing".
  preparing: "Ticket issued",
  ready_for_pickup: "Ticket issued",
  collected: "Attended",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

/** The two milestones a ticket buyer actually passes through. */
export const EVENT_STATUS_ORDER: OrderStatus[] = ["pending_payment", "paid"];

/** Status words for this order, in the buyer's own vocabulary. */
export function statusLabel(status: OrderStatus, isEvent = false): string {
  return isEvent ? EVENT_STATUS_LABEL[status] : STATUS_LABEL[status];
}

/** Milestones to draw. Events have two; everything else has five. */
export function statusSteps(isEvent = false): OrderStatus[] {
  return isEvent ? EVENT_STATUS_ORDER : STATUS_ORDER;
}

/**
 * Position in whichever timeline applies. For an event, every state at or past
 * `paid` is the final step — the order is complete once the ticket exists, and
 * the door is not part of this progress bar.
 */
export function timelineIndexFor(status: OrderStatus, isEvent = false): number {
  if (!isEvent) return timelineIndex(status);
  if (status === "cancelled" || status === "refunded") return -1;
  if (status === "pending_payment" || status === "awaiting_payment_confirmation") return 0;
  return 1;
}

export function timelineIndex(status: OrderStatus): number {
  if (status === "cancelled" || status === "refunded") return -1;
  if (status === "awaiting_payment_confirmation") return 0;
  return STATUS_ORDER.indexOf(status);
}

/** Bank-transfer orders that still owe the customer an action or a wait. */
export function isAwaitingPayment(status: OrderStatus): boolean {
  return status === "pending_payment" || status === "awaiting_payment_confirmation";
}
