import { describe, expect, it } from "vitest";
import { resolvePaidAmountMur, withPayPalFee } from "./paypal";

// "Pay in full" and "pay the deposit" used to write an identical booking row,
// so a customer who paid 100% was still shown a balance due at pickup — and the
// owner, reading the same row, asked for it. These tests pin the server-side
// derivation that tells the two apart from the capture alone; the client is
// never asked how much it paid, because it could lie in the cheap direction.

const RATE = 0.02; // EUR per MUR — a plausible fixture, not a live rate.
const eurFor = (mur: number) => mur * RATE;
/** What PayPal would actually capture for a given MUR amount (fee included). */
const captured = (mur: number) => eurFor(withPayPalFee(mur).total);

const DEPOSIT = 400;
const FULL = 1600;

describe("resolvePaidAmountMur", () => {
  it("recognises a deposit payment", () => {
    expect(resolvePaidAmountMur(captured(DEPOSIT), { depositMur: DEPOSIT, fullMur: FULL }, eurFor)).toBe(DEPOSIT);
  });

  it("recognises a pay-in-full — the case that was being double-charged", () => {
    expect(resolvePaidAmountMur(captured(FULL), { depositMur: DEPOSIT, fullMur: FULL }, eurFor)).toBe(FULL);
  });

  it("picks the CLOSER of the two, never merely the first", () => {
    // Slightly under the full price is still a full payment, not a deposit.
    expect(resolvePaidAmountMur(captured(FULL) * 0.97, { depositMur: DEPOSIT, fullMur: FULL }, eurFor)).toBe(FULL);
    expect(resolvePaidAmountMur(captured(DEPOSIT) * 1.03, { depositMur: DEPOSIT, fullMur: FULL }, eurFor)).toBe(DEPOSIT);
  });

  it("tolerates FX drift within 10%", () => {
    expect(resolvePaidAmountMur(captured(FULL) * 0.93, { depositMur: DEPOSIT, fullMur: FULL }, eurFor)).toBe(FULL);
  });

  it("returns null when the amount matches NEITHER — better no figure than a wrong one", () => {
    expect(resolvePaidAmountMur(captured(FULL) * 0.5, { depositMur: DEPOSIT, fullMur: FULL }, eurFor)).toBeNull();
    expect(resolvePaidAmountMur(0.01, { depositMur: DEPOSIT, fullMur: FULL }, eurFor)).toBeNull();
  });

  it("handles a deposit-only booking (places have no full-payment option)", () => {
    expect(resolvePaidAmountMur(captured(DEPOSIT), { depositMur: DEPOSIT, fullMur: null }, eurFor)).toBe(DEPOSIT);
  });

  it("ignores a 'full' that is not actually larger than the deposit", () => {
    // A 100%-deposit booking: both candidates would be identical.
    expect(resolvePaidAmountMur(captured(500), { depositMur: 500, fullMur: 500 }, eurFor)).toBe(500);
  });

  it("returns null on an unusable FX rate rather than inventing a number", () => {
    expect(resolvePaidAmountMur(50, { depositMur: DEPOSIT, fullMur: FULL }, () => 0)).toBeNull();
    expect(resolvePaidAmountMur(50, { depositMur: DEPOSIT, fullMur: FULL }, () => NaN)).toBeNull();
  });
});

describe("the balance a customer is shown", () => {
  // Mirrors app/manage-booking's derivation, which is what the customer reads
  // and the owner acts on at handover.
  const balance = (total: number, paid: number) => Math.max(0, total - paid);

  it("a deposit payer still owes the remainder", () => {
    expect(balance(FULL, DEPOSIT)).toBe(1200);
  });

  it("a pay-in-full payer owes NOTHING — the bug in one line", () => {
    expect(balance(FULL, FULL)).toBe(0);
  });

  it("never shows a negative balance if someone overpaid", () => {
    expect(balance(FULL, FULL + 500)).toBe(0);
  });
});
