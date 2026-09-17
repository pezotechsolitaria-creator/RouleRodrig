import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { vehicleToActivity, orderToActivity, rideToActivity } from "./activity";
import { centsToDisplay } from "./money";

const read = (...p: string[]) =>
  readFileSync(join(process.cwd(), ...p), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

// ── THE SAME BUG, THE FOURTH TIME ──────────────────────────────────────────
//
// Activity.amount carried RUPEES for a vehicle and a place, CENTS for an order
// and a ride. Both screens that rendered it branched on `kind === "order"` and
// printed everything else as whole rupees. That was written when orders were
// the only cents — but ride_requests.quoted_price is cents too, so a Rs 1,800
// transfer, stored as 180000, was shown to the customer as "Rs 180,000" on
// /orders and /track.
//
// The live rows prove the unit: quoted_price holds 180000, 97880, 44720, 25000
// for fares of Rs 1,800, Rs 978.80, Rs 447.20 and Rs 250.
//
// Two earlier fixes are recorded in those files (M162, M165). Each corrected
// one direction and left the other. lib/money.ts already states the rule both
// missed: convert at the EDGE, once, and name the field for its unit.
describe("every Activity amount is cents, whatever the source stores", () => {
  it("converts a booking, which is stored in whole rupees", () => {
    const a = vehicleToActivity(
      { id: "aaaaaaaa-0000-0000-0000-000000000000", amount_paid: 2500 },
      "2026-08-15",
    );
    expect(a.amountCents).toBe(250000); // Rs 2,500
  });

  it("leaves an order alone, which is already cents", () => {
    const a = orderToActivity({ id: "o1", total: 171000, status: "paid" } as never);
    expect(a.amountCents).toBe(171000); // Rs 1,710
  });

  it("leaves a ride alone — this is the one that was wrong", () => {
    // The real row behind the bug.
    const a = rideToActivity({ id: "r1", quoted_price: 180000, status: "new" } as never);
    expect(a.amountCents).toBe(180000);
    expect(centsToDisplay(a.amountCents!)).toBe("1,800");
    // What the customer actually saw.
    expect(centsToDisplay(a.amountCents!)).not.toBe("180,000");
  });

  it("formats a rental and a transfer on the same scale", () => {
    const rental = vehicleToActivity(
      { id: "aaaaaaaa-0000-0000-0000-000000000000", amount_paid: 524 },
      "2026-08-15",
    );
    // Rs 524 — the deposit M165 recorded rendering as "Rs 5.24".
    expect(centsToDisplay(rental.amountCents!)).toBe("524");
  });
});

describe("neither screen branches on kind any more", () => {
  const ORDERS = read("app", "orders", "page.tsx");
  const TRACK = read("app", "track", "TrackLookup.tsx");

  it("renders through one formatter", () => {
    for (const src of [ORDERS, TRACK]) {
      expect(src).toContain("centsToDisplay(");
    }
  });

  it("has no kind-based money branch left", () => {
    // `kind === "order" ? cents : rupees` is the shape that shipped the bug
    // twice. It cannot be correct: the set of cents kinds is not {order}.
    for (const src of [ORDERS, TRACK]) {
      expect(src).not.toMatch(/kind === "order"\s*\n?\s*\?\s*centsToDecimalString/);
      expect(src).not.toMatch(/Math\.round\((a|activity)\.amount/);
    }
  });

  it("no longer exposes a field called amount", () => {
    // The name is the guard. lib/money.ts: "Never let a variable called
    // `amount` hold either unit."
    expect(read("lib", "activity.ts")).not.toMatch(/^\s*amount:/m);
  });
});

describe("centsToDisplay", () => {
  it("keeps the thousands separator, which is the whole point", () => {
    expect(centsToDisplay(180000)).toBe("1,800");
    expect(centsToDisplay(1294200)).toBe("12,942");
  });

  it("drops .00 but keeps real cents", () => {
    expect(centsToDisplay(52400)).toBe("524");
    expect(centsToDisplay(97880)).toBe("978.80");
    expect(centsToDisplay(44720)).toBe("447.20");
  });

  it("handles zero and negatives", () => {
    expect(centsToDisplay(0)).toBe("0");
    expect(centsToDisplay(-25000)).toBe("-250");
  });
});
