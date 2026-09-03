import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ── BOTH PATHS, HONESTLY LABELLED (M161) ────────────────────────────────────
//
// M91 removed the payment sheet from the booking screen for a costed reason:
// the owner rents vehicles he does not all own, so a booking taken on the spot
// can become a refund that costs the PayPal fee, the exchange spread and the
// customer's trust.
//
// What it did not account for is the rule the platform has always run on —
// first deposit paid keeps the vehicle. A customer who wanted certainty had no
// way to get it, and could lose their dates waiting for a check they never
// asked for. The owner asked for the option back on 2026-09-03.
//
// The bar for putting a payment button back is that neither path lies: waiting
// is still offered first and still costs nothing, and paying now states the
// refund promise in the same breath as the button.

const ROOT = join(__dirname, "..");
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const BOOKING = strip(readFileSync(join(ROOT, "components", "BookingSection.tsx"), "utf8"));
const I18N = readFileSync(join(ROOT, "lib", "i18n.ts"), "utf8");

describe("the customer can pay immediately if they want to", () => {
  it("renders the deposit sheet on the booking screen again", () => {
    expect(BOOKING).toContain("<PayPalDeposit");
    expect(BOOKING).toContain('kind="vehicle"');
  });

  it("passes the real booking and the server-derived deposit", () => {
    // Never a client-invented amount: the API returns depositAmount and the
    // breakdown is server-priced.
    expect(BOOKING).toMatch(/bookingId=\{lastBooking\.bookingId\}/);
    expect(BOOKING).toMatch(/depositMur=\{lastBooking\.deposit \?\? 0\}/);
  });

  it("marks the booking paid on success rather than leaving it pending", () => {
    expect(BOOKING).toMatch(/onPaid=\{\(\) => setDepositPaid\(true\)\}/);
  });

  it("never offers it without a booking or without an amount to charge", () => {
    expect(BOOKING).toMatch(
      /!depositPaid && lastBooking\?\.bookingId && \(lastBooking\.deposit \?\? 0\) > 0/,
    );
  });
});

describe("neither path is allowed to lie", () => {
  it("keeps the free 'we will check' route above it", () => {
    // M91's reasoning still holds; this is additive, not a replacement.
    expect(BOOKING).toContain("t.booking.checkingNote");
    expect(BOOKING.indexOf("t.booking.checkingNote")).toBeLessThan(
      BOOKING.indexOf("t.booking.secureNowTitle"),
    );
  });

  it("states the refund promise beside the button, not in a policy page", () => {
    expect(BOOKING).toContain("t.booking.secureNowRefund");
    expect(I18N).toContain("we refund you in full within 24 hours");
    expect(I18N).toContain("nous vous remboursons intégralement sous 24 heures");
    expect(I18N).toContain("nou rembours ou tou seki ou finn peye dan 24 er");
  });

  it("tells the customer their dates are open until someone pays", () => {
    // The half that makes it informative rather than a nudge.
    expect(I18N).toContain("your dates stay open to everyone else");
  });

  it("carries all three languages, because the dictionary is read via a cast", () => {
    for (const k of ["secureNowTitle", "secureNowBody", "secureNowRefund"]) {
      expect((I18N.match(new RegExp(`${k}:`, "g")) ?? []).length).toBe(3);
    }
  });
});
