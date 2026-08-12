import { describe, it, expect } from "vitest";
import { paymentWords, paymentLabel } from "./words";

// A shopkeeper should never have to learn what "captured" means to find out
// whether they have been paid.

describe("paymentWords", () => {
  it("translates the whole payment_status enum — no raw values survive", () => {
    for (const s of ["captured", "authorized", "pending", "failed", "refunded", "partially_refunded"]) {
      const w = paymentWords(s);
      expect(w.label).not.toBe(s);
      expect(w.label).not.toMatch(/_/);
    }
  });

  it("says 'Paid' for captured, which is the whole question", () => {
    expect(paymentWords("captured").label).toBe("Paid");
    expect(paymentWords("captured").tone).toBe("good");
  });

  it("turns an unpaid CASH order into an instruction, not a warning", () => {
    // The merchant has nothing to chase — they collect it at the door.
    const w = paymentWords("pending", "cash");
    expect(w.label).toBe("Pay on collection");
    expect(w.tone).toBe("waiting");
  });

  it("keeps an unpaid bank transfer as something to check", () => {
    const w = paymentWords("pending", "bank_transfer");
    expect(w.label).toBe("Not paid yet");
    expect(w.hint).toContain("bank transfer");
  });

  it("never prints a raw enum for a status added after this file was written", () => {
    const w = paymentWords("some_future_status");
    expect(w.label).toBe("Unknown");
    expect(w.label).not.toContain("future");
  });

  it("never prints a raw provider name either", () => {
    expect(paymentWords("captured", "mcb_juice").hint).toContain("MCB Juice");
    expect(paymentWords("captured", "weird_new_gateway").hint).not.toContain("weird_new_gateway");
  });

  it("handles a missing payment row without throwing", () => {
    expect(paymentWords(null).label).toBe("Unknown");
    expect(paymentWords(undefined, undefined).label).toBe("Unknown");
  });

  it("paymentLabel is the label alone, for a narrow table cell", () => {
    expect(paymentLabel("captured", "cash")).toBe("Paid");
  });
});
