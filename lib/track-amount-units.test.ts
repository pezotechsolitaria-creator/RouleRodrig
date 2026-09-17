import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { centsToDecimalString } from "./money";

// ── ONE FORMATTER, TWO UNITS (M162) ─────────────────────────────────────────
//
// /api/activity/lookup returns amounts in different units depending on kind:
// a rental or an experience carries deposit/amountPaid in whole RUPEES, a shop
// order carries total in CENTS. The tracking card ran all of them through
// centsToDecimalString.
//
// A customer who had paid a Rs 524 deposit opened /track and read "Rs 5.24" —
// a hundredth of their money, on the one screen people go to when they are
// already worried about a payment.

const ROOT = join(__dirname, "..");
const SRC = readFileSync(join(ROOT, "app", "track", "TrackLookup.tsx"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");
const API = readFileSync(
  join(ROOT, "app", "api", "activity", "lookup", "route.ts"),
  "utf8",
);

describe("the tracking card shows the amount the customer actually paid", () => {
  // ── REPLACED DELIBERATELY ────────────────────────────────────────────────
  //
  // M162 fixed a Rs 524 deposit reading as "Rs 5.24" by branching on kind, and
  // this test pinned that branch. The branch was correct for what it fixed and
  // wrong as an invariant: rides are cents as well as orders, so the same line
  // printed a Rs 1,800 transfer as "Rs 180,000".
  //
  // The unit is now resolved at the edge and the field is named amountCents.
  // Asserting the branch is GONE is the stronger guarantee.
  it("runs every kind through one formatter, with no branch", () => {
    expect(SRC).toContain("centsToDisplay(activity.amountCents)");
    expect(SRC).not.toMatch(/activity\.kind === "order"/);
    expect(SRC).not.toMatch(/Math\.round\(activity\.amount/);
  });

  it("no longer runs every kind through the cents formatter", () => {
    // The exact shape of the bug: one call, unconditional.
    expect(SRC).not.toMatch(/centsToDecimalString\(activity\.amount\w*\)/);
  });

  it("the API converts at the edge, so the units no longer differ on the wire", () => {
    // They still differ in the DATABASE — a booking is rupees, an order is
    // cents — which is exactly why the conversion belongs here and once.
    expect(API).toMatch(/amountCents: rupeesToCents\(/);
    expect(API).toMatch(/amountCents: \(o\.total/);
    // And nothing leaves this route under the old ambiguous name.
    expect(API).not.toMatch(/^\s*amount:/m);
  });
});

describe("the two formatters give the answers a customer expects", () => {
  it("a Rs 524 rental deposit is not a hundredth of itself", () => {
    // What the page used to print for a rental.
    expect(centsToDecimalString(524)).toBe("5.24");
    // What it prints now.
    expect(Math.round(524).toLocaleString("en-US")).toBe("524");
  });

  it("a shop order in cents still reads as rupees and cents", () => {
    expect(centsToDecimalString(52400)).toBe("524.00");
  });
});
