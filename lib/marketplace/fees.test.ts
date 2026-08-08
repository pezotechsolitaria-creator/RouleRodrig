import { describe, it, expect } from "vitest";
import {
  commissionOn,
  feeBreakdown,
  formatRate,
  rateToUnits,
  modelChargesCommission,
  modelChargesSubscription,
  MAX_COMMISSION_RATE,
} from "./fees";

// These tests exist for ONE reason: what this module displays must equal what
// create_order() stores. Every expectation below was checked against the live
// database in a rolled-back transaction (M23/M24 verification run), so a
// failure here means the display has drifted from the charge.

describe("commissionOn", () => {
  it("takes nothing at 0% — the free and subscription-only models", () => {
    expect(commissionOn(2000, 0)).toBe(0);
    expect(commissionOn(999_999, 0)).toBe(0);
  });

  it("matches the database on the verified 10% case", () => {
    // Postgres returned commission=200, net=1800 on a Rs 20.00 order.
    expect(commissionOn(2000, 0.1)).toBe(200);
  });

  it("matches the database on the verified rounding case", () => {
    // 6000 * 0.0333 = 199.8 exactly; Postgres round() gave 200.
    expect(commissionOn(6000, 0.0333)).toBe(200);
  });

  it("rounds half away from zero, like Postgres round(numeric)", () => {
    expect(commissionOn(5, 0.1)).toBe(1); // 0.5 -> 1
    expect(commissionOn(15, 0.1)).toBe(2); // 1.5 -> 2
    expect(commissionOn(4, 0.125)).toBe(1); // 0.5 -> 1
    expect(commissionOn(3, 0.1)).toBe(0); // 0.3 -> 0
  });

  it("does not drift into floating point on values that misbehave in IEEE-754", () => {
    // 0.07 * 100 === 7.000000000000001 in float; integer maths must not care.
    expect(commissionOn(100, 0.07)).toBe(7);
    expect(commissionOn(8100, 0.29)).toBe(2349);
    // A large order at a fine-grained rate: numeric(6,5) is exact here.
    expect(commissionOn(1_234_567, 0.08765)).toBe(Math.floor((1_234_567 * 8765 + 50_000) / 100_000));
  });

  it("never takes more than the merchandise, whatever the rate", () => {
    expect(commissionOn(1000, 1)).toBe(500); // clamped to MAX_COMMISSION_RATE
    expect(commissionOn(1000, 99)).toBe(500);
    expect(commissionOn(1, MAX_COMMISSION_RATE)).toBe(1); // 0.5 -> 1, still <= base
  });

  it("treats absent, negative and non-finite inputs as no fee rather than throwing", () => {
    expect(commissionOn(0, 0.1)).toBe(0);
    expect(commissionOn(-500, 0.1)).toBe(0);
    expect(commissionOn(1000, -0.1)).toBe(0);
    expect(commissionOn(Number.NaN, 0.1)).toBe(0);
    expect(commissionOn(1000, Number.NaN)).toBe(0);
  });
});

describe("feeBreakdown", () => {
  it("always reconciles: commission + net === commissionable", () => {
    for (const base of [0, 1, 7, 250, 2000, 6000, 99_999, 2_147_483]) {
      for (const rate of [0, 0.01, 0.0333, 0.1, 0.15, 0.5]) {
        const b = feeBreakdown(base, rate);
        expect(b.commission + b.merchantNet).toBe(b.commissionable);
        expect(b.commission).toBeGreaterThanOrEqual(0);
        // The invariant order_financials_reconciles enforces in the database.
        expect(b.merchantNet).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("never returns a negative merchant net", () => {
    expect(feeBreakdown(100, 99).merchantNet).toBeGreaterThanOrEqual(0);
  });
});

describe("rateToUnits", () => {
  it("absorbs float noise in a rate arriving over JSON", () => {
    expect(rateToUnits(0.07 + 0.001)).toBe(7100); // 0.07100000000000001
    expect(rateToUnits(0.1)).toBe(10_000);
    expect(rateToUnits(0.0333)).toBe(3330);
  });
  it("clamps at the 50% guard rail", () => {
    expect(rateToUnits(0.9)).toBe(50_000);
  });
});

describe("formatRate", () => {
  it("reads like a percentage a merchant would say out loud", () => {
    expect(formatRate(0.1)).toBe("10%");
    expect(formatRate(0.075)).toBe("7.5%");
    expect(formatRate(0)).toBe("0%");
    expect(formatRate(0.0333)).toBe("3.33%");
  });
});

describe("model gates", () => {
  it("mirrors resolve_commission_rate's outer gate exactly", () => {
    expect(modelChargesCommission("commission")).toBe(true);
    expect(modelChargesCommission("hybrid")).toBe(true);
    expect(modelChargesCommission("subscription")).toBe(false);
    expect(modelChargesCommission("free")).toBe(false);
  });

  it("knows which models bill recurring", () => {
    expect(modelChargesSubscription("subscription")).toBe(true);
    expect(modelChargesSubscription("hybrid")).toBe(true);
    expect(modelChargesSubscription("commission")).toBe(false);
    expect(modelChargesSubscription("free")).toBe(false);
  });
});
