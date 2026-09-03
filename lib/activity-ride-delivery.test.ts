import { describe, it, expect } from "vitest";
import {
  ACTIVITY_KINDS,
  rideStage,
  deliveryStage,
  rideToActivity,
  deliveryToActivity,
} from "./activity";

// ── A TAXI AND A DELIVERY ARE THINGS YOU BOOKED ─────────────────────────────
//
// "Your activity" listed rentals, experiences and shop orders. For a taxi the
// signed-in customer was sent to a lookup box to type a reference, and a
// delivery appeared nowhere at all — for things the site already knew were
// theirs.
//
// The statuses below are not invented: they are every value in the tables' own
// CHECK constraints, read from the database. If somebody adds one, the
// "every status maps" tests fail rather than the badge quietly reading
// "Finding a driver" for a completed trip.
const RIDE_STATUSES = [
  "new", "dispatching", "assigned", "driver_on_way", "arrived",
  "on_trip", "completed", "cancelled", "no_driver", "no_show",
] as const;

const DELIVERY_STATUSES = ["open", "accepted", "cancelled", "expired"] as const;

describe("the activity feed knows about rides and deliveries", () => {
  it("lists them as kinds", () => {
    expect(ACTIVITY_KINDS).toContain("ride");
    expect(ACTIVITY_KINDS).toContain("delivery");
  });
});

describe("rideStage", () => {
  it("maps every status the table allows", () => {
    for (const s of RIDE_STATUSES) {
      expect(["pending", "confirmed", "active", "done", "cancelled"], s)
        .toContain(rideStage(s));
    }
  });

  it("treats looking-for-a-driver as pending", () => {
    expect(rideStage("new")).toBe("pending");
    expect(rideStage("dispatching")).toBe("pending");
  });

  it("separates a driver assigned from a driver actually moving", () => {
    // The difference a customer standing on a pavement cares about.
    expect(rideStage("assigned")).toBe("confirmed");
    expect(rideStage("driver_on_way")).toBe("active");
    expect(rideStage("arrived")).toBe("active");
    expect(rideStage("on_trip")).toBe("active");
  });

  it("ends no_driver and no_show as cancelled, not as still happening", () => {
    // Neither is "cancelled by you", but from the customer's side the ride is
    // off and nothing more will occur — which is what the stage column means.
    expect(rideStage("no_driver")).toBe("cancelled");
    expect(rideStage("no_show")).toBe("cancelled");
    expect(rideStage("completed")).toBe("done");
  });

  it("falls back to pending for a status added later", () => {
    expect(rideStage("something_new")).toBe("pending");
    expect(rideStage(null)).toBe("pending");
  });
});

describe("deliveryStage", () => {
  it("maps every status the table allows", () => {
    for (const s of DELIVERY_STATUSES) {
      expect(["pending", "confirmed", "active", "done", "cancelled"], s)
        .toContain(deliveryStage(s));
    }
  });

  it("treats an expired request as over, not as waiting", () => {
    // Nobody took it in time. Leaving it "pending" would show a customer a
    // request that is still going to be quoted, which it never will be.
    expect(deliveryStage("open")).toBe("pending");
    expect(deliveryStage("accepted")).toBe("confirmed");
    expect(deliveryStage("expired")).toBe("cancelled");
    expect(deliveryStage("cancelled")).toBe("cancelled");
  });
});

describe("what the customer sees, and what they no longer have to type", () => {
  it("titles a ride by its route, because every ride is otherwise 'Taxi'", () => {
    const a = rideToActivity({
      id: "11111111-2222-3333-4444-555555555555",
      pickup_label: "Port Mathurin",
      dropoff_label: "Mont Lubin",
      status: "assigned",
    });
    expect(a.title).toBe("Port Mathurin → Mont Lubin");
    expect(a.kind).toBe("ride");
  });

  it("carries the reference into the tracking link, and no phone number", () => {
    const a = rideToActivity({ id: "11111111-2222-3333-4444-555555555555", status: "new" });
    expect(a.href).toContain("/taxi/track?ref=");
    expect(a.href).toContain(a.reference);
    // /taxi/track also asks for a phone, deliberately. A phone number in a URL
    // is personal data in a place it must never be, so the link pre-fills the
    // reference only — which is the part a customer should never copy by hand.
    expect(a.href).not.toMatch(/phone/i);
  });

  it("opens a delivery with nothing typed at all", () => {
    const a = deliveryToActivity({
      id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      what: "Two boxes of tomatoes",
      status: "open",
    });
    expect(a.href).toBe("/deliver/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    expect(a.title).toBe("Two boxes of tomatoes");
  });

  it("never shows a delivery budget as if it were a price", () => {
    // max_budget is what the customer was willing to pay, not what anything
    // costs. Rendering it as an amount would read as an agreed figure.
    const a = deliveryToActivity({ id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", status: "accepted" });
    expect(a.amount).toBeNull();
  });
});
