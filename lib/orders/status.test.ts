import { describe, expect, it } from "vitest";
import { legalNextStatuses, timelineIndex, LEGAL_TRANSITIONS, STATUS_ORDER } from "./status";

describe("legalNextStatuses", () => {
  it("returns the forward + cancel options for each actionable status", () => {
    expect(legalNextStatuses("paid")).toEqual(["preparing", "cancelled"]);
    expect(legalNextStatuses("preparing")).toEqual(["ready_for_pickup", "cancelled"]);
    expect(legalNextStatuses("ready_for_pickup")).toEqual(["collected", "cancelled"]);
  });

  it("returns no actions for terminal or non-merchant-actionable statuses", () => {
    expect(legalNextStatuses("collected")).toEqual([]);
    expect(legalNextStatuses("cancelled")).toEqual([]);
    expect(legalNextStatuses("refunded")).toEqual([]);
    expect(legalNextStatuses("pending_payment")).toEqual([]);
  });

  // Mirrors the RPC's own state machine (update_order_status()) — this table
  // must never allow a skip (e.g. paid -> collected) or the UI would offer a
  // button the server will reject with RR004.
  it("never allows skipping a step", () => {
    for (const [from, to] of Object.entries(LEGAL_TRANSITIONS)) {
      const fromIndex = STATUS_ORDER.indexOf(from as (typeof STATUS_ORDER)[number]);
      for (const target of to ?? []) {
        if (target === "cancelled") continue;
        const toIndex = STATUS_ORDER.indexOf(target);
        expect(toIndex).toBe(fromIndex + 1);
      }
    }
  });
});

describe("timelineIndex", () => {
  it("maps each forward status to its position", () => {
    expect(timelineIndex("paid")).toBe(0);
    expect(timelineIndex("preparing")).toBe(1);
    expect(timelineIndex("ready_for_pickup")).toBe(2);
    expect(timelineIndex("collected")).toBe(3);
  });

  it("returns -1 for cancelled/refunded so the timeline renders the terminal state instead", () => {
    expect(timelineIndex("cancelled")).toBe(-1);
    expect(timelineIndex("refunded")).toBe(-1);
  });
});
