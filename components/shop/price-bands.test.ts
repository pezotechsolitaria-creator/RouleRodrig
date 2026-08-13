import { describe, it, expect } from "vitest";
import { priceBands } from "./FilterPanel";

// All values are integer cents. Rs 250 = 25000.

describe("priceBands", () => {
  it("cuts a real catalogue range in useful places", () => {
    // The honey page: Rs 250 – Rs 450. The first version of this produced
    // "Under Rs 260 / 270 / 280 / 290" — four bands inside the bottom quarter,
    // none of which anyone would ever tap.
    expect(priceBands(25_000, 45_000)).toEqual([30_000, 35_000, 40_000]);
  });

  it("scales to a wide catalogue without producing dozens of bands", () => {
    const bands = priceBands(10_000, 500_000);
    expect(bands.length).toBeLessThanOrEqual(4);
    expect(bands[0]).toBeGreaterThan(10_000);
    expect(bands[bands.length - 1]).toBeLessThan(500_000);
  });

  it("offers nothing when everything costs about the same", () => {
    // Rs 250 – Rs 280: there is no meaningful choice to offer.
    expect(priceBands(25_000, 28_000)).toEqual([]);
  });

  it("offers nothing when there is no range at all", () => {
    expect(priceBands(null, null)).toEqual([]);
    expect(priceBands(25_000, null)).toEqual([]);
    expect(priceBands(45_000, 25_000)).toEqual([]);
    expect(priceBands(25_000, 25_000)).toEqual([]);
  });

  it("never suggests a band at or beyond the top price", () => {
    // A band nothing can fall outside is a filter that does nothing.
    for (const [min, max] of [[25_000, 45_000], [500, 900_000], [100_000, 260_000]] as const) {
      for (const b of priceBands(min, max)) {
        expect(b).toBeGreaterThan(min);
        expect(b).toBeLessThan(max);
      }
    }
  });

  it("always lands on a round number a person would say out loud", () => {
    for (const b of priceBands(25_000, 45_000)) {
      // Whole rupees, and a round multiple of the chosen step.
      expect(b % 100).toBe(0);
    }
  });
});
