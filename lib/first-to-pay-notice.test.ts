import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ── THE RULE EXISTED AND NO PAYMENT SCREEN SAID IT (M160) ───────────────────
//
// PRODUCT.md has always been explicit: "First-to-pay wins a vehicle; the loser
// is notified." Every payment surface stayed silent about it. Somebody who
// leaves the page to think it over has no way to know the dates are still open
// to everyone else — they find out by losing them, after being told the
// booking was "confirmed" enough to ask for money.
//
// This is honest urgency rather than manufactured: the rule is real, it is the
// owner's, and writing it down costs the customer nothing but a surprise.

const SRC = readFileSync(
  join(__dirname, "..", "components", "PayPalDeposit.tsx"),
  "utf8",
);

describe("the payment step says what happens if you wait", () => {
  it("carries the notice in all three languages", () => {
    expect((SRC.match(/firstPaid:/g) ?? []).length).toBe(4); // en, fr, cr + fallback
  });

  it("says the first deposit paid keeps the vehicle", () => {
    expect(SRC).toContain("First deposit paid keeps the vehicle");
    expect(SRC).toContain("Le premier acompte reçu garde le véhicule");
    expect(SRC).toContain("Premie depo peye gard veikil la");
  });

  it("says plainly that the dates are NOT held before payment", () => {
    // The half a customer actually needs. Without it the sentence reads as a
    // sales nudge; with it, it is the truth about their booking.
    expect(SRC).toContain("the dates are not held until this clears");
  });

  it("renders it, not just defines it", () => {
    expect(SRC).toContain("{T.firstPaid}");
  });

  it("keeps the security line as well", () => {
    // Urgency must not cost the reassurance that sits beside it.
    expect(SRC).toContain("{T.secure}");
  });
});
