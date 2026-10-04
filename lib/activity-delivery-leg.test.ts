import { describe, it, expect } from "vitest";
import { deliveryStage, deliveryToActivity, groupActivities } from "@/lib/activity";
import { BROKEN_LEGS, DEAD_LEGS } from "@/lib/delivery/request-status";

// ── The request is not the journey (architecture review 2026-09-30, item 2) ──
//
// delivery_requests.status sits at 'accepted' for ever once a quote is taken,
// so /orders read every such job as "Driver booked" under "Coming up" —
// delivered ones, failed ones, ones whose driver had walked away. These walk
// the real delivery_status enum through the real mapper.

// The enum, verbatim (lib/delivery/request-status.test.ts keeps the same list).
const ENUM = [
  "created", "searching_driver", "assigned", "going_to_pickup",
  "arrived_at_pickup", "picked_up", "out_for_delivery", "arrived",
  "delivered", "cancelled", "driver_unavailable", "driver_unresponsive",
  "failed_delivery", "returned_to_merchant", "requires_admin",
];
const ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const NOW = Date.parse("2026-09-30T12:00:00Z");
const accepted = (leg: string | null) => deliveryToActivity({ id: ID, status: "accepted", delivery_status: leg }, NOW);

describe("an accepted request, leg by leg", () => {
  it("says 'Driver booked' only while a driver actually has the job", () => {
    const booked = ENUM.filter((leg) => accepted(leg).statusLabel === "Driver booked");
    expect(booked.sort()).toEqual(
      ["created", "assigned", "going_to_pickup", "arrived_at_pickup", "picked_up", "out_for_delivery", "arrived"].sort(),
    );
  });

  it("puts a delivered job in the past, with the word /deliver uses", () => {
    const a = accepted("delivered");
    expect(a.stage).toBe("done");
    expect(a.statusLabel).toBe("Delivered");
    expect(groupActivities([a]).past).toHaveLength(1);
    expect(groupActivities([a]).upcoming).toHaveLength(0);
  });

  it("ends every dead leg, in its own words — never 'Driver booked'", () => {
    for (const leg of DEAD_LEGS) {
      const a = accepted(leg);
      expect(a.stage, leg).toBe("cancelled");
      expect(groupActivities([a]).past, leg).toHaveLength(1);
    }
    expect(accepted("failed_delivery").statusLabel).toBe("Could not be delivered");
    expect(accepted("returned_to_merchant").statusLabel).toBe("Sent back");
    expect(accepted("cancelled").statusLabel).toBe("Cancelled");
  });

  it("keeps a broken leg ahead of the customer, but never as booked or as waiting for quotes", () => {
    for (const leg of BROKEN_LEGS) {
      const a = accepted(leg);
      expect(a.stage, leg).toBe("pending");
      expect(a.statusLabel, leg).not.toBe("Driver booked");
      expect(a.statusLabel, leg).not.toBe("Waiting for quotes");
    }
  });

  it("puts a moving driver under Happening now, as a ride on its way is", () => {
    for (const leg of ["going_to_pickup", "arrived_at_pickup", "picked_up", "out_for_delivery", "arrived"]) {
      expect(accepted(leg).stage, leg).toBe("active");
    }
    expect(accepted("assigned").stage).toBe("confirmed");
  });

  it("with no leg read, says what it said before the leg was known", () => {
    expect(accepted(null).stage).toBe("confirmed");
    expect(accepted(null).statusLabel).toBe("Driver booked");
  });
});

describe("a request nobody took", () => {
  it("is expired once past expires_at, even while the row still says open", () => {
    const a = deliveryToActivity({ id: ID, status: "open", expires_at: "2026-09-30T11:00:00Z" }, NOW);
    expect(a.stage).toBe("cancelled");
    // The customer did not cancel it.
    expect(a.statusLabel).toBe("Expired");
  });

  it("is still waiting before expires_at", () => {
    const a = deliveryToActivity({ id: ID, status: "open", expires_at: "2026-09-30T13:00:00Z" }, NOW);
    expect(a.stage).toBe("pending");
    expect(a.statusLabel).toBe("Waiting for quotes");
  });

  it("says Expired for the swept status too, and Cancelled only for a real cancellation", () => {
    expect(deliveryToActivity({ id: ID, status: "expired" }, NOW).statusLabel).toBe("Expired");
    expect(deliveryToActivity({ id: ID, status: "cancelled" }, NOW).statusLabel).toBe("Cancelled");
  });

  it("ignores the leg on a request that was never accepted", () => {
    expect(deliveryStage("open", "delivered", null, NOW)).toBe("pending");
  });
});
