// ── THE COOK'S DAY: TODAY, AND WHAT IS BOOKED FOR LATER (M216) ──────────────
//
// Until M216 every order on the kitchen board was for NOW: it arrived, it was
// cooked, it left, and the only clock that mattered was how long it had been
// waiting. Chez Banane now takes orders one to two days ahead (24 hours'
// notice), and kitchen_dashboard() keeps a booked order on the board until a
// day after its slot. So the board has to answer a question it never had to:
// IS THIS ORDER FOR TODAY?
//
// Get that wrong in one direction and a cook puts Friday's octopus on on
// Wednesday; in the other, Friday's order sits under "Coming up" on Friday
// while the customer walks to the counter.
//
// Kept out of the component so it can be tested against a fixed clock — the
// board itself cannot be driven without a kitchen login. Everything here takes
// `now` explicitly, and the calendar arithmetic is lib/orders/slot.ts's:
// Rodrigues is UTC+4 all year, so "today" is the same answer on a tablet in
// Port Mathurin, a laptop set to Paris, and a test runner in UTC.

import {
  parseInstant, slotFromBounds, isSlotLaterDay, isSlotToday, slotDayWords, slotTimes,
  type SlotWindow,
} from "@/lib/orders/slot";

/** M216 — the booked window, ISO bounds. Null for an as-soon-as-ready order. */
export type SlotBounds = {
  pickupFrom?: string | null;
  pickupTo?: string | null;
};

/** What every helper here needs from a board order. */
export type BoardTimed = SlotBounds & { placedAt: string };

type BoardOrder = BoardTimed & {
  status: string;
  finished?: boolean;
};

const MINUTE = 60_000;

/** The booked window, or null for an as-soon-as-ready order. */
export function orderSlot(o: SlotBounds): SlotWindow | null {
  return slotFromBounds(o.pickupFrom, o.pickupTo);
}

/**
 * Is this order booked for a LATER Rodrigues day than today?
 *
 * The one test the Orders tab and All Day both use, so the two screens can
 * never disagree about what today's cooking is. As-soon-as-ready: no. A slot
 * today: no. A slot on an EARLIER day that is still live — cooked yesterday
 * and never collected — is not "later" either: it is overdue, which makes it
 * today's problem, not tomorrow's.
 */
export function isForLaterDay(o: SlotBounds, now: Date): boolean {
  const slot = orderSlot(o);
  return !!slot && isSlotLaterDay(slot, now);
}

/**
 * When the food is needed: the slot's start, or when it was ordered.
 *
 * kitchen_dashboard() sorts by coalesce(pickupFrom, placedAt) for the same
 * reason. An order placed on Monday for Wednesday noon belongs after
 * Wednesday's 11:40 walk-up, not above everything else because it is oldest.
 */
export function cookBy(o: BoardTimed): number {
  return (parseInstant(o.pickupFrom) ?? parseInstant(o.placedAt))?.getTime() ?? 0;
}

/**
 * The live orders, split into Today and Coming up, each in the order it has
 * to be cooked. Finished orders are not in either — the board keeps those in
 * their own record below.
 */
export function splitLive<T extends BoardTimed & { finished?: boolean }>(
  orders: readonly T[],
  now: Date,
): { today: T[]; later: T[] } {
  const live = orders.filter((o) => !o.finished).sort((a, b) => cookBy(a) - cookBy(b));
  return {
    today: live.filter((o) => !isForLaterDay(o, now)),
    later: live.filter((o) => isForLaterDay(o, now)),
  };
}

/** Statuses whose next step is "Start cooking". */
const NOT_STARTED = new Set(["pending_payment", "paid"]);

/**
 * A booked order whose day has not come: the board must NOT offer
 * "Start cooking".
 *
 * A cash pre-order sits in pending_payment until the cook starts it, and
 * starting it is what stops it being auto-cancelled at the end of its slot
 * (M216). One tap on Wednesday for Friday's order therefore does two wrong
 * things at once — food cooked two days early, and an order that no longer
 * lets go if the customer never comes. On the slot's own day the normal
 * flow returns by itself, at Rodrigues midnight.
 *
 * Only the first step is held. An order already cooking keeps its "Food is
 * ready" — hiding the way forward from food on the stove helps nobody.
 */
export function waitsForItsDay(o: BoardOrder, now: Date): boolean {
  return !o.finished && NOT_STARTED.has(o.status) && isForLaterDay(o, now);
}

// ── HOW URGENT A CARD LOOKS ────────────────────────────────────────────────
//
// Toast's traffic light, in this kitchen's palette. For an as-soon-as-ready
// order the clock is how long the customer has been waiting, and the
// thresholds are deliberately generous — a Rodrigues kitchen cooks to order,
// and a screen that screams at ten minutes is a screen people learn to ignore.
//
// A BOOKED order cannot be aged that way. It was placed a day ago, so by the
// old rule every pre-order would arrive red and stay red: the loudest card on
// the board would be the one that needs nothing yet. Its clock is the slot —
// amber in the hour before, red once the slot has started and the food is
// not ready. An order for a later day is never urgent, whatever its age.

export type Tone = "calm" | "warn" | "late" | "ahead";

/** Walk-up: minutes since placed. */
export const AGE_WARN_MIN = 12;
export const AGE_LATE_MIN = 25;
/** Booked: minutes before the slot starts. */
export const SLOT_WARN_MIN = 60;

export function cardTone(o: BoardOrder, now: Date): Tone {
  const slot = orderSlot(o);
  if (!slot) {
    const mins = minutesBetween(parseInstant(o.placedAt), now);
    if (mins >= AGE_LATE_MIN) return "late";
    if (mins >= AGE_WARN_MIN) return "warn";
    return "calm";
  }
  if (isSlotLaterDay(slot, now)) return "ahead";
  // Ready before the slot is the whole point of booking one. Nothing to rush.
  if (o.status === "ready_for_pickup") return "calm";
  const untilStart = slot.from.getTime() - now.getTime();
  if (untilStart <= 0) return "late";
  if (untilStart <= SLOT_WARN_MIN * MINUTE) return "warn";
  return "calm";
}

function minutesBetween(from: Date | null, now: Date): number {
  if (!from) return 0;
  return Math.max(0, Math.floor((now.getTime() - from.getTime()) / MINUTE));
}

/** "12 min", "2h 5m". */
export function span(mins: number): string {
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

/**
 * The words next to the clock icon.
 *
 *   walk-up          "12 min"          (waiting since placed, as always)
 *   booked, today    "in 45 min" → "due now" → "10 min late"
 *   booked, later    "booked 3h 5m ago"
 *   finished         time since placed, as always
 *
 * "Late" counts from the END of the slot: during the window the customer is
 * entitled to walk in at any minute, and the card is already red and says
 * "due now". Once the food is ready it is the customer who is late, so the
 * clock says how long it has been waiting instead of blaming the kitchen.
 */
export function clockText(o: BoardOrder, now: Date): string {
  const slot = orderSlot(o);
  const sincePlaced = minutesBetween(parseInstant(o.placedAt), now);
  if (!slot || o.finished) return sincePlaced < 1 ? "just now" : span(sincePlaced);
  if (isSlotLaterDay(slot, now)) {
    return sincePlaced < 1 ? "booked just now" : `booked ${span(sincePlaced)} ago`;
  }
  const t = now.getTime();
  if (t < slot.from.getTime()) return `in ${span(Math.ceil((slot.from.getTime() - t) / MINUTE))}`;
  if (t < slot.to.getTime()) return "due now";
  const over = Math.max(1, Math.floor((t - slot.to.getTime()) / MINUTE));
  return o.status === "ready_for_pickup" ? `waiting ${span(over)}` : `${span(over)} late`;
}

/** "Friday 25 Sep". The board is English-only; the long month does not fit a phone in capitals. */
export function shortDay(d: Date): string {
  const [weekday, date, month] = slotDayWords(d, "en").split(" ");
  return `${weekday} ${date} ${month.slice(0, 3)}`;
}

/** "Friday". */
export function weekdayOf(d: Date): string {
  return slotDayWords(d, "en").split(" ")[0];
}

/**
 * The booked window as the card's headline — day "Today" or "Friday 25 Sep",
 * times "12:00–12:30", shown as "FRIDAY 25 SEP · 12:00–12:30". Null for a
 * walk-up.
 *
 * Two parts, not one string, because the whole line does not fit a phone:
 * measured in Syne 800 at the card's text size, "Friday 25 Sep · 12:00–12:30"
 * is 359px against 309px of card on a 375px screen. Kept whole, it would
 * break wherever the browser liked, "12:00–" on one line and "12:30" on the
 * next. As two unbreakable parts it wraps between the day and the time.
 *
 * Only TODAY is named. "Tomorrow" was considered and left out: the card also
 * says "For Friday — cook on the day", and a board that says "tomorrow" in one
 * line and "Friday" in the next makes the cook reconcile the two. The date is
 * always spelled out, because a weekday alone is ambiguous a week out.
 */
export function slotHeadline(o: BoardTimed, now: Date): { day: string; times: string } | null {
  const slot = orderSlot(o);
  if (!slot) return null;
  return { day: isSlotToday(slot, now) ? "Today" : shortDay(slot.from), times: slotTimes(slot) };
}

/**
 * Who takes the food at that time.
 *
 * For Roulé delivery the slot is when the KITCHEN hands over, not when the
 * customer eats: M216 creates the delivery job only when the cook presses
 * "Food is ready", so a driver comes after that, to the counter.
 */
export function handoverWords(fulfillment: string | null | undefined): string | null {
  switch (fulfillment) {
    case "pickup": return "Customer collects";
    case "rr_delivery": return "A Roulé driver picks it up";
    case "customer_delivery": return "Their own driver picks it up";
    default: return null;
  }
}

/**
 * The banner over the board: "2 new orders just came in", and — when some are
 * booked ahead — which, so a chime for Friday's order does not send the cook
 * looking for something to cook now.
 *
 * Counted against what is LIVE, not the raw list of ids: an order the customer
 * cancelled before anyone looked should not be announced as new work.
 */
export function newOrdersLine(
  newIds: readonly string[],
  live: readonly (BoardTimed & { id: string })[],
  now: Date,
): string | null {
  const fresh = live.filter((o) => newIds.includes(o.id));
  if (fresh.length === 0) return null;
  const ahead = fresh.filter((o) => isForLaterDay(o, now));
  const head = fresh.length === 1 ? "1 new order just came in" : `${fresh.length} new orders just came in`;
  if (ahead.length === 0) return head;
  if (fresh.length === 1) return `${head} — for ${weekdayOf(orderSlot(ahead[0])!.from)}`;
  if (ahead.length === fresh.length) return `${head} — all booked for later days`;
  return `${head} — ${ahead.length} booked for ${ahead.length === 1 ? "a later day" : "later days"}`;
}
