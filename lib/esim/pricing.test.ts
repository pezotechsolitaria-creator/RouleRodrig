import { describe, expect, it } from "vitest";
import {
  eurCentsPerGb,
  eurCentsToPayPalValue,
  formatEur,
  isSellable,
  margin,
  MIN_NET_EUR_CENTS,
  payPalValueToEurCents,
  roundUpToNinety,
  suggestRetailEurCents,
  usdMicrosToEurCents,
} from "./pricing";

const RATE = 0.86; // EUR per USD, roughly 2026

describe("units", () => {
  it("converts wholesale micros to euro cents", () => {
    expect(usdMicrosToEurCents(11_400_000, RATE)).toBe(980); // $11.40
  });
  it("round-trips PayPal's decimal strings exactly", () => {
    expect(eurCentsToPayPalValue(1590)).toBe("15.90");
    expect(payPalValueToEurCents("15.90")).toBe(1590);
    expect(payPalValueToEurCents("15.9")).toBe(1590);
    expect(payPalValueToEurCents("4290")).toBe(429000);
    expect(payPalValueToEurCents("1,590")).toBeNull();
    expect(payPalValueToEurCents(null)).toBeNull();
    expect(payPalValueToEurCents("-1.00")).toBeNull();
  });
  it("formats for each language", () => {
    expect(formatEur(1590, "en")).toBe("€15.90");
    expect(formatEur(1590, "fr")).toBe("15,90 €");
  });
});

describe("the launch catalogue is profitable", () => {
  // The four plans seeded by M223c, at their docs wholesale prices. If this
  // fails, a plan is being sold at a loss — reprice before anything else.
  it.each([
    ["1 GB / 7 d", 690, 4_600_000],
    ["3 GB / 30 d", 1590, 11_400_000],
    ["5 GB / 30 d", 2390, 18_000_000],
    ["10 GB / 30 d", 4290, 34_000_000],
  ])("%s at %i cents nets at least the minimum, even at a pessimistic rate", (_n, retail, micros) => {
    expect(isSellable(retail, micros, RATE)).toBe(true);
    expect(isSellable(retail, micros, 0.95)).toBe(true);
    expect(margin(retail, micros, RATE).netEurCents).toBeGreaterThanOrEqual(MIN_NET_EUR_CENTS);
  });
});

describe("isSellable", () => {
  it("refuses a price below cost + PayPal", () => {
    expect(isSellable(990, 11_400_000, RATE)).toBe(false);
  });
  it("refuses nonsense", () => {
    expect(isSellable(0, 1, RATE)).toBe(false);
    expect(isSellable(1000, 0, RATE)).toBe(false);
    expect(isSellable(Number.NaN, 1, RATE)).toBe(false);
  });
});

describe("suggestRetailEurCents", () => {
  it("never suggests a loss-maker, across the whole range", () => {
    for (let micros = 500_000; micros <= 80_000_000; micros += 750_000) {
      const retail = suggestRetailEurCents(micros, RATE);
      expect(isSellable(retail, micros, RATE)).toBe(true);
      expect(retail % 100).toBe(90);
    }
  });
  it("puts a bigger multiple on small plans than on large ones", () => {
    const small = suggestRetailEurCents(1_000_000, RATE) / usdMicrosToEurCents(1_000_000, RATE);
    const large = suggestRetailEurCents(40_000_000, RATE) / usdMicrosToEurCents(40_000_000, RATE);
    expect(small).toBeGreaterThan(large);
  });
});

describe("roundUpToNinety", () => {
  it("always rounds up to x.90", () => {
    expect(roundUpToNinety(537)).toBe(590);
    expect(roundUpToNinety(590)).toBe(590);
    expect(roundUpToNinety(591)).toBe(690);
    expect(roundUpToNinety(1004)).toBe(1090);
  });
});

describe("eurCentsPerGb", () => {
  it("gives the per-GB price, and null for no data", () => {
    expect(eurCentsPerGb(2390, 5120)).toBe(478);
    expect(eurCentsPerGb(100, 0)).toBeNull();
  });
});
