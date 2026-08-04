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
  | "pending_payment" | "paid" | "preparing" | "ready_for_pickup" | "collected" | "cancelled" | "refunded";

export const STATUS_LABEL: Record<OrderStatus, string> = {
  pending_payment: "Pending",
  paid: "Confirmed",
  preparing: "Preparing",
  ready_for_pickup: "Ready",
  collected: "Completed",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

// pending_payment and refunded are deliberately absent as keys — they're not
// merchant-actionable via a status button (payment-flow-set / refund-flow-set).
export const LEGAL_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  paid: ["preparing", "cancelled"],
  preparing: ["ready_for_pickup", "cancelled"],
  ready_for_pickup: ["collected", "cancelled"],
};

export function legalNextStatuses(current: OrderStatus): OrderStatus[] {
  return LEGAL_TRANSITIONS[current] ?? [];
}

export const STATUS_ORDER: OrderStatus[] = ["paid", "preparing", "ready_for_pickup", "collected"];

export function timelineIndex(status: OrderStatus): number {
  if (status === "cancelled" || status === "refunded") return -1;
  return STATUS_ORDER.indexOf(status);
}
