import { describe, expect, it } from "vitest";
import { isActiveHold } from "./holds";

// ── Who is allowed to block a scooter ──────────────────────────────────────
//
// This function decides whether a row stops someone else booking the same
// vehicle on the same dates. Get it wrong in one direction and two customers
// pay for one bike; get it wrong in the other and a stranger blocks the fleet
// with free requests. Both failures are expensive and neither is visible until
// a real person is standing there, so the rule is pinned here.

const hoursFromNow = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();

describe("isActiveHold — vehicles", () => {
  it("a paid booking holds", () => {
    expect(isActiveHold({ status: "pending", deposit_paid_at: hoursFromNow(-1) })).toBe(true);
    expect(isActiveHold({ status: "confirmed" })).toBe(true);
  });

  // The rule that stops anyone blocking the fleet for free. Unchanged by M91.
  it("an unpaid request holds NOTHING, however recent", () => {
    expect(isActiveHold({ status: "pending", deposit_paid_at: null, created_at: hoursFromNow(-0.1) })).toBe(false);
  });

  it("cancelled and completed never hold", () => {
    expect(isActiveHold({ status: "cancelled", deposit_paid_at: hoursFromNow(-1) })).toBe(false);
    expect(isActiveHold({ status: "completed", deposit_paid_at: hoursFromNow(-1) })).toBe(false);
  });
});

describe("isActiveHold — approved but unpaid (M91)", () => {
  // The whole point of the availability step: once the owner has told a
  // customer "yes, it's available", nobody else may be offered that vehicle.
  it("holds while the payment window is open", () => {
    expect(isActiveHold({ status: "approved", payment_due_by: hoursFromNow(6) })).toBe(true);
  });

  // And it must stop, or one unpaid approval blocks a bike forever.
  it("stops holding the moment the window passes — no cron required", () => {
    expect(isActiveHold({ status: "approved", payment_due_by: hoursFromNow(-0.01) })).toBe(false);
  });

  // Failing OPEN here would let a single malformed row take a scooter out of
  // the fleet permanently, with nothing in /admin explaining why.
  it("does not hold when no deadline was ever set", () => {
    expect(isActiveHold({ status: "approved" })).toBe(false);
    expect(isActiveHold({ status: "approved", payment_due_by: null })).toBe(false);
    expect(isActiveHold({ status: "approved", payment_due_by: "not a date" })).toBe(false);
  });

  it("still holds after payment even once the window has passed", () => {
    // Paying flips the row to confirmed, which holds unconditionally — the
    // deadline is about UNPAID reservations only.
    expect(isActiveHold({ status: "confirmed", payment_due_by: hoursFromNow(-48) })).toBe(true);
  });
});

describe("isActiveHold — request-only place bookings", () => {
  it("a recent unpaid request holds for the manual-confirmation window", () => {
    expect(isActiveHold({ status: "pending", deposit_amount: 0, deposit_paid_at: null, created_at: hoursFromNow(-1) })).toBe(true);
  });

  it("and stops once that window has passed", () => {
    expect(isActiveHold({ status: "pending", deposit_amount: 0, deposit_paid_at: null, created_at: hoursFromNow(-72) })).toBe(false);
  });

  it("but a place booking WITH a price due is payment-gated like a vehicle", () => {
    expect(isActiveHold({ status: "pending", deposit_amount: 1500, deposit_paid_at: null, created_at: hoursFromNow(-1) })).toBe(false);
  });
});
