import { describe, it, expect } from "vitest";
import {
  vehicleStage, placeStage, orderStage, activityLabel, isOpen,
  compareActivities, groupActivities, bookingReference, classifyReference,
  type Activity,
} from "./activity";

// The tracking page's whole value is that it says the right thing about four
// different kinds of transaction. These tests are about the two ways that goes
// wrong: telling somebody the wrong STATE, and putting the wrong thing first.

const TODAY = "2026-08-15";

const act = (over: Partial<Activity>): Activity => ({
  kind: "order", id: "1", reference: "R1", title: "T", provider: null,
  date: TODAY, amount: null, currency: "MUR", stage: "confirmed",
  statusLabel: "Confirmed", href: "#", ...over,
});

describe("vehicleStage", () => {
  it("is active while the customer is actually holding the scooter", () => {
    // The distinction the status column cannot make, and the one the customer
    // most wants to see.
    expect(vehicleStage("confirmed", "2026-08-14", "2026-08-16", TODAY)).toBe("active");
  });

  it("is active on the first and last day, not just between them", () => {
    expect(vehicleStage("confirmed", TODAY, "2026-08-20", TODAY)).toBe("active");
    expect(vehicleStage("confirmed", "2026-08-10", TODAY, TODAY)).toBe("active");
  });

  it("is done once the return date has passed", () => {
    expect(vehicleStage("confirmed", "2026-08-01", "2026-08-05", TODAY)).toBe("done");
  });

  it("is confirmed when it is still ahead", () => {
    expect(vehicleStage("confirmed", "2026-08-20", "2026-08-25", TODAY)).toBe("confirmed");
  });

  it("keeps an unpaid booking pending even if its dates are current", () => {
    // A pending booking is not a scooter in anyone's hands.
    expect(vehicleStage("pending", "2026-08-14", "2026-08-16", TODAY)).toBe("pending");
  });

  it("reports a cancelled booking as cancelled whatever its dates say", () => {
    expect(vehicleStage("cancelled", "2026-08-14", "2026-08-16", TODAY)).toBe("cancelled");
    expect(vehicleStage("cancelled", "2026-01-01", "2026-01-02", TODAY)).toBe("cancelled");
  });

  it("does not crash on a booking with no dates", () => {
    expect(vehicleStage("confirmed", null, null, TODAY)).toBe("confirmed");
  });
});

describe("placeStage", () => {
  it("treats a PAID DEPOSIT as confirmed even before the owner confirms", () => {
    // The customer has paid and holds the slot. Telling them "Requested"
    // understates what they are holding.
    expect(placeStage("pending", "2026-08-20", null, TODAY, "2026-08-14T10:00:00Z")).toBe("confirmed");
  });

  it("stays pending when nothing has been paid or confirmed", () => {
    expect(placeStage("pending", "2026-08-20", null, TODAY, null)).toBe("pending");
  });

  it("is active on the day itself", () => {
    expect(placeStage("confirmed", TODAY, null, TODAY)).toBe("active");
  });

  it("is done once it is behind us", () => {
    expect(placeStage("confirmed", "2026-08-01", "2026-08-03", TODAY)).toBe("done");
  });

  it("uses the END date to decide a multi-night stay is over", () => {
    // Started before today, ends after today → still ongoing, not done.
    expect(placeStage("confirmed", "2026-08-10", "2026-08-20", TODAY)).toBe("confirmed");
  });

  it("cancels beat everything, including a paid deposit", () => {
    expect(placeStage("cancelled", "2026-08-20", null, TODAY, "2026-08-14T10:00:00Z")).toBe("cancelled");
  });
});

describe("orderStage", () => {
  it("maps every real order status", () => {
    expect(orderStage("pending_payment")).toBe("pending");
    expect(orderStage("awaiting_payment_confirmation")).toBe("pending");
    expect(orderStage("paid")).toBe("confirmed");
    expect(orderStage("preparing")).toBe("active");
    expect(orderStage("ready_for_pickup")).toBe("active");
    expect(orderStage("collected")).toBe("done");
    expect(orderStage("cancelled")).toBe("cancelled");
    expect(orderStage("refunded")).toBe("cancelled");
  });

  it("falls back to pending for an unknown status rather than throwing", () => {
    // A new enum member must not blank the tracking page.
    expect(orderStage("some_future_status")).toBe("pending");
    expect(orderStage(null)).toBe("pending");
  });
});

describe("activityLabel", () => {
  it("does not call a curry 'Out now' or a scooter 'Ready'", () => {
    // The flattening the brief warned against.
    expect(activityLabel("vehicle", "active")).toBe("Out now");
    expect(activityLabel("place", "active")).toBe("Today");
  });

  it("prefers the order's own precise label over the coarse stage", () => {
    expect(activityLabel("order", "active", "Ready")).toBe("Ready");
  });

  it("still returns something for an order with no label supplied", () => {
    expect(activityLabel("order", "active")).toBe("active");
  });
});

describe("isOpen", () => {
  it("counts anything not finished as open", () => {
    expect(isOpen("pending")).toBe(true);
    expect(isOpen("confirmed")).toBe(true);
    expect(isOpen("active")).toBe(true);
    expect(isOpen("done")).toBe(false);
    expect(isOpen("cancelled")).toBe(false);
  });
});

describe("compareActivities / groupActivities", () => {
  it("puts what is happening NOW above everything else", () => {
    const list = [
      act({ id: "done", stage: "done", date: "2026-08-14" }),
      act({ id: "soon", stage: "confirmed", date: "2026-08-16" }),
      act({ id: "now", stage: "active", date: "2026-08-15" }),
    ];
    expect(list.sort(compareActivities).map((a) => a.id)).toEqual(["now", "soon", "done"]);
  });

  it("orders things still ahead SOONEST first", () => {
    const list = [
      act({ id: "late", stage: "confirmed", date: "2026-09-01" }),
      act({ id: "early", stage: "confirmed", date: "2026-08-16" }),
    ];
    expect(list.sort(compareActivities).map((a) => a.id)).toEqual(["early", "late"]);
  });

  it("orders history NEWEST first", () => {
    // Opposite direction to upcoming, on purpose: the next thing to happen and
    // the last thing that happened are both the ones you want nearest the top.
    const list = [
      act({ id: "old", stage: "done", date: "2026-01-01" }),
      act({ id: "recent", stage: "done", date: "2026-08-01" }),
    ];
    expect(list.sort(compareActivities).map((a) => a.id)).toEqual(["recent", "old"]);
  });

  it("sorts undated entries last within their group, never first", () => {
    const list = [
      act({ id: "undated", stage: "confirmed", date: null }),
      act({ id: "dated", stage: "confirmed", date: "2026-09-01" }),
    ];
    expect(list.sort(compareActivities).map((a) => a.id)).toEqual(["dated", "undated"]);
  });

  it("ranks pending and confirmed together — both are simply 'still ahead'", () => {
    const list = [
      act({ id: "pending-soon", stage: "pending", date: "2026-08-16" }),
      act({ id: "confirmed-later", stage: "confirmed", date: "2026-08-20" }),
    ];
    expect(list.sort(compareActivities).map((a) => a.id)).toEqual(["pending-soon", "confirmed-later"]);
  });

  it("groups into now / upcoming / past without losing anything", () => {
    const list = [
      act({ id: "a", stage: "active" }),
      act({ id: "b", stage: "pending" }),
      act({ id: "c", stage: "confirmed" }),
      act({ id: "d", stage: "done" }),
      act({ id: "e", stage: "cancelled" }),
    ];
    const g = groupActivities(list);
    expect(g.now.map((x) => x.id)).toEqual(["a"]);
    expect(g.upcoming.map((x) => x.id).sort()).toEqual(["b", "c"]);
    expect(g.past.map((x) => x.id).sort()).toEqual(["d", "e"]);
    expect(g.now.length + g.upcoming.length + g.past.length).toBe(list.length);
  });

  it("does not mutate the caller's array", () => {
    const list = [act({ id: "x", stage: "done" }), act({ id: "y", stage: "active" })];
    groupActivities(list);
    expect(list.map((a) => a.id)).toEqual(["x", "y"]);
  });
});

describe("bookingReference", () => {
  it("matches the format used in every confirmation email", () => {
    expect(bookingReference("a1b2c3d4-e5f6-7890-abcd-ef1234567890")).toBe("RR-A1B2C3");
  });
});

describe("classifyReference", () => {
  it("recognises a booking reference", () => {
    expect(classifyReference("RR-A1B2C3")).toBe("vehicle");
    expect(classifyReference("rr-a1b2c3")).toBe("vehicle");
    // Customers routinely drop the hyphen when retyping.
    expect(classifyReference("RRA1B2C3")).toBe("vehicle");
  });

  it("recognises an order number", () => {
    expect(classifyReference("RR260811-D9220F")).toBe("order");
  });

  it("returns unknown rather than guessing, so the lookup tries everything", () => {
    // A customer mistyping their own reference must not be told it does not
    // exist — unknown means "try every backend", not "reject".
    expect(classifyReference("hello")).toBe("unknown");
    expect(classifyReference("")).toBe("unknown");
    expect(classifyReference("RR-ZZZZZZ")).toBe("unknown");
  });

  it("tolerates surrounding whitespace from a copy-paste", () => {
    expect(classifyReference("  RR-A1B2C3  ")).toBe("vehicle");
  });
});
