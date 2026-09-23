import { parseInstant, slotFromBounds, slotTimes, type SlotWindow } from "@/lib/orders/slot";
import { momentShort, slotDayShort, slotRunningLate } from "@/lib/merchant/slot-label";
import type { AdminFoodOrder } from "./types";

// ── WHEN IS THIS ORDER FOR, AND IS IT LATE? (M216) ──────────────────────────
//
// The food queue measured every order from when it was PLACED: sorted newest
// first, and orange twenty minutes after it arrived. That was right when every
// order was for now. Chez Banane now takes orders one to two days ahead, so an
// order placed on Wednesday for Friday lunch went orange on Wednesday afternoon
// and stayed orange for two days — the marker that means "look at me" pointing
// at the one order that needed nothing — and sat above today's.
//
// Kept out of OrderQueue.tsx so the rules can be tested without a browser.

type Timed = Pick<AdminFoodOrder, "pickupFrom" | "pickupTo" | "placedAt" | "status" | "acceptedAt">;

const FINISHED = ["collected", "cancelled", "refunded"];

/** The booked window, or null for an ASAP order. */
export function orderSlot(o: Pick<AdminFoodOrder, "pickupFrom" | "pickupTo">): SlotWindow | null {
  return slotFromBounds(o.pickupFrom, o.pickupTo);
}

/**
 * The moment this order is due: its slot if it booked one, otherwise when it
 * was placed (an ASAP order is due the moment it lands).
 */
export function dueAt(o: Timed): number {
  const slot = orderSlot(o);
  if (slot) return slot.from.getTime();
  const placed = new Date(o.placedAt).getTime();
  return Number.isNaN(placed) ? 0 : placed;
}

/** Soonest-due first, so today's lunch sits above Friday's. */
export function bySoonestDue(a: Timed, b: Timed): number {
  return dueAt(a) - dueAt(b);
}

/**
 * Should the card turn orange?
 *
 * An ASAP order keeps the old rule: twenty minutes in one state during service
 * is when somebody should be looking. A booked order is judged against its own
 * slot instead — see slotRunningLate(), the one rule the merchant home uses too.
 */
export function isRunningLate(o: Timed, now: Date = new Date()): boolean {
  if (FINISHED.includes(o.status)) return false;
  const slot = orderSlot(o);
  if (slot) return slotRunningLate(slot, o.status, Boolean(o.acceptedAt), now);
  const placed = new Date(o.placedAt).getTime();
  return !Number.isNaN(placed) && now.getTime() - placed > 20 * 60_000;
}

/** "For tomorrow · 12:00–12:30", "For Fri 25 Sep · 12:00–12:30", or null. */
export function slotLine(o: Pick<AdminFoodOrder, "pickupFrom" | "pickupTo">, now: Date = new Date()): string | null {
  const slot = orderSlot(o);
  if (!slot) return null;
  return `For ${slotDayShort(slot, now)} · ${slotTimes(slot)}`;
}

// ── HAS ANYBODY TOLD THE COOK? (M217) ───────────────────────────────────────
//
// A cash booking stays pending_payment until the food is handed over, so its
// status cannot say whether the owner has rung the cook. accepted_at can: it is
// what admin_accept_order() sets, and what stops the sweep that cancels an
// unaccepted order 30 minutes after its slot. Both questions are asked of it.

const PENDING = ["pending_payment", "awaiting_payment_confirmation"];

/** Offer "Confirmed with cook": pending, and nobody has taken it yet. */
export function canConfirmWithCook(o: Pick<AdminFoodOrder, "status" | "acceptedAt">): boolean {
  return !o.acceptedAt && PENDING.includes(o.status);
}

/**
 * "Confirmed with cook · today 14:05", or null.
 *
 * "With cook", because this queue already has a column called Confirmed and it
 * means PAID; the pill must not read as money arriving. Only while the order
 * is still pending: once it is paid or cooking, its column says more.
 */
export function confirmedLine(
  o: Pick<AdminFoodOrder, "status" | "acceptedAt">,
  now: Date = new Date(),
): string | null {
  if (!o.acceptedAt || !PENDING.includes(o.status)) return null;
  const at = parseInstant(o.acceptedAt);
  return at ? `Confirmed with cook · ${momentShort(at, now)}` : "Confirmed with cook";
}
