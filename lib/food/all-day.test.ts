import { describe, it, expect } from "vitest";
import { allDayFrom } from "./all-day";

// The number on this screen is the number somebody puts in a pan. Every test
// here is about it being right in the direction that costs food or money.

const item = (name: string, qty: number, variant: string | null = null, soldOut = false) =>
  ({ name, variant, qty, soldOut });

/** The single kitchen's lines. Most tests here use one kitchen. */
const one = (v: { groups: { items: unknown[] }[] }) => (v.groups[0]?.items ?? []) as {
  name: string; variant: string | null; qty: number; tickets: number; soldOut: boolean;
}[];

describe("all day totals", () => {
  it("adds the same dish across separate tickets", () => {
    const v = allDayFrom([
      { items: [item("Chicken Curry", 2)] },
      { items: [item("Chicken Curry", 4)] },
    ]);
    expect(one(v)).toHaveLength(1);
    expect(one(v)[0]).toMatchObject({ name: "Chicken Curry", qty: 6, tickets: 2 });
    expect(v.totalPortions).toBe(6);
  });

  it("keeps variants apart — they are different pans", () => {
    // The whole reason a cook looks at this screen is to batch. Telling them
    // "5× Curry" when it is 2 large and 3 small is worse than not telling them.
    const v = allDayFrom([
      { items: [item("Curry", 2, "Large"), item("Curry", 3, "Small")] },
    ]);
    expect(one(v).map((i) => [i.name, i.variant, i.qty])).toEqual([
      ["Curry", "Small", 3],
      ["Curry", "Large", 2],
    ]);
  });

  it("does not collide a dish whose NAME contains the separator", () => {
    // "Curry · Large" as a plain dish must not merge with "Curry" + variant
    // "Large". Contrived, but it is the kind of thing that only shows up once
    // somebody names a dish that way in production.
    const v = allDayFrom([
      { items: [item("Curry · Large", 1)] },
      { items: [item("Curry", 1, "Large")] },
    ]);
    expect(one(v)).toHaveLength(2);
  });

  it("counts tickets, not line items", () => {
    // Two lines of the same dish on ONE order is one ticket to walk to.
    const v = allDayFrom([
      { items: [item("Fish", 1), item("Fish", 2)] },
    ]);
    expect(one(v)[0]).toMatchObject({ qty: 3, tickets: 1 });
  });

  it("ignores finished orders", () => {
    const v = allDayFrom([
      { items: [item("Rice", 3)], finished: true },
      { items: [item("Rice", 1)] },
    ]);
    expect(one(v)[0].qty).toBe(1);
    expect(v.countedOrders).toBe(1);
  });

  it("REFUSES to count an order waiting on a bank transfer", () => {
    // The single most important rule here. The ticket for one of these says
    // "Nothing to cook yet"; All Day is where somebody acts in bulk, so
    // including it would put food on for an order that may never be paid.
    const v = allDayFrom([
      { items: [item("Octopus", 5)], waitingOnTransfer: true },
      { items: [item("Octopus", 2)] },
    ]);
    expect(one(v)[0].qty).toBe(2);
    expect(v.countedOrders).toBe(1);
    expect(v.excludedOrders).toBe(1);
  });

  it("reports what it excluded rather than hiding it", () => {
    // A cook who reads "2 portions" must be able to trust it. If three orders
    // were left out, the screen has to say so.
    const v = allDayFrom([
      { items: [item("A", 1)], waitingOnTransfer: true },
      { items: [item("A", 1)], waitingOnTransfer: true },
      { items: [item("B", 1)] },
    ]);
    expect(v.excludedOrders).toBe(2);
    expect(v.countedOrders).toBe(1);
  });

  it("keeps a sold-out dish on the list, flagged", () => {
    // Dropping it hides a problem: those customers ordered it and still need
    // telling. Sold out anywhere marks the whole line.
    const v = allDayFrom([
      { items: [item("Napolitain", 2, null, false)] },
      { items: [item("Napolitain", 1, null, true)] },
    ]);
    expect(one(v)).toHaveLength(1);
    expect(one(v)[0]).toMatchObject({ qty: 3, soldOut: true });
  });

  it("sorts biggest batch first, then stably by name", () => {
    // Cooks work down from the biggest pan. Ties must not reshuffle between
    // polls, or a self-refreshing screen becomes unreadable.
    const v = allDayFrom([
      { items: [item("Zebra", 2), item("Apple", 2), item("Mango", 9)] },
    ]);
    expect(one(v).map((i) => i.name)).toEqual(["Mango", "Apple", "Zebra"]);
  });

  it("survives junk without producing a wrong number", () => {
    const v = allDayFrom([
      { items: [item("", 5)] },                       // no name
      { items: [item("Ghost", 0)] },                  // zero qty
      { items: [item("Ghost", -3)] },                 // negative
      { items: [item("Ghost", Number.NaN)] },         // NaN
      { items: [] },                                  // empty order
      { items: [item("  Real  ", 2)] },               // padded name
    ]);
    expect(one(v)).toHaveLength(1);
    expect(one(v)[0]).toMatchObject({ name: "Real", qty: 2 });
    expect(v.totalPortions).toBe(2);
  });

  it("rounds a fractional quantity rather than carrying it", () => {
    // Nobody cooks 2.4 portions. Whatever produced it, the pan takes a whole
    // number.
    const v = allDayFrom([{ items: [item("Mine", 2.4)] }]);
    expect(one(v)[0].qty).toBe(2);
  });

  it("is empty, not broken, with nothing live", () => {
    const v = allDayFrom([]);
    expect(v).toEqual({ groups: [], totalPortions: 0, countedOrders: 0, excludedOrders: 0, laterOrders: 0 });
  });

  // ── The bug this grouping exists to prevent ─────────────────────────────
  it("NEVER merges the same dish across two kitchens", () => {
    // A cook can be on more than one kitchen team; the ticket card names the
    // kitchen on every order for that reason. "4 at Ti Kitchen" plus "2 at Riri"
    // is not "6 curry" — that is true of no pan anywhere, and it would send
    // somebody to cook six portions in one building.
    const v = allDayFrom([
      { kitchen: "Ti Kitchen", items: [item("Curry", 4)] },
      { kitchen: "Riri Resto", items: [item("Curry", 2)] },
    ]);
    expect(v.groups).toHaveLength(2);
    expect(v.groups.map((g) => [g.kitchen, g.totalPortions])).toEqual([
      ["Ti Kitchen", 4],
      ["Riri Resto", 2],
    ]);
    // The headline total is still the whole load across both.
    expect(v.totalPortions).toBe(6);
  });

  it("still adds up within one kitchen", () => {
    const v = allDayFrom([
      { kitchen: "Ti Kitchen", items: [item("Curry", 4)] },
      { kitchen: "Ti Kitchen", items: [item("Curry", 2)] },
    ]);
    expect(v.groups).toHaveLength(1);
    expect(v.groups[0].items[0]).toMatchObject({ qty: 6, tickets: 2 });
  });

  it("puts the busiest kitchen first, stably", () => {
    const v = allDayFrom([
      { kitchen: "Bravo", items: [item("A", 1)] },
      { kitchen: "Alpha", items: [item("A", 9)] },
    ]);
    expect(v.groups.map((g) => g.kitchen)).toEqual(["Alpha", "Bravo"]);
  });

  it("treats a missing kitchen name as one unnamed group", () => {
    const v = allDayFrom([
      { items: [item("A", 1)] },
      { kitchen: "   ", items: [item("A", 1)] },
      { kitchen: null, items: [item("A", 1)] },
    ]);
    expect(v.groups).toHaveLength(1);
    expect(v.groups[0]).toMatchObject({ kitchen: "", totalPortions: 3 });
  });

  it("treats a blank variant as no variant", () => {
    // An empty string from the database must not create a second line.
    const v = allDayFrom([
      { items: [item("Salad", 1, "")] },
      { items: [item("Salad", 1, null)] },
      { items: [item("Salad", 1, "   ")] },
    ]);
    expect(one(v)).toHaveLength(1);
    expect(one(v)[0]).toMatchObject({ qty: 3, variant: null, tickets: 3 });
  });
});

// ── M216: Chez Banane takes orders one to two days ahead ──────────────────
//
// Every clock here is fixed and written in Rodrigues time (UTC+4, no DST), so
// the tests say the same thing on any machine. The bounds are in the shape
// kitchen_dashboard() sends: "2026-09-25T08:00:00+00:00" is Friday 12:00 in
// Rodrigues.
describe("all day counts today's cooking only (M216)", () => {
  /** Thursday 24 Sept 2026, 10:00 in Rodrigues. */
  const THU_10 = new Date("2026-09-24T10:00:00+04:00");
  const slot = (rodriguesStart: string) => {
    const from = new Date(`${rodriguesStart}:00+04:00`);
    return {
      pickupFrom: from.toISOString().replace(".000Z", "+00:00"),
      pickupTo: new Date(from.getTime() + 30 * 60_000).toISOString().replace(".000Z", "+00:00"),
    };
  };

  it("leaves Friday's pre-order out of Thursday's pans, and says so", () => {
    const v = allDayFrom([
      { items: [item("Curry", 6)], ...slot("2026-09-25T12:00") },  // Friday
      { items: [item("Curry", 2)], ...slot("2026-09-24T12:00") },  // today
      { items: [item("Curry", 1)] },                                // walk-up, now
    ], THU_10);
    expect(one(v)[0]).toMatchObject({ name: "Curry", qty: 3, tickets: 2 });
    expect(v.countedOrders).toBe(2);
    expect(v.laterOrders).toBe(1);
    expect(v.excludedOrders).toBe(0);
  });

  it("counts a booked order ON its day — the Rodrigues day, not the UTC one", () => {
    // Thursday 20:30 UTC is already Friday 00:30 in Rodrigues. A board that
    // asked the UTC date would keep Friday's order out of Friday's total for
    // the first four hours of the day.
    const friEarly = new Date("2026-09-25T00:30:00+04:00");
    const order = { items: [item("Octopus", 4)], ...slot("2026-09-25T08:00") };
    expect(allDayFrom([order], new Date("2026-09-24T23:59:00+04:00")).laterOrders).toBe(1);
    const v = allDayFrom([order], friEarly);
    expect(v.laterOrders).toBe(0);
    expect(v.totalPortions).toBe(4);
  });

  it("counts an overdue booking from a past day as today's, not as later", () => {
    // Cooked for yesterday and never collected: still a problem for today.
    const v = allDayFrom([{ items: [item("Mine", 1)], ...slot("2026-09-23T16:30") }], THU_10);
    expect(v.countedOrders).toBe(1);
    expect(v.laterOrders).toBe(0);
  });

  it("reports later-day orders separately from unpaid ones", () => {
    const v = allDayFrom([
      { items: [item("A", 1)], ...slot("2026-09-25T12:00") },
      { items: [item("A", 1)], ...slot("2026-09-26T09:00") },
      { items: [item("A", 1)], waitingOnTransfer: true },
      // For later AND unpaid: later — it is not today's cooking either way.
      { items: [item("A", 1)], waitingOnTransfer: true, ...slot("2026-09-25T13:00") },
      { items: [item("B", 2)] },
    ], THU_10);
    expect(v.laterOrders).toBe(3);
    expect(v.excludedOrders).toBe(1);
    expect(v.countedOrders).toBe(1);
    expect(v.totalPortions).toBe(2);
  });

  it("does not count a finished pre-order as later", () => {
    const v = allDayFrom([{ items: [item("A", 1)], finished: true, ...slot("2026-09-25T12:00") }], THU_10);
    expect(v).toEqual({ groups: [], totalPortions: 0, countedOrders: 0, excludedOrders: 0, laterOrders: 0 });
  });

  it("has nothing to cook when every order is for later — and still says how many", () => {
    const v = allDayFrom([{ items: [item("A", 3)], ...slot("2026-09-26T12:00") }], THU_10);
    expect(v.groups).toEqual([]);
    expect(v.laterOrders).toBe(1);
  });

  it("at 23:30 UTC it is already the next morning on the island", () => {
    // 23:40 UTC on Thursday is 03:40 on FRIDAY in Rodrigues. Friday's noon
    // booking is today's cooking; the order placed ten minutes ago (03:30
    // local) is for Saturday, the first day its 24 hours' notice allows. A
    // total that asked the UTC date would do the opposite of both.
    const now = new Date("2026-09-24T23:40:00Z");
    const v = allDayFrom([
      { items: [item("Octopus", 4)], ...slot("2026-09-25T12:00") },  // Friday, booked earlier
      { items: [item("Octopus", 2)], ...slot("2026-09-26T08:00") },  // placed 23:30 UTC, for Saturday
      { items: [item("Octopus", 1)] },                                // walk-up at 23:30 UTC
    ], now);
    expect(one(v)[0]).toMatchObject({ name: "Octopus", qty: 5, tickets: 2 });
    expect(v.countedOrders).toBe(2);
    expect(v.laterOrders).toBe(1);
  });
});
