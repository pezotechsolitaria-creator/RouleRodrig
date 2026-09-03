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
  it("formats by kind instead of assuming cents", () => {
    expect(SRC).toMatch(/activity\.kind === "order"/);
    expect(SRC).toMatch(/centsToDecimalString\(activity\.amount\)/);
    expect(SRC).toMatch(/Math\.round\(activity\.amount\)\.toLocaleString/);
  });

  it("no longer runs every kind through the cents formatter", () => {
    // The exact shape of the bug: one call, unconditional.
    expect(SRC).not.toMatch(/Rs \{centsToDecimalString\(activity\.amount\)\}/);
  });

  it("the units really do differ in the API, which is why this is needed", () => {
    // Rentals and experiences: rupees.
    expect(API).toMatch(/amount:\s*\(b\.amountPaid[^)]*\)\s*\?\?\s*\(b\.deposit/);
    // Orders: the marketplace total, which is stored in cents.
    expect(API).toMatch(/amount:\s*\(o\.total/);
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
