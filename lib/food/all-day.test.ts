import { describe, it, expect } from "vitest";
import { allDayFrom } from "./all-day";

// The number on this screen is the number somebody puts in a pan. Every test
// here is about it being right in the direction that costs food or money.

const item = (name: string, qty: number, variant: string | null = null, soldOut = false) =>
  ({ name, variant, qty, soldOut });

describe("all day totals", () => {
  it("adds the same dish across separate tickets", () => {
    const v = allDayFrom([
      { items: [item("Chicken Curry", 2)] },
      { items: [item("Chicken Curry", 4)] },
    ]);
    expect(v.items).toHaveLength(1);
    expect(v.items[0]).toMatchObject({ name: "Chicken Curry", qty: 6, tickets: 2 });
    expect(v.totalPortions).toBe(6);
  });

  it("keeps variants apart — they are different pans", () => {
    // The whole reason a cook looks at this screen is to batch. Telling them
    // "5× Curry" when it is 2 large and 3 small is worse than not telling them.
    const v = allDayFrom([
      { items: [item("Curry", 2, "Large"), item("Curry", 3, "Small")] },
    ]);
    expect(v.items.map((i) => [i.name, i.variant, i.qty])).toEqual([
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
    expect(v.items).toHaveLength(2);
  });

  it("counts tickets, not line items", () => {
    // Two lines of the same dish on ONE order is one ticket to walk to.
    const v = allDayFrom([
      { items: [item("Fish", 1), item("Fish", 2)] },
    ]);
    expect(v.items[0]).toMatchObject({ qty: 3, tickets: 1 });
  });

  it("ignores finished orders", () => {
    const v = allDayFrom([
      { items: [item("Rice", 3)], finished: true },
      { items: [item("Rice", 1)] },
    ]);
    expect(v.items[0].qty).toBe(1);
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
    expect(v.items[0].qty).toBe(2);
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
    expect(v.items).toHaveLength(1);
    expect(v.items[0]).toMatchObject({ qty: 3, soldOut: true });
  });

  it("sorts biggest batch first, then stably by name", () => {
    // Cooks work down from the biggest pan. Ties must not reshuffle between
    // polls, or a self-refreshing screen becomes unreadable.
    const v = allDayFrom([
      { items: [item("Zebra", 2), item("Apple", 2), item("Mango", 9)] },
    ]);
    expect(v.items.map((i) => i.name)).toEqual(["Mango", "Apple", "Zebra"]);
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
    expect(v.items).toHaveLength(1);
    expect(v.items[0]).toMatchObject({ name: "Real", qty: 2 });
    expect(v.totalPortions).toBe(2);
  });

  it("rounds a fractional quantity rather than carrying it", () => {
    // Nobody cooks 2.4 portions. Whatever produced it, the pan takes a whole
    // number.
    const v = allDayFrom([{ items: [item("Mine", 2.4)] }]);
    expect(v.items[0].qty).toBe(2);
  });

  it("is empty, not broken, with nothing live", () => {
    const v = allDayFrom([]);
    expect(v).toEqual({ items: [], totalPortions: 0, countedOrders: 0, excludedOrders: 0 });
  });

  it("treats a blank variant as no variant", () => {
    // An empty string from the database must not create a second line.
    const v = allDayFrom([
      { items: [item("Salad", 1, "")] },
      { items: [item("Salad", 1, null)] },
      { items: [item("Salad", 1, "   ")] },
    ]);
    expect(v.items).toHaveLength(1);
    expect(v.items[0]).toMatchObject({ qty: 3, variant: null, tickets: 3 });
  });
});
