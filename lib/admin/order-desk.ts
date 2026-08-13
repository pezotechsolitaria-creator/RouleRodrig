import {
  legalNextStatuses,
  statusLabel,
  EVENT_STATUS_ORDER,
  type OrderStatus,
} from "@/lib/orders/status";

// ── ONE DESK FOR EVERY ORDER ────────────────────────────────────────────────
//
// The owner asked to be able to accept and cancel orders from admin. Every
// piece of that already existed — admin_update_order_status() enforces the state
// machine, and both /admin/food and /admin/marketplace call it. What did not
// exist was a place to DO it.
//
// Right now nine open orders are spread across three screens: four event orders
// on /admin/events, one kitchen order on /admin/food, four shop orders on
// /admin/marketplace. Nothing on any of them says the other six exist, and
// nothing tells you which screen a given order lives on. An order you cannot
// find is an order you cannot accept.
//
// So this is the model behind one list of all of them. It is pure: which button
// an order gets, and what that button says, is the whole decision this screen
// makes, so it is tested rather than trusted.
//
// Rentals and experience bookings are deliberately NOT here. They live in
// different tables with a different status vocabulary ("confirmed", not "paid"),
// and folding four state machines into one row would make the screen harder to
// read, not easier. They keep their controls on the dashboard.

export type OrderDomain = "food" | "shop" | "event";

export type DeskOrder = {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  domain: OrderDomain;
  storeName: string;
  customerName: string | null;
  customerPhone: string | null;
  total: number;
  currency: string;
  placedAt: string;
  items: number;
};

export const DOMAIN_LABEL: Record<OrderDomain, string> = {
  food: "Kitchen",
  shop: "Shop",
  event: "Event",
};

/** Where this order is normally managed, so the desk can point at the specialist
 *  screen rather than pretending it is the only one. */
export const DOMAIN_HOME: Record<OrderDomain, string> = {
  food: "/admin/food",
  shop: "/admin/marketplace",
  event: "/admin/events",
};

// What "accept" means depends on where the order is and what kind it is. The
// same forward step is "Send to kitchen" for food and "Start packing" for a
// shop, and for an event it is the last step there will ever be.
const ACCEPT_LABEL: Record<OrderDomain, Partial<Record<OrderStatus, string>>> = {
  food: {
    paid: "Confirm payment",
    preparing: "Send to the kitchen",
    ready_for_pickup: "Mark ready",
    collected: "Handed over",
  },
  shop: {
    paid: "Confirm payment",
    preparing: "Start packing",
    ready_for_pickup: "Ready for collection",
    collected: "Handed over",
  },
  event: {
    paid: "Confirm payment and send the tickets",
  },
};

/** The one forward move available, or null when there is nothing left to do.
 *  Cancel is never returned here — it is a separate, differently-styled choice. */
export function acceptStep(o: DeskOrder): { to: OrderStatus; label: string } | null {
  const forward = legalNextStatuses(o.status).filter((s) => s !== "cancelled");
  const next = forward[0];
  if (!next) return null;

  // An event order goes pending_payment → paid and STOPS. There is nothing to
  // prepare and no counter to collect from; admission is recorded on the ticket.
  if (o.domain === "event" && !EVENT_STATUS_ORDER.includes(next)) return null;

  return {
    to: next,
    label: ACCEPT_LABEL[o.domain][next] ?? `Mark ${statusLabel(next, o.domain === "event").toLowerCase()}`,
  };
}

export function canCancel(o: DeskOrder): boolean {
  return legalNextStatuses(o.status).includes("cancelled");
}

/** Cancelling opens a refund automatically when money was taken (the
 *  t_orders_open_refund trigger). The button should say so rather than let the
 *  operator discover it afterwards. */
export function cancelWarning(o: DeskOrder): string {
  const paid = !["pending_payment", "awaiting_payment_confirmation"].includes(o.status);
  return paid
    ? `Cancel ${o.orderNumber}? The stock goes back, the customer is told, and a refund of ${formatMoney(o.total, o.currency)} is opened.`
    : `Cancel ${o.orderNumber}? Nothing has been paid, so the stock simply goes back and the customer is told.`;
}

/** Open means somebody is still waiting on it. */
export function needsAction(o: DeskOrder): boolean {
  return !["collected", "cancelled", "refunded"].includes(o.status);
}

/** Waiting to be let through the door — the orders where the owner IS the
 *  blocker, not the kitchen or the customer. These sort to the top. */
export function awaitingOwner(o: DeskOrder): boolean {
  return o.status === "pending_payment" || o.status === "awaiting_payment_confirmation";
}

export function formatMoney(minor: number, currency = "MUR"): string {
  const abs = Math.abs(Math.round(minor));
  const symbol = currency === "MUR" ? "Rs" : currency;
  return `${minor < 0 ? "-" : ""}${symbol} ${Math.floor(abs / 100).toLocaleString("en-GB")}.${String(abs % 100).padStart(2, "0")}`;
}

/** Oldest first inside each bucket: the person who has waited longest is the
 *  person to serve next. Orders needing the owner come before everything else. */
export function deskOrder(a: DeskOrder, b: DeskOrder): number {
  const rank = (o: DeskOrder) => (awaitingOwner(o) ? 0 : needsAction(o) ? 1 : 2);
  const d = rank(a) - rank(b);
  return d !== 0 ? d : a.placedAt.localeCompare(b.placedAt);
}

export function domainOf(isKitchen: boolean, isEventStore: boolean): OrderDomain {
  if (isKitchen) return "food";
  if (isEventStore) return "event";
  return "shop";
}

export function statusFor(o: DeskOrder): string {
  return statusLabel(o.status, o.domain === "event");
}
