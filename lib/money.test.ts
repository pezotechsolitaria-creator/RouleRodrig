import { describe, expect, it } from "vitest";
import { centsToDecimalString, toCents } from "./money";

describe("toCents", () => {
  // The exact values that broke Math.round(parseFloat(x) * 100) in the M2
  // review — verified live in Node before this fix existed:
  //   9.995 * 100  === 999.4999999999999  → rounds to 999 (should be 1000)
  //   0.145 * 100  === 14.499999999999998 → rounds to 14  (should be 15)
  it("handles the exact float-precision failures found in review", () => {
    expect(toCents("9.995")).toBe(1000);
    expect(toCents("0.145")).toBe(15);
  });

  it("handles simple values", () => {
    expect(toCents("0.01")).toBe(1);
    expect(toCents("0.10")).toBe(10);
    expect(toCents("9.99")).toBe(999);
    expect(toCents("999999.99")).toBe(99999999);
  });

  it("handles whole numbers and short decimals", () => {
    expect(toCents("0")).toBe(0);
    expect(toCents("5")).toBe(500);
    expect(toCents("5.5")).toBe(550);
    expect(toCents("5.1")).toBe(510);
  });

  it("rounds half-up beyond 2 decimal places", () => {
    expect(toCents("1.005")).toBe(101);
    expect(toCents("1.004")).toBe(100);
    expect(toCents("1.999")).toBe(200); // carries into the whole part
  });

  it("tolerates thousands separators and whitespace", () => {
    expect(toCents(" 1,234.56 ")).toBe(123456);
  });

  it("rejects invalid input rather than guessing", () => {
    expect(toCents("")).toBeNull();
    expect(toCents("abc")).toBeNull();
    expect(toCents("-5")).toBeNull();
    expect(toCents("1.2.3")).toBeNull();
    expect(toCents("NaN")).toBeNull();
    expect(toCents("Infinity")).toBeNull();
  });
});

describe("centsToDecimalString", () => {
  it("round-trips with toCents", () => {
    for (const v of ["0.01", "9.99", "999999.99", "5.50"]) {
      const cents = toCents(v);
      expect(cents).not.toBeNull();
      expect(centsToDecimalString(cents as number)).toBe(parseFloat(v).toFixed(2));
    }
  });
});
