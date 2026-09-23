import { describe, it, expect } from "vitest";
import {
  bySoonestDue,
  canConfirmWithCook,
  confirmedLine,
  dueAt,
  isRunningLate,
  slotLine,
} from "./queue-time";
import type { AdminFoodOrder } from "./types";

// ── THE OWNER'S QUEUE, ONCE ORDERS ARE FOR A DAY (M216, M217) ───────────────
//
// /admin/food measured every order from when it was PLACED. With Chez Banane
// taking orders a day or two ahead, a Friday lunch booked on Wednesday went
// orange on Wednesday afternoon, stayed orange for two days, and sat above
// today's orders. These pin the replacement rules.
//
// Rodrigues is UTC+4 all year. Friday 25 Sept 12:00–12:30 on the island is
// 08:00–08:30 UTC.

type Timed = Pick<AdminFoodOrder, "pickupFrom" | "pickupTo" | "placedAt" | "status" | "acceptedAt">;

const FRI_LUNCH = { pickupFrom: "2026-09-25T08:00:00.000Z", pickupTo: "2026-09-25T08:30:00.000Z" };
const ASAP = { pickupFrom: null, pickupTo: null };

const WED_AFTERNOON = new Date("2026-09-23T11:00:00Z"); // 15:00 on the island
const THU_MORNING = new Date("2026-09-24T06:00:00Z"); // 10:00
const FRI_0930 = new Date("2026-09-25T05:30:00Z"); // 09:30, 2½ h before the slot
const FRI_1030 = new Date("2026-09-25T06:30:00Z"); // 10:30, 1½ h before
const FRI_1215 = new Date("2026-09-25T08:15:00Z"); // inside the slot
const FRI_1245 = new Date("2026-09-25T08:45:00Z"); // after the slot

function order(over: Partial<Timed>): Timed {
  return {
    ...ASAP,
    placedAt: "2026-09-23T10:00:00.000Z",
    status: "pending_payment",
    acceptedAt: null,
    ...over,
  };
}

describe("slotLine — the day comes first", () => {
  it("names the date two days out", () => {
    expect(slotLine(FRI_LUNCH, WED_AFTERNOON)).toBe("For Fri 25 Sep · 12:00–12:30");
  });

  it("says tomorrow and today in Rodrigues time", () => {
    expect(slotLine(FRI_LUNCH, THU_MORNING)).toBe("For tomorrow · 12:00–12:30");
    expect(slotLine(FRI_LUNCH, FRI_0930)).toBe("For today · 12:00–12:30");
  });

  it("uses the island's date, not UTC's, after 20:00 UTC", () => {
    // 21:00 UTC Thursday is 01:00 Friday on the island: the slot is TODAY.
    expect(slotLine(FRI_LUNCH, new Date("2026-09-24T21:00:00Z"))).toBe("For today · 12:00–12:30");
  });

  it("is null for an order due now", () => {
    expect(slotLine(ASAP, THU_MORNING)).toBeNull();
  });
});

describe("bySoonestDue — today's lunch above Friday's", () => {
  it("puts a walk-up placed this morning above a pre-order placed yesterday", () => {
    const friday = order({ ...FRI_LUNCH, placedAt: "2026-09-23T10:00:00.000Z" });
    const now = order({ placedAt: "2026-09-24T05:50:00.000Z" });
    // The API sends newest first; the queue re-sorts.
    expect([friday, now].sort(bySoonestDue)).toEqual([now, friday]);
  });

  it("orders two bookings by their slots, not by when they were placed", () => {
    const early = order({ ...FRI_LUNCH, placedAt: "2026-09-24T05:00:00.000Z" });
    const late = order({
      pickupFrom: "2026-09-25T10:00:00.000Z",
      pickupTo: "2026-09-25T10:30:00.000Z",
      placedAt: "2026-09-23T05:00:00.000Z",
    });
    expect([late, early].sort(bySoonestDue)).toEqual([early, late]);
    expect(dueAt(early)).toBe(Date.parse(FRI_LUNCH.pickupFrom));
  });
});

describe("isRunningLate — judged against the slot, not the placing", () => {
  it("a pre-order placed yesterday for tomorrow is early, not a day late", () => {
    expect(isRunningLate(order({ ...FRI_LUNCH }), THU_MORNING)).toBe(false);
  });

  it("an untaken booking turns orange two hours before its slot", () => {
    expect(isRunningLate(order({ ...FRI_LUNCH }), FRI_0930)).toBe(false);
    expect(isRunningLate(order({ ...FRI_LUNCH }), FRI_1030)).toBe(true);
  });

  it("a booking the cook has confirmed waits for its window to open", () => {
    const taken = order({ ...FRI_LUNCH, acceptedAt: "2026-09-23T11:00:00.000Z" });
    expect(isRunningLate(taken, FRI_1030)).toBe(false);
    expect(isRunningLate(taken, FRI_1215)).toBe(true);
  });

  it("ready food is late only once the window has closed", () => {
    const ready = order({ ...FRI_LUNCH, status: "ready_for_pickup", acceptedAt: "2026-09-23T11:00:00.000Z" });
    expect(isRunningLate(ready, FRI_1215)).toBe(false);
    expect(isRunningLate(ready, FRI_1245)).toBe(true);
  });

  it("an order due now keeps the twenty-minute rule", () => {
    const placed = order({ placedAt: "2026-09-24T05:30:00.000Z" });
    expect(isRunningLate(placed, new Date("2026-09-24T05:45:00Z"))).toBe(false);
    expect(isRunningLate(placed, new Date("2026-09-24T05:55:00Z"))).toBe(true);
  });

  it("a finished order is never late", () => {
    expect(isRunningLate(order({ ...FRI_LUNCH, status: "collected" }), FRI_1245)).toBe(false);
    expect(isRunningLate(order({ status: "cancelled" }), FRI_1245)).toBe(false);
  });
});

describe("Confirmed with cook (M217)", () => {
  it("is offered on a pending order nobody has taken", () => {
    expect(canConfirmWithCook({ status: "pending_payment", acceptedAt: null })).toBe(true);
    expect(canConfirmWithCook({ status: "awaiting_payment_confirmation", acceptedAt: null })).toBe(true);
  });

  it("is not offered once taken, or once the order has moved on", () => {
    expect(canConfirmWithCook({ status: "pending_payment", acceptedAt: "2026-09-23T11:00:00.000Z" })).toBe(false);
    expect(canConfirmWithCook({ status: "paid", acceptedAt: null })).toBe(false);
    expect(canConfirmWithCook({ status: "preparing", acceptedAt: null })).toBe(false);
  });

  it("the card says Confirmed, when, in island time", () => {
    // 10:05 UTC is 14:05 on the island.
    expect(
      confirmedLine({ status: "pending_payment", acceptedAt: "2026-09-23T10:05:00+00:00" }, WED_AFTERNOON),
    ).toBe("Confirmed with cook · today, 14:05");
  });

  it("reads the timestamp PostgREST sends, offset and all", () => {
    expect(
      confirmedLine({ status: "pending_payment", acceptedAt: "2026-09-23 10:05:00+00" }, THU_MORNING),
    ).toBe("Confirmed with cook · Wed 23 Sep, 14:05");
  });

  it("says nothing until accepted_at is set, or once the status says more", () => {
    expect(confirmedLine({ status: "pending_payment", acceptedAt: null }, THU_MORNING)).toBeNull();
    expect(confirmedLine({ status: "paid", acceptedAt: "2026-09-23T10:05:00Z" }, THU_MORNING)).toBeNull();
  });
});
