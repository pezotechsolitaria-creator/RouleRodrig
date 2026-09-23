import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseSlotRange } from "@/lib/orders/slot";
import { SLOT_GRACE_MS, handoverWord, momentShort, slotCancelAt, slotDayShort } from "./slot-label";

// ── THE MERCHANT'S ORDER PAGE, FOR A BOOKED ORDER (M216) ────────────────────
//
// A cash pre-order's page showed only the 7-day hold ("confirm within 6
// days"), which is not when anything happens. expire_order() (M181b) never
// lets the hold fire before the slot begins, and cancels an order nobody
// accepted 30 minutes after the slot ENDS. These pin the moment the page now
// shows instead, and that the page, the list and the API carry the slot.

const FRI_LUNCH = parseSlotRange('["2026-09-25 08:00:00+00","2026-09-25 08:30:00+00")')!;
const THU = new Date("2026-09-24T06:00:00Z");
const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");

describe("slotCancelAt — when an unaccepted booking is cancelled", () => {
  it("is 30 minutes after the slot ends when there is no hold", () => {
    expect(slotCancelAt(FRI_LUNCH, null).toISOString()).toBe("2026-09-25T09:00:00.000Z");
    expect(SLOT_GRACE_MS).toBe(30 * 60 * 1000);
  });

  it("ignores a 7-day cash hold, which can never come first", () => {
    const hold = new Date("2026-09-30T08:00:00Z");
    expect(slotCancelAt(FRI_LUNCH, hold).toISOString()).toBe("2026-09-25T09:00:00.000Z");
  });

  it("a short hold that lapsed before the slot bites when the slot BEGINS, not before", () => {
    // Tonight's sweep must not cancel tomorrow's lunch.
    const hold = new Date("2026-09-24T08:00:00Z");
    expect(slotCancelAt(FRI_LUNCH, hold).toISOString()).toBe("2026-09-25T08:00:00.000Z");
  });

  it("a hold that lapses inside the window bites then", () => {
    const hold = new Date("2026-09-25T08:40:00Z");
    expect(slotCancelAt(FRI_LUNCH, hold).toISOString()).toBe("2026-09-25T08:40:00.000Z");
  });
});

describe("the desks' short form", () => {
  it("momentShort names the day and the island clock", () => {
    expect(momentShort(new Date("2026-09-25T09:00:00Z"), THU)).toBe("tomorrow, 13:00");
    expect(momentShort(new Date("2026-09-25T09:00:00Z"), new Date("2026-09-23T06:00:00Z"))).toBe(
      "Fri 25 Sep, 13:00",
    );
  });

  it("slotDayShort keeps the date beyond tomorrow", () => {
    expect(slotDayShort(FRI_LUNCH, new Date("2026-09-23T06:00:00Z"))).toBe("Fri 25 Sep");
  });

  it("handoverWord: delivery orders leave the kitchen, the rest are collected", () => {
    expect(handoverWord("rr_delivery")).toBe("Delivery");
    expect(handoverWord("customer_delivery")).toBe("Delivery");
    expect(handoverWord("pickup")).toBe("Collection");
    expect(handoverWord(null)).toBe("Collection");
  });
});

describe("the merchant console carries the slot", () => {
  it("the order API selects pickup_slot, and so does the list", () => {
    expect(read("app", "api", "merchant", "orders", "[id]", "route.ts")).toContain('"pickup_slot, "');
    expect(read("app", "api", "merchant", "orders", "route.ts")).toMatch(/placed_at, pickup_slot, order_items/);
  });

  it("the order page shows the slot above the timeline and never the hold for a booking", () => {
    const src = read("components", "merchant", "orders", "OrderDetail.tsx");
    const banner = src.indexOf("formatSlot(slot");
    const timeline = src.indexOf("<OrderTimeline");
    expect(banner).toBeGreaterThan(-1);
    expect(banner).toBeLessThan(timeline);
    expect(src).toContain("holdIsTheDeadline(slot)");
    expect(src).toMatch(/hold && !order\.accepted_at && showHold/);
    // Only pending_payment is ever swept by expire_order().
    expect(src).toMatch(/order\.status === "pending_payment"\s*\?\s*slotCancelAt\(/);
  });

  it("the orders list has a For column", () => {
    const src = read("components", "merchant", "orders", "OrdersTable.tsx");
    expect(src).toMatch(/<th[^>]*>For<\/th>/);
    expect(src).toContain("parseSlotRange(");
  });
});
