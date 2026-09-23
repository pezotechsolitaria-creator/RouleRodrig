// ── "COLLECTION FRI 25 SEP, 12:00–12:30" — THE DESKS' SHORT FORM (M216) ─────
//
// lib/orders/slot.ts says a booked slot the long way, for customers and
// emails: "Friday 25 September, 12:00–12:30". The two screens that run a
// kitchen — the merchant console and the owner's /admin/food queue — show it in
// a pill, a table cell and a card header, where the long form wraps into three
// lines. This is the same instant in the same Rodrigues time, shortened, and
// built ON slot.ts rather than beside it: the UTC+4 arithmetic lives there once.
//
// English only, deliberately: both desks are English screens. A customer never
// sees anything from this file.

import {
  parseSlotRange,
  rodriguesDay,
  slotDayWords,
  slotTimes,
  type SlotWindow,
} from "@/lib/orders/slot";

const DAY_MS = 24 * 60 * 60 * 1000;
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

/**
 * How long after its slot ENDS expire_order() cancels a booked order nobody
 * accepted (M181b). marketplace_settings.pickup_grace_minutes can move it; 30
 * is its default and its value today. The screens cannot read the setting, so
 * they state this and never promise a minute more.
 */
export const SLOT_GRACE_MS = 30 * 60 * 1000;

/**
 * "today", "tomorrow", or "Fri 25 Sep" — the slot's day in Rodrigues time.
 *
 * Lower-case on purpose so it reads mid-sentence ("Collection tomorrow, …");
 * a caller that starts a line with it capitalises it itself. Anything further
 * out keeps its DATE as well as its weekday, because with Chez Banane taking
 * orders two days ahead, "Fri" alone is one misread away from next Friday.
 */
export function slotDayShort(w: SlotWindow, now: Date = new Date()): string {
  const day = rodriguesDay(w.from);
  if (day === rodriguesDay(now)) return "today";
  if (day === rodriguesDay(new Date(now.getTime() + DAY_MS))) return "tomorrow";
  const [weekday, date, month] = slotDayWords(w.from, "en").split(" ");
  return `${weekday.slice(0, 3)} ${date} ${month.slice(0, 3)}`;
}

/**
 * "tomorrow, 12:30" — one instant, the desks' short way.
 *
 * A zero-length window, so the day and the clock come from slot.ts's single
 * copy of the UTC+4 arithmetic rather than a second one here.
 */
export function momentShort(d: Date, now: Date = new Date()): string {
  const w = { from: d, to: d };
  return `${slotDayShort(w, now)}, ${slotTimes(w).split("–")[0]}`;
}

/**
 * When expire_order() would cancel this booked order if nobody accepts it.
 *
 * Two paths, and the earlier one wins (M181b):
 *   · the slot ended and the grace ran out — the usual one;
 *   · the payment hold lapsed — but never before the slot BEGINS, the guard
 *     that stops tonight's sweep cancelling tomorrow's lunch.
 * Chez Banane's 7-day cash hold never comes first; a short transfer hold on an
 * order booked days ahead can, which is why it is still asked.
 *
 * Only a pending_payment order is swept. The caller decides whether to ask.
 */
export function slotCancelAt(
  w: SlotWindow,
  holdDeadline: Date | null,
  graceMs: number = SLOT_GRACE_MS,
): Date {
  const byPickup = w.to.getTime() + graceMs;
  if (!holdDeadline) return new Date(byPickup);
  const byHold = Math.max(holdDeadline.getTime(), w.from.getTime());
  return new Date(Math.min(byPickup, byHold));
}

/**
 * What happens in the window, from the kitchen's side.
 *
 * A delivery order is not dispatched when it is placed — the driver job is
 * created when the cook marks it ready (M49) — so for delivery the slot is
 * when the food must leave the kitchen, and "Delivery" is the honest word.
 * A missing method is an older order, and every one of those was a pickup.
 */
export function handoverWord(fulfillment: string | null | undefined): "Collection" | "Delivery" {
  return fulfillment === "rr_delivery" || fulfillment === "customer_delivery" ? "Delivery" : "Collection";
}

/**
 * "Collection tomorrow, 12:00–12:30" / "Delivery Fri 25 Sep, 12:00–12:30",
 * straight from the PostgREST range text — or null when nothing was booked.
 */
export function slotDueLabel(
  range: string | null | undefined,
  fulfillment: string | null | undefined,
  now: Date = new Date(),
): string | null {
  const w = parseSlotRange(range);
  if (!w) return null;
  return `${handoverWord(fulfillment)} ${slotDayShort(w, now)}, ${slotTimes(w)}`;
}

/**
 * Is a BOOKED order running late for its own window? One rule for both desks.
 *
 * Minutes since it was placed means nothing for a pre-order: an order placed
 * yesterday for tomorrow is not 26 hours late, it is early. What matters is the
 * slot, and how far along the order is relative to it:
 *
 *   · nobody has taken it yet  — two hours before the slot. Unaccepted, it is
 *     cancelled 30 minutes after the slot ends (M181), and two hours is enough
 *     to ring the cook and still cook it.
 *   · taken, not cooking yet   — once the window opens. It should be cooking.
 *   · cooking                  — once the window opens. It should be ready.
 *   · ready                    — once the window closes. Nobody came for it.
 */
export function slotRunningLate(
  w: SlotWindow,
  status: string,
  accepted: boolean,
  now: Date = new Date(),
): boolean {
  if (["collected", "cancelled", "refunded"].includes(status)) return false;
  const t = now.getTime();
  if (status === "ready_for_pickup") return t > w.to.getTime();
  const untaken =
    !accepted && (status === "pending_payment" || status === "awaiting_payment_confirmation");
  if (untaken) return t >= w.from.getTime() - TWO_HOURS_MS;
  return t >= w.from.getTime();
}
