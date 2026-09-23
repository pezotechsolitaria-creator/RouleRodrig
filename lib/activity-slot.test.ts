import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { orderToActivity } from "./activity";

// M216. A food pre-order is booked for a day. Every surface that listed it
// showed the 7-day cash hold instead ("reserved until Wed 30 Sep"), which on a
// Friday-lunch order is how a customer comes on the wrong day.

const RANGE = '["2026-09-25 08:00:00+00","2026-09-25 08:30:00+00")';

describe("a booked order carries its slot, never the hold", () => {
  it("the slot comes through as ISO bounds", () => {
    const a = orderToActivity({ id: "o1", status: "pending_payment", pickup_slot: RANGE, auto_release_at: "2026-09-30T06:00:00Z" });
    expect(a.pickupFrom).toBe("2026-09-25T08:00:00.000Z");
    expect(a.pickupTo).toBe("2026-09-25T08:30:00.000Z");
    expect(a.holdUntil).toBeNull();
  });

  it("an order with no slot keeps its reservation clock", () => {
    const a = orderToActivity({ id: "o2", status: "pending_payment", auto_release_at: "2026-09-30T06:00:00Z" });
    expect(a.holdUntil).toBe("2026-09-30T06:00:00Z");
    expect(a.pickupFrom).toBeNull();
  });
});

describe("the guest lookup does the same", () => {
  const route = readFileSync("app/api/activity/lookup/route.ts", "utf8");
  it("withholds the hold when lookup_order returns a slot", () => {
    expect(route).toContain('stage === "pending" && !o.pickupFrom');
    expect(route).toContain("pickupFrom: (o.pickupFrom as string | null) ?? null");
  });

  it("/track draws the booked day", () => {
    const card = readFileSync("app/track/TrackLookup.tsx", "utf8");
    expect(card).toContain("slotFromBounds(activity.pickupFrom, activity.pickupTo)");
  });

  it("the signed-in list selects and shows the slot", () => {
    const page = readFileSync("app/orders/page.tsx", "utf8");
    expect(page).toMatch(/placed_at, pickup_slot, stores\(name\)/);
    expect(page).toContain("formatSlot(slot, language, new Date())");
  });
});
