// ── WHEN AN ORDER NEEDS A TIME, AND WHAT "CLOSED NOW" STILL BLOCKS (M216) ────
//
// Until M216 the checkout had one timing rule: the shop is open now, or nothing
// can be ordered. That was right while every food order was "as soon as it's
// ready". Chez Banane now needs a day's notice (M216), so:
//
//   · its customers are ordering FOR a later slot — the kitchen being closed at
//     23:44 on a Wednesday says nothing about Friday at noon. The server judges
//     a slotted order at the slot's own instant (create_food_order stamps
//     rr_fulfil_at(), and store_schedule_status reads it), so the form must
//     not refuse on a clock the server no longer asks;
//   · ASAP is refused outright (RR030, by food_pickup_window AND a trigger on
//     orders), for EVERY fulfilment — so the time is not a pickup-only
//     question any more. For delivery it is when the kitchen hands the food
//     over: a Roulé job is only created when the cook marks it ready.
//
// This module DECIDES NOTHING about which times exist — that is
// food_pickup_slots(), read by the WhenPicker. It only turns what the picker
// reported, and what store_schedule_status said about NOW, into the few
// yes/no answers the form needs. Pure, so each answer is pinned by a test
// rather than rediscovered by a customer staring at a dark button.

import type { SellerWords, CheckoutCopy } from "@/lib/checkout/copy.i18n";
import type { Language } from "@/lib/i18n";
import { formatSlot, slotFromBounds } from "@/lib/orders/slot";

export type Fulfilment = "pickup" | "customer_delivery" | "rr_delivery";
export type Provider = "cash" | "bank_transfer";

/** A time the picker offered. `startsAt` is the server's own instant. */
export type ChosenSlot = { date: string; time: string; startsAt: string | null };

/** What the WhenPicker learned from /api/food/slots, reported up to checkout. */
export type WhenState = {
  status: "loading" | "ready" | "failed";
  /** kitchen_notice_hours() — 0 for a walk-up kitchen. */
  noticeHours: number;
  /** The server's word on ASAP. False for a kitchen that needs notice. */
  asap: boolean;
  /** At least one day in the horizon has a time that can be booked. */
  bookable: boolean;
};

export const WHEN_LOADING: WhenState = { status: "loading", noticeHours: 0, asap: true, bookable: false };

export type TimingInput = {
  /** sellerDomain === "food" — server-decided, never from the URL. */
  isFood: boolean;
  fulfilment: Fulfilment;
  when: WhenState;
  /** The picker's choice, as held in form state (it may be stale). */
  slot: ChosenSlot | null;
  /** store_schedule_status(): the shop keeps hours and is shut right now. */
  closedNow: boolean;
  /** store_schedule_status(): Roulé delivery is not running right now. */
  deliveryOffNow: boolean;
};

export type WhenBlock = "loading" | "failed" | "none" | "choose";

export type Timing = {
  /** A time is compulsory: the server refuses ASAP (RR030). */
  needsNotice: boolean;
  /** The time belongs to this order, so it is sent. */
  applies: boolean;
  /** Draw the picker. Also when it failed: the Retry must be seen. */
  visible: boolean;
  /** The slot to SEND — never one the customer cannot see. */
  slot: ChosenSlot | null;
  /** Why the "when" question stops the button, or null. */
  whenBlock: WhenBlock | null;
  /** The ASAP opening-hours gate, which a slotted order does not face here. */
  scheduleReady: boolean;
  /** Per option: shut now, with no later time it could be booked for. */
  closedFor: Record<Fulfilment, boolean>;
  /** rr_delivery's "not running right now" — moot when the slot decides. */
  deliveryOffFor: boolean;
  /** Which closed banner to draw: a dead end, or "order for later". */
  closedBanner: "hard" | "later" | null;
};

/** Does the "when" question belong to an order sent this way? */
export function whenAppliesTo(isFood: boolean, f: Fulfilment, when: WhenState): boolean {
  // Walk-up kitchens keep M161's rule — the picker is a COLLECTION choice, and
  // a delivery goes as soon as it is ready. A kitchen that needs notice gets a
  // time whichever way the food leaves: the slot is the handover.
  return isFood && (f === "pickup" || needsNoticeFor(isFood, when));
}

function needsNoticeFor(isFood: boolean, when: WhenState): boolean {
  // Two witnesses, as /api/food/slots itself uses: the notice, and the
  // server's own "no ASAP" (which also covers its notice read failing).
  return isFood && when.status === "ready" && (when.noticeHours > 0 || !when.asap);
}

export function checkoutTiming(i: TimingInput): Timing {
  const needsNotice = needsNoticeFor(i.isFood, i.when);
  const applies = whenAppliesTo(i.isFood, i.fulfilment, i.when);
  const slot = applies ? i.slot : null;

  // A later time is possible for this option while the shop is shut now.
  // Until the picker has answered — loading, or a failed read waiting on its
  // Retry — a food order is given the benefit of the doubt: the button is
  // held by `whenBlock` anyway, so nothing is placed on the guess. What it
  // prevents is a red "closed, come back in opening hours" and three dead
  // radios, shown to the customer of a kitchen that turns out, one Retry
  // later, to take their order for Friday.
  const unknown = i.isFood && i.when.status !== "ready";
  const laterFor = (f: Fulfilment) =>
    unknown || (i.isFood && (needsNotice || (f === "pickup" && i.when.bookable)));

  const closedFor: Record<Fulfilment, boolean> = {
    pickup: i.closedNow && !laterFor("pickup"),
    customer_delivery: i.closedNow && !laterFor("customer_delivery"),
    rr_delivery: i.closedNow && !laterFor("rr_delivery"),
  };

  // create_order checks the delivery window at rr_fulfil_at() — the slot —
  // so "not running right now" only stops an order that is FOR right now.
  // Not asserted while unknown either, for the same reason as closedFor.
  const deliveryOffFor = i.deliveryOffNow && !needsNotice && !unknown;

  const whenBlock: WhenBlock | null = !i.isFood
    ? null
    : i.when.status === "loading"
      ? "loading"
      // No silent ASAP fallback (M216): after a failed read nobody knows
      // whether this kitchen takes ASAP at all, and for the one kitchen on
      // /food today it does not. The picker shows a Retry.
      : i.when.status === "failed"
        ? "failed"
        : needsNotice && !slot
          ? i.when.bookable ? "choose" : "none"
          : null;

  const scheduleReady =
    slot !== null || (!i.closedNow && !(i.fulfilment === "rr_delivery" && i.deliveryOffNow));

  // "Order for a later time" only when a later time EXISTS. Friday evening at
  // a kitchen needing 24 hours and shut on Sunday has none — the picker says
  // so — and a banner promising "later" above that sentence contradicts it.
  const closedBanner = !i.closedNow || unknown
    ? null
    : i.isFood && i.when.bookable
      ? "later"
      : "hard";

  return {
    needsNotice,
    applies,
    visible: applies || (i.isFood && i.when.status === "failed"),
    slot,
    whenBlock,
    scheduleReady,
    closedFor,
    deliveryOffFor,
    closedBanner,
  };
}

/** "Friday 25 September, 12:00–12:30" from the server's instant, or null. */
export function slotWords(slot: ChosenSlot | null, lang: Language): string | null {
  const w = slotFromBounds(slot?.startsAt ?? null, null);
  // Always the date, never "Tomorrow": this line is the customer's receipt of
  // what they chose, read again at the door.
  return w ? formatSlot(w, lang) : null;
}

/**
 * What replaces the reservation clock under a SLOTTED food order.
 *
 * checkoutHoldCopy() says "reserves your items for 7 days — until about Wed
 * 30 Sep". For a booked order that date is the cash hold (auto_release_at),
 * not a deadline anyone has to meet: the cook starts on the day, and an
 * order nobody accepted is cancelled half an hour after its slot ends. So the
 * sentence is the slot, and how the money changes hands.
 */
export function slotPaymentLine(
  copy: CheckoutCopy["form"]["slotted"],
  s: SellerWords,
  provider: Provider,
  fulfilment: Fulfilment,
  when: string,
): string {
  if (provider === "bank_transfer") return copy.transfer(when);
  if (fulfilment === "rr_delivery") return copy.cashDelivery(s, when);
  if (fulfilment === "customer_delivery") return copy.cashSomeone(when);
  return copy.cashCollect(when);
}
