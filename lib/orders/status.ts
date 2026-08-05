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

export function timelineIndex(status: OrderStatus): number {
  if (status === "cancelled" || status === "refunded") return -1;
  if (status === "awaiting_payment_confirmation") return 0;
  return STATUS_ORDER.indexOf(status);
}

/** Bank-transfer orders that still owe the customer an action or a wait. */
export function isAwaitingPayment(status: OrderStatus): boolean {
  return status === "pending_payment" || status === "awaiting_payment_confirmation";
}
