import { describe, expect, it } from "vitest";
import { centsToDecimalString, centsToShortString, rupeesToCents, toCents } from "./money";

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

  // Found live during M3 adversarial testing: this exact value reached the
  // create_product() RPC and overflowed the `integer` price column,
  // surfacing to the client as a raw 500 instead of a clean 400.
  it("rejects amounts that would overflow the integer price column", () => {
    expect(toCents("99999999999999.99")).toBeNull();
    expect(toCents("21474836.48")).toBeNull(); // one cent over int4 max
    expect(toCents("21474836.47")).toBe(2147483647); // exactly int4 max — still valid
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

describe("centsToShortString", () => {
  it("drops the .00 that a card has no room for", () => {
    expect(centsToShortString(45000)).toBe("450");
    expect(centsToShortString(15000)).toBe("150");
    expect(centsToShortString(0)).toBe("0");
  });

  it("keeps real cents, because dropping them would change the price", () => {
    expect(centsToShortString(45050)).toBe("450.50");
    expect(centsToShortString(1)).toBe("0.01");
    expect(centsToShortString(99)).toBe("0.99");
  });

  it("handles a negative amount without inventing a rupee", () => {
    expect(centsToShortString(-45000)).toBe("-450");
    expect(centsToShortString(-45050)).toBe("-450.50");
  });
});

describe("rupeesToCents", () => {
  it("converts the whole-rupee deposits that live in bookings today", () => {
    expect(rupeesToCents(1288)).toBe(128800);
    expect(rupeesToCents(572)).toBe(57200);
  });

  it("round-trips through centsToDecimalString to the same rupee figure", () => {
    expect(centsToDecimalString(rupeesToCents(1288)!)).toBe("1288.00");
  });

  it("leaves an order total, which is already cents, to be passed through untouched", () => {
    // The regression: orders.total = 171000 is Rs 1,710.00. It must NOT be
    // converted again — that is what produced "Rs 171,000" on the money desk.
    expect(centsToDecimalString(171000)).toBe("1710.00");
  });

  it("handles a fractional rupee without floating-point drift", () => {
    expect(rupeesToCents(0.1 + 0.2)).toBe(30);
    expect(rupeesToCents(1699.99)).toBe(169999);
  });

  it("returns null for a missing or non-numeric deposit rather than 0", () => {
    // 0 would render as "Rs 0.00" — a claim that the customer owes nothing,
    // which is not the same as "no deposit was recorded".
    expect(rupeesToCents(null)).toBeNull();
    expect(rupeesToCents(undefined)).toBeNull();
    expect(rupeesToCents("1288")).toBeNull();
    expect(rupeesToCents(NaN)).toBeNull();
    expect(rupeesToCents(Infinity)).toBeNull();
  });

  it("keeps zero as zero, because a zero deposit is a real value", () => {
    expect(rupeesToCents(0)).toBe(0);
  });
});
