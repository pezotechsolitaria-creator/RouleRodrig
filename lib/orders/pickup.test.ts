import { describe, it, expect } from "vitest";
import { normalizePickupCode, formatPickupCode, isCompletePickupCode } from "./pickup";

// The merchant types this code under counter pressure and the customer may
// read it off a screen, a photo or a forwarded WhatsApp message. Anything a
// human plausibly types must normalise to the same eight characters the
// database hashed, or the handover fails for a reason nobody can see.

describe("normalizePickupCode", () => {
  it("accepts the code exactly as displayed", () => {
    expect(normalizePickupCode("A7K2-9MTX")).toBe("A7K29MTX");
  });

  it("survives lower case, spaces and stray punctuation", () => {
    expect(normalizePickupCode("a7k2 9mtx")).toBe("A7K29MTX");
    expect(normalizePickupCode(" A7K2 – 9MTX. ")).toBe("A7K29MTX");
    expect(normalizePickupCode("a7k2\n9mtx")).toBe("A7K29MTX");
  });

  it("stops at eight characters so a pasted sentence can't become a code", () => {
    expect(normalizePickupCode("A7K29MTXEXTRA")).toBe("A7K29MTX");
  });

  it("returns empty for input with nothing usable in it", () => {
    expect(normalizePickupCode("---")).toBe("");
    expect(normalizePickupCode("")).toBe("");
  });
});

describe("formatPickupCode", () => {
  it("groups into two blocks of four", () => {
    expect(formatPickupCode("A7K29MTX")).toBe("A7K2-9MTX");
  });

  it("is idempotent — reformatting an already-formatted code is a no-op", () => {
    expect(formatPickupCode(formatPickupCode("A7K29MTX"))).toBe("A7K2-9MTX");
  });

  it("does not add a dangling separator while the merchant is still typing", () => {
    expect(formatPickupCode("A7K2")).toBe("A7K2");
    expect(formatPickupCode("A7K")).toBe("A7K");
  });
});

describe("isCompletePickupCode", () => {
  it("is true only at exactly eight usable characters", () => {
    expect(isCompletePickupCode("A7K2-9MTX")).toBe(true);
    expect(isCompletePickupCode("A7K2-9MT")).toBe(false);
    expect(isCompletePickupCode("")).toBe(false);
  });
});
