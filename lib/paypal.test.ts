import { describe, expect, it } from "vitest";
import { captureRefusalReason, withPayPalFee } from "./paypal";

// The check that stands between "someone paid something" and "this booking is
// confirmed". Before 2026-08-08 the capture route trusted `status === COMPLETED`
// alone, so an approved PayPal order was effectively a bearer token: pay the
// smallest deposit on a cheap booking, replay that orderID against an expensive
// one (or a stranger's, whose UUID leaks from a shared link), and it confirmed
// for free. The route is deliberately unauthenticated and holds a service-role
// client, so reference_id is the only thing binding money to a row.

const BOOKING = "11111111-2222-4333-8444-555555555555";
const OTHER = "99999999-8888-4777-8666-555555555555";
const ok = { referenceId: BOOKING, amount: "25.00", currency: "EUR" };

describe("captureRefusalReason", () => {
  it("accepts a capture that references this booking and covers the deposit", () => {
    expect(captureRefusalReason(ok, BOOKING, 25)).toBeNull();
  });

  it("REFUSES a capture created for a different booking — the replay attack", () => {
    expect(captureRefusalReason({ ...ok, referenceId: OTHER }, BOOKING, 25)).toBe("reference");
  });

  it("REFUSES a capture carrying no reference at all", () => {
    expect(captureRefusalReason({ ...ok, referenceId: null }, BOOKING, 25)).toBe("reference");
  });

  it("REFUSES the cheap-deposit-for-expensive-booking swap even when references were forged equal", () => {
    // €25 paid against a booking owing €300 — the economic half of the attack.
    expect(captureRefusalReason({ ...ok, amount: "25.00" }, BOOKING, 300)).toBe("amount");
  });

  it("REFUSES a foreign currency", () => {
    expect(captureRefusalReason({ ...ok, currency: "USD" }, BOOKING, 25)).toBe("currency");
  });

  it("checks the reference BEFORE the amount — a wrong booking is never merely underpaid", () => {
    expect(captureRefusalReason({ referenceId: OTHER, amount: "1.00", currency: "USD" }, BOOKING, 300)).toBe("reference");
  });

  it("tolerates FX drift between order creation and capture (within 10%)", () => {
    expect(captureRefusalReason({ ...ok, amount: "23.00" }, BOOKING, 25)).toBeNull(); // -8%
    expect(captureRefusalReason({ ...ok, amount: "22.00" }, BOOKING, 25)).toBe("amount"); // -12%
  });

  it("accepts an OVERpayment — paying the full total instead of the deposit is legitimate", () => {
    expect(captureRefusalReason({ ...ok, amount: "400.00" }, BOOKING, 25)).toBeNull();
  });

  it("skips the amount check when the expected price could not be derived (FX outage)", () => {
    expect(captureRefusalReason({ ...ok, amount: "0.01" }, BOOKING, null)).toBeNull();
  });

  it("skips the amount check when the booking owes nothing", () => {
    expect(captureRefusalReason({ ...ok, amount: "0.01" }, BOOKING, 0)).toBeNull();
  });

  it("does not reject on a missing amount — PayPal already reference-matched it", () => {
    expect(captureRefusalReason({ ...ok, amount: null }, BOOKING, 25)).toBeNull();
  });
});

describe("withPayPalFee", () => {
  it("adds the processing fee on top of the deposit the customer owes", () => {
    const { fee, total } = withPayPalFee(1000);
    expect(fee).toBeGreaterThan(0);
    expect(total).toBe(1000 + fee);
  });
});
