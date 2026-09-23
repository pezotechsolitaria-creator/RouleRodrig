import { describe, it, expect } from "vitest";
import {
  splitLive, cardTone, clockText, slotHeadline, waitsForItsDay, isForLaterDay,
  newOrdersLine, handoverWords, shortDay, cookBy,
} from "./board";

// ── THE COOK'S BOARD, WITH PRE-ORDERS (M216) ─────────────────────────────────
//
// Every clock here is fixed and written in Rodrigues time (UTC+4, no DST), so
// these say the same thing on any machine. Bounds are in the shape
// kitchen_dashboard() sends: lower(pickup_slot) as jsonb,
// "2026-09-25T08:00:00+00:00" — which is Friday 12:00 in Rodrigues.

/** A Rodrigues wall-clock time as an instant. "2026-09-24T10:00" → Thu 10:00 +04. */
const at = (rodrigues: string) => new Date(`${rodrigues}:00+04:00`);
/** The ISO shape the RPC sends for that instant. */
const iso = (rodrigues: string) => at(rodrigues).toISOString().replace(".000Z", "+00:00");

let seq = 0;
type O = {
  id: string; status: string; placedAt: string;
  pickupFrom: string | null; pickupTo: string | null; finished?: boolean;
};
/** A walk-up order placed at a Rodrigues time. */
const asap = (placed: string, extra: Partial<O> = {}): O => ({
  id: `o${++seq}`, status: "pending_payment", placedAt: iso(placed),
  pickupFrom: null, pickupTo: null, ...extra,
});
/** A booked order: placed at one time, for a 30-minute slot starting at another. */
const booked = (placed: string, slotStart: string, extra: Partial<O> = {}): O => ({
  id: `o${++seq}`, status: "pending_payment", placedAt: iso(placed),
  pickupFrom: iso(slotStart),
  pickupTo: new Date(at(slotStart).getTime() + 30 * 60_000).toISOString().replace(".000Z", "+00:00"),
  ...extra,
});

/** Thursday 24 September 2026, 10:00 in Rodrigues. */
const THU_10 = at("2026-09-24T10:00");

describe("today and coming up", () => {
  it("puts walk-ups and today's slots under Today, later days under Coming up", () => {
    const walkUp = asap("2026-09-24T09:50");
    const noonToday = booked("2026-09-23T09:00", "2026-09-24T12:00");
    const friday = booked("2026-09-23T15:00", "2026-09-25T12:00");
    const saturday = booked("2026-09-24T08:00", "2026-09-26T08:30");
    const { today, later } = splitLive([saturday, friday, noonToday, walkUp], THU_10);
    expect(today.map((o) => o.id)).toEqual([walkUp.id, noonToday.id]);
    expect(later.map((o) => o.id)).toEqual([friday.id, saturday.id]);
  });

  it("sorts by when the food is needed, not when it was ordered", () => {
    // Booked on Tuesday for noon today: it is NOT the most urgent thing on the
    // board just because it is the oldest. The 11:40 walk-up is.
    const bookedTuesday = booked("2026-09-22T09:00", "2026-09-24T12:00");
    const walkUp = asap("2026-09-24T11:40");
    const walkUpLate = asap("2026-09-24T12:10");
    const { today } = splitLive([bookedTuesday, walkUpLate, walkUp], at("2026-09-24T12:15"));
    expect(today.map((o) => o.id)).toEqual([walkUp.id, bookedTuesday.id, walkUpLate.id]);
  });

  it("leaves finished orders out of both — they are the day's record", () => {
    const { today, later } = splitLive([
      asap("2026-09-24T09:00", { finished: true, status: "collected" }),
      booked("2026-09-23T09:00", "2026-09-25T12:00", { finished: true, status: "cancelled" }),
    ], THU_10);
    expect(today).toEqual([]);
    expect(later).toEqual([]);
  });

  it("uses the Rodrigues date: Friday starts at 20:00 UTC on Thursday", () => {
    const fri8 = booked("2026-09-23T10:00", "2026-09-25T08:00");
    expect(isForLaterDay(fri8, at("2026-09-24T23:59"))).toBe(true);
    // 00:01 Friday in Rodrigues is still Thursday 20:01 in UTC.
    expect(isForLaterDay(fri8, at("2026-09-25T00:01"))).toBe(false);
    expect(splitLive([fri8], at("2026-09-25T00:01")).today).toHaveLength(1);
  });

  it("keeps an overdue booking from yesterday under Today, not Coming up", () => {
    const yesterday = booked("2026-09-22T10:00", "2026-09-23T16:30", { status: "ready_for_pickup" });
    expect(splitLive([yesterday], THU_10).today).toHaveLength(1);
  });

  it("reads the walk-up's time when there is no slot", () => {
    expect(cookBy(asap("2026-09-24T09:50"))).toBe(at("2026-09-24T09:50").getTime());
    expect(cookBy(booked("2026-09-22T09:00", "2026-09-24T12:00"))).toBe(at("2026-09-24T12:00").getTime());
  });
});

describe("no Start cooking before the day", () => {
  it("holds a new pre-order for a later day", () => {
    expect(waitsForItsDay(booked("2026-09-24T09:00", "2026-09-25T12:00"), THU_10)).toBe(true);
    expect(waitsForItsDay(booked("2026-09-24T09:00", "2026-09-25T12:00", { status: "paid" }), THU_10)).toBe(true);
  });

  it("gives it back on the day itself, from Rodrigues midnight", () => {
    const fri = booked("2026-09-23T09:00", "2026-09-25T12:00");
    expect(waitsForItsDay(fri, at("2026-09-24T23:59"))).toBe(true);
    expect(waitsForItsDay(fri, at("2026-09-25T00:00"))).toBe(false);
  });

  it("never holds a walk-up or today's slot", () => {
    expect(waitsForItsDay(asap("2026-09-24T09:55"), THU_10)).toBe(false);
    expect(waitsForItsDay(booked("2026-09-23T09:00", "2026-09-24T12:00"), THU_10)).toBe(false);
  });

  it("does not hide the way forward from food already on the stove", () => {
    const cooking = booked("2026-09-23T09:00", "2026-09-25T12:00", { status: "preparing" });
    expect(waitsForItsDay(cooking, THU_10)).toBe(false);
  });

  it("does not apply to a finished order", () => {
    const done = booked("2026-09-23T09:00", "2026-09-25T12:00", { finished: true, status: "cancelled" });
    expect(waitsForItsDay(done, THU_10)).toBe(false);
  });
});

describe("how urgent a card looks", () => {
  it("ages a walk-up by time since it was placed, as it always has", () => {
    const o = asap("2026-09-24T10:00");
    expect(cardTone(o, at("2026-09-24T10:11"))).toBe("calm");
    expect(cardTone(o, at("2026-09-24T10:12"))).toBe("warn");
    expect(cardTone(o, at("2026-09-24T10:25"))).toBe("late");
  });

  it("does NOT age a booking by when it was placed — it would arrive red", () => {
    // Placed yesterday morning: by the walk-up rule this is 24 hours old.
    const o = booked("2026-09-23T09:00", "2026-09-24T15:00");
    expect(cardTone(o, THU_10)).toBe("calm");
  });

  it("goes amber in the hour before the slot, red once the slot has started", () => {
    const o = booked("2026-09-23T09:00", "2026-09-24T12:00", { status: "preparing" });
    expect(cardTone(o, at("2026-09-24T10:59"))).toBe("calm");
    expect(cardTone(o, at("2026-09-24T11:00"))).toBe("warn");
    expect(cardTone(o, at("2026-09-24T11:59"))).toBe("warn");
    expect(cardTone(o, at("2026-09-24T12:00"))).toBe("late");
    expect(cardTone(o, at("2026-09-24T13:30"))).toBe("late");
  });

  it("is never red once the food is ready", () => {
    const o = booked("2026-09-23T09:00", "2026-09-24T12:00", { status: "ready_for_pickup" });
    expect(cardTone(o, at("2026-09-24T11:30"))).toBe("calm");
    expect(cardTone(o, at("2026-09-24T12:45"))).toBe("calm");
  });

  it("is never red — or amber — for a later day, however old", () => {
    const o = booked("2026-09-20T09:00", "2026-09-25T08:00");
    expect(cardTone(o, at("2026-09-24T23:59"))).toBe("ahead");
    // On the day, the slot clock takes over.
    expect(cardTone(o, at("2026-09-25T07:30"))).toBe("warn");
  });
});

describe("the words by the clock", () => {
  it("walk-up: how long they have waited", () => {
    const o = asap("2026-09-24T09:00");
    expect(clockText(o, at("2026-09-24T09:00"))).toBe("just now");
    expect(clockText(o, THU_10)).toBe("1h 0m");
  });

  it("booked today: counts down, then due, then late from the END of the slot", () => {
    const o = booked("2026-09-23T09:00", "2026-09-24T12:00", { status: "preparing" });
    expect(clockText(o, THU_10)).toBe("in 2h 0m");
    expect(clockText(o, at("2026-09-24T11:45"))).toBe("in 15 min");
    expect(clockText(o, at("2026-09-24T12:10"))).toBe("due now");
    expect(clockText(o, at("2026-09-24T12:40"))).toBe("10 min late");
  });

  it("booked and ready: the customer is the one who is late", () => {
    const o = booked("2026-09-23T09:00", "2026-09-24T12:00", { status: "ready_for_pickup" });
    expect(clockText(o, at("2026-09-24T12:40"))).toBe("waiting 10 min");
  });

  it("booked for later: when it came in, not a countdown", () => {
    expect(clockText(booked("2026-09-24T07:00", "2026-09-25T12:00"), THU_10)).toBe("booked 3h 0m ago");
    expect(clockText(booked("2026-09-24T10:00", "2026-09-25T12:00"), THU_10)).toBe("booked just now");
  });
});

describe("the headline", () => {
  it("names today as Today", () => {
    expect(slotHeadline(booked("2026-09-23T09:00", "2026-09-24T12:00"), THU_10))
      .toEqual({ day: "Today", times: "12:00–12:30" });
  });

  it("spells out any other day with its date — the long month does not fit a phone in capitals", () => {
    expect(slotHeadline(booked("2026-09-23T09:00", "2026-09-25T12:00"), THU_10))
      .toEqual({ day: "Friday 25 Sep", times: "12:00–12:30" });
    expect(slotHeadline(booked("2026-09-24T09:00", "2026-09-26T08:00"), THU_10))
      .toEqual({ day: "Saturday 26 Sep", times: "08:00–08:30" });
  });

  it("is absent for a walk-up — there is no window to show", () => {
    expect(slotHeadline(asap("2026-09-24T09:00"), THU_10)).toBeNull();
  });

  it("shows Rodrigues wall-clock times whatever the instant's UTC date", () => {
    // 00:30 on Friday in Rodrigues is 20:30 UTC on Thursday.
    const o = booked("2026-09-23T09:00", "2026-09-25T00:30");
    expect(slotHeadline(o, THU_10)).toEqual({ day: "Friday 25 Sep", times: "00:30–01:00" });
    expect(shortDay(at("2026-10-01T09:00"))).toBe("Thursday 1 Oct");
  });
});

describe("who takes the food", () => {
  it("says it for each way an order leaves the kitchen", () => {
    expect(handoverWords("pickup")).toBe("Customer collects");
    // M216: the delivery job is created when the food is ready, so the slot is
    // the kitchen's handover to the driver.
    expect(handoverWords("rr_delivery")).toBe("A Roulé driver picks it up");
    expect(handoverWords("customer_delivery")).toBe("Their own driver picks it up");
    expect(handoverWords(null)).toBeNull();
    expect(handoverWords("something new")).toBeNull();
  });
});

describe("the new-orders banner still announces a pre-order", () => {
  const walkUp = asap("2026-09-24T09:58");
  const friday = booked("2026-09-24T09:59", "2026-09-25T12:00");
  const saturday = booked("2026-09-24T09:59", "2026-09-26T12:00");

  it("is silent with nothing new", () => {
    expect(newOrdersLine([], [walkUp], THU_10)).toBeNull();
  });

  it("says a walk-up exactly as before", () => {
    expect(newOrdersLine([walkUp.id], [walkUp], THU_10)).toBe("1 new order just came in");
  });

  it("names the day of a single pre-order, so the chime does not send the cook to the stove", () => {
    expect(newOrdersLine([friday.id], [friday], THU_10)).toBe("1 new order just came in — for Friday");
  });

  it("says how many of several are for later", () => {
    expect(newOrdersLine([walkUp.id, friday.id], [walkUp, friday], THU_10))
      .toBe("2 new orders just came in — 1 booked for a later day");
    expect(newOrdersLine([walkUp.id, friday.id, saturday.id], [walkUp, friday, saturday], THU_10))
      .toBe("3 new orders just came in — 2 booked for later days");
    expect(newOrdersLine([friday.id, saturday.id], [friday, saturday], THU_10))
      .toBe("2 new orders just came in — all booked for later days");
  });

  it("does not announce an order that is no longer live", () => {
    // Cancelled by the customer before anyone looked: not new work.
    expect(newOrdersLine([walkUp.id, "gone"], [walkUp], THU_10)).toBe("1 new order just came in");
    expect(newOrdersLine(["gone"], [walkUp], THU_10)).toBeNull();
  });
});

// ── THE HOURS WHERE UTC AND RODRIGUES DISAGREE ABOUT THE DATE ───────────────
//
// From 20:00 to 23:59 UTC it is already tomorrow in Rodrigues. An order placed
// at 23:30 UTC on Thursday is placed at 03:30 on FRIDAY on the island — and a
// board that asked the UTC date would still think it was Thursday: Friday's
// noon booking would sit under "Coming up" with no "Start cooking" on the very
// morning it is due, and All Day would leave it out of Friday's pans. The
// placed time below is written in UTC on purpose, in the shape the RPC sends.
describe("an order placed at 23:30 UTC — 03:30 the next morning in Rodrigues", () => {
  const PLACED = "2026-09-24T23:30:00+00:00";    // Fri 25 Sep, 03:30 in Rodrigues
  const NOW = new Date("2026-09-24T23:40:00Z"); // Fri 25 Sep, 03:40 in Rodrigues

  // With 24 hours' notice and hours of 08:00–17:00 (M216), the first slot open
  // to an order placed at 03:30 on Friday is Saturday 08:00.
  const placedFriEarly = booked("2026-09-25T03:30", "2026-09-26T08:00", { placedAt: PLACED });
  // Booked on Wednesday for noon on Friday: due TODAY, island time.
  const fridayNoon = booked("2026-09-23T10:00", "2026-09-25T12:00");
  // A walk-up at that hour (the kitchen is shut, but the board must not care).
  const walkUp = asap("2026-09-25T03:30", { placedAt: PLACED });

  it("is the island's Friday, so Friday's booking is Today and Saturday's is Coming up", () => {
    const { today, later } = splitLive([placedFriEarly, fridayNoon, walkUp], NOW);
    // The walk-up (03:30) before the noon booking; Saturday alone below.
    expect(today.map((o) => o.id)).toEqual([walkUp.id, fridayNoon.id]);
    expect(later.map((o) => o.id)).toEqual([placedFriEarly.id]);
  });

  it("gives Friday's booking its Start cooking, and holds Saturday's", () => {
    expect(waitsForItsDay(fridayNoon, NOW)).toBe(false);
    expect(waitsForItsDay(placedFriEarly, NOW)).toBe(true);
  });

  it("heads Friday's card Today and Saturday's with its date", () => {
    expect(slotHeadline(fridayNoon, NOW)).toEqual({ day: "Today", times: "12:00–12:30" });
    expect(slotHeadline(placedFriEarly, NOW)).toEqual({ day: "Saturday 26 Sep", times: "08:00–08:30" });
    // The board's own "Today" heading names the island's date, not the UTC one.
    expect(shortDay(NOW)).toBe("Friday 25 Sep");
  });

  it("reads the clock from the placed instant, not from a date", () => {
    expect(clockText(placedFriEarly, NOW)).toBe("booked 10 min ago");
    expect(clockText(walkUp, NOW)).toBe("10 min");
    expect(cardTone(placedFriEarly, NOW)).toBe("ahead");
    // Friday noon is eight hours off: calm, however long ago it was booked.
    expect(cardTone(fridayNoon, NOW)).toBe("calm");
  });

  it("chimes the Saturday booking with its day", () => {
    expect(newOrdersLine([placedFriEarly.id], [placedFriEarly, fridayNoon], NOW))
      .toBe("1 new order just came in — for Saturday");
  });
});
