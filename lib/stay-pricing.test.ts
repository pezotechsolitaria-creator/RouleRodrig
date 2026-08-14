import { describe, it, expect } from "vitest";
import { nightsBetween, quoteStay } from "./stay-pricing";

describe("nightsBetween", () => {
  it("charges the nights slept, not the days touched", () => {
    // The one sum every traveller checks by hand: 10th → 14th is four nights.
    expect(nightsBetween("2026-09-10", "2026-09-14")).toBe(4);
    expect(nightsBetween("2026-09-10", "2026-09-11")).toBe(1);
  });

  it("crosses a month and a year boundary correctly", () => {
    expect(nightsBetween("2026-09-29", "2026-10-02")).toBe(3);
    expect(nightsBetween("2026-12-30", "2027-01-02")).toBe(3);
  });

  it("is immune to daylight saving and local timezone", () => {
    // Parsed as UTC on purpose. Local-time parsing makes a night 23 or 25 hours
    // long across a DST change and rounds to the wrong night count — Rodrigues
    // has no DST, but the SERVER is not on Rodrigues.
    expect(nightsBetween("2026-03-28", "2026-03-30")).toBe(2);
    expect(nightsBetween("2026-10-24", "2026-10-26")).toBe(2);
  });

  it("returns 0 rather than a negative or a guess", () => {
    expect(nightsBetween("2026-09-14", "2026-09-10")).toBe(0); // backwards
    expect(nightsBetween("2026-09-10", "2026-09-10")).toBe(0); // same day
    expect(nightsBetween("", "2026-09-14")).toBe(0);
    expect(nightsBetween("2026-09-10", "not-a-date")).toBe(0);
  });
});

describe("quoteStay", () => {
  it("multiplies by nights AND rooms — the bug this exists to kill", () => {
    const q = quoteStay({ nightlyRate: 2500 }, "2026-09-10", "2026-09-14", 2);
    expect(q).toEqual({ nights: 4, rooms: 2, rate: 2500, total: 20_000, flat: false });
  });

  it("prices a single room for a single night", () => {
    expect(quoteStay({ nightlyRate: 2500 }, "2026-09-10", "2026-09-11")?.total).toBe(2500);
  });

  it("does not quote before both dates are chosen", () => {
    // Half a date range is not a free stay — it is not yet a quote. Returning a
    // zero here would render "Total Rs 0" under the guest's cursor.
    expect(quoteStay({ nightlyRate: 2500 }, "2026-09-10", "")).toBeNull();
    expect(quoteStay({ nightlyRate: 2500 }, "2026-09-14", "2026-09-10")).toBeNull();
  });

  it("leaves a legacy flat listing charging exactly what it charges today", () => {
    // The whole point of the fallback. An owner who has not set a nightly rate
    // must not have their listing silently re-priced — in either direction.
    const q = quoteStay({ depositAmount: 3000 }, "2026-09-10", "2026-09-17", 3);
    expect(q).toEqual({ nights: 7, rooms: 3, rate: 3000, total: 3000, flat: true });
  });

  it("prefers the nightly rate once one is set", () => {
    const q = quoteStay({ nightlyRate: 2000, depositAmount: 9999 }, "2026-09-10", "2026-09-12");
    expect(q?.total).toBe(4000);
    expect(q?.flat).toBe(false);
  });

  it("treats no rate at all as request-only, never as free", () => {
    // null and 0 must stay distinguishable: 0 would be a booking that reserves a
    // room while costing nothing.
    expect(quoteStay({}, "2026-09-10", "2026-09-14")).toBeNull();
    expect(quoteStay(null, "2026-09-10", "2026-09-14")).toBeNull();
    expect(quoteStay({ nightlyRate: 0, depositAmount: 0 }, "2026-09-10", "2026-09-14")).toBeNull();
  });

  it("refuses junk rates instead of producing NaN totals", () => {
    for (const bad of [-500, NaN, Infinity, "abc" as unknown as number, null as unknown as number]) {
      expect(quoteStay({ nightlyRate: bad }, "2026-09-10", "2026-09-14")).toBeNull();
    }
  });

  it("never lets a tampered room count reduce or explode the bill", () => {
    // rooms arrives from a client in the modal. Rounding and the >=1 floor are
    // what stop 0.5 rooms halving a bill and -1 inverting it.
    expect(quoteStay({ nightlyRate: 1000 }, "2026-09-10", "2026-09-11", 0)?.total).toBe(1000);
    expect(quoteStay({ nightlyRate: 1000 }, "2026-09-10", "2026-09-11", -3)?.total).toBe(1000);
    expect(quoteStay({ nightlyRate: 1000 }, "2026-09-10", "2026-09-11", 2.6)?.total).toBe(3000);
  });

  it("rounds a fractional rate to whole rupees once, not per night", () => {
    const q = quoteStay({ nightlyRate: 2500.4 }, "2026-09-10", "2026-09-13");
    expect(q?.rate).toBe(2500);
    expect(q?.total).toBe(7500);
  });
});
