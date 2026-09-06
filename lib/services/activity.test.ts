import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  ACTIVITY_KINDS,
  activityLabel,
  serviceStage,
  serviceToActivity,
} from "@/lib/activity";

// ── A customer's own appointment, in their own list ─────────────────────────
//
// Booking a car wash is as much "a thing I booked" as renting a scooter. Left
// out of the activity feed, a signed-in customer would have to ring the shop to
// ask when their own appointment was.

describe("a booking joins the five backends", () => {
  it("is a kind the whole feed knows about", () => {
    expect(ACTIVITY_KINDS).toContain("service");
  });

  it("sorts by the day it is FOR, not the day it was made", () => {
    // Sorting by creation would bury Saturday's appointment under last week's.
    const a = serviceToActivity({
      id: "11111111-1111-1111-1111-111111111111",
      service_name: "Full valet",
      starts_at: "2026-09-12T05:00:00Z",
      status: "booked",
      store_name: "Ti Wash",
      store_slug: "ti-wash",
    });
    expect(a.date).toBe("2026-09-12T05:00:00Z");
    expect(a.title).toBe("Full valet");
    expect(a.provider).toBe("Ti Wash");
    expect(a.href).toBe("/shop/ti-wash");
  });

  it("shows no amount, because nothing was paid", () => {
    // A price here would read as money already handed over. The customer
    // settles with the provider on the day.
    const a = serviceToActivity({ id: "x", service_name: "Quick wash", status: "booked" });
    expect(a.amount).toBeNull();
  });

  it("falls back to the marketplace when the shop has no slug", () => {
    const a = serviceToActivity({ id: "x", status: "booked" });
    expect(a.href).toBe("/shop");
    expect(a.title).toBe("Booking");
  });
});

describe("a no-show is not a cancellation", () => {
  it("never tells the customer they cancelled", () => {
    // The customer did not cancel, and a history saying they did is a history
    // they will dispute — with the provider, in person.
    expect(serviceStage("no_show")).toBe("done");
    expect(serviceStage("cancelled")).toBe("cancelled");
    expect(activityLabel("service", serviceStage("no_show"))).not.toMatch(/cancel/i);
  });

  it("treats anything still open as booked in", () => {
    expect(serviceStage("booked")).toBe("confirmed");
    expect(serviceStage(null)).toBe("confirmed");
    expect(activityLabel("service", "confirmed")).toBe("Booked in");
  });
});

describe("a guest booking is deliberately not listed", () => {
  const server = readFileSync("lib/activity-server.ts", "utf8");

  it("matches on the account and never on a phone number", () => {
    // The public door takes no email and no account, so a guest booking is
    // keyed only by telephone. Matching on that would show one person's
    // appointment to anyone who typed the same number.
    const block = server.slice(server.indexOf('from("service_bookings")'));
    expect(block).toMatch(/\.eq\("created_by", opts\.userId\)/);
    expect(block.slice(0, 400)).not.toMatch(/customer_phone/);
  });

  it("says so when the read fails, rather than showing an empty list", () => {
    expect(server).toMatch(/activity feed: service_bookings failed/);
  });
});
