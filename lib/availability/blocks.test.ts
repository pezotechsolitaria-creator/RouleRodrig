import { describe, it, expect } from "vitest";
import { blockedOn, blockedAssetIds, eachDay, type Block } from "./blocks";

// ── THE ARITHMETIC THAT DECIDES WHETHER A STRANGER CAN BOOK ─────────────────
//
// The owner reported that a date shows free on the website while the scooter is
// already gone. The engine was never stale — every availability read hits live
// rows. It read one table, `bookings`, so a vehicle lent to a friend or taken
// for a service was invisible because there was nowhere to record it.
//
// These blocks now count exactly as held bookings do. That equivalence is the
// whole design, and it is what is tested here: get the per-day count wrong by
// one and either a scooter is rented twice, or a scooter sits idle because the
// site thinks it is busy.

const b = (start: string, end: string, asset: string | null = null): Block => ({
  scooter: "burgman",
  start_date: start,
  end_date: end,
  asset_id: asset,
});

describe("how many units a block takes on a given day", () => {
  it("counts a day inside the range", () => {
    expect(blockedOn([b("2026-09-10", "2026-09-14")], "2026-09-12")).toBe(1);
  });

  it("counts BOTH ends, because a block is inclusive", () => {
    // The bug this prevents is the classic one: a scooter handed back on the
    // 14th being offered to somebody else on the 14th.
    const one = [b("2026-09-10", "2026-09-14")];
    expect(blockedOn(one, "2026-09-10")).toBe(1);
    expect(blockedOn(one, "2026-09-14")).toBe(1);
  });

  it("counts nothing outside the range", () => {
    const one = [b("2026-09-10", "2026-09-14")];
    expect(blockedOn(one, "2026-09-09")).toBe(0);
    expect(blockedOn(one, "2026-09-15")).toBe(0);
  });

  it("adds up when several blocks cover the same day", () => {
    // Two of the three units away at once. With units = 3 that still leaves
    // one bookable, which is why this returns a COUNT and not a boolean.
    const two = [b("2026-09-10", "2026-09-14"), b("2026-09-12", "2026-09-20")];
    expect(blockedOn(two, "2026-09-12")).toBe(2);
    expect(blockedOn(two, "2026-09-11")).toBe(1);
    expect(blockedOn(two, "2026-09-16")).toBe(1);
  });

  it("counts a single-day block", () => {
    expect(blockedOn([b("2026-09-12", "2026-09-12")], "2026-09-12")).toBe(1);
  });

  it("is zero when there are no blocks", () => {
    expect(blockedOn([], "2026-09-12")).toBe(0);
  });

  it("compares dates as ISO strings, so months and years order correctly", () => {
    // Lexicographic comparison on YYYY-MM-DD is the same as chronological.
    // It stops being true the moment anything is formatted differently, so it
    // is asserted rather than assumed.
    const across = [b("2026-12-28", "2027-01-03")];
    expect(blockedOn(across, "2026-12-31")).toBe(1);
    expect(blockedOn(across, "2027-01-01")).toBe(1);
    expect(blockedOn(across, "2027-01-04")).toBe(0);
  });
});

describe("blocked physical units", () => {
  it("collects the named ones", () => {
    const out = blockedAssetIds([b("2026-09-10", "2026-09-14", "unit-1")]);
    expect(out.has("unit-1")).toBe(true);
  });

  it("ignores blocks that name no unit", () => {
    // A block with no asset takes "any one unit", which the per-day count
    // already handles. Adding null to the busy set would be a bug.
    expect(blockedAssetIds([b("2026-09-10", "2026-09-14", null)]).size).toBe(0);
  });

  it("does not repeat a unit blocked twice", () => {
    const out = blockedAssetIds([
      b("2026-09-10", "2026-09-14", "unit-1"),
      b("2026-09-20", "2026-09-22", "unit-1"),
    ]);
    expect(out.size).toBe(1);
  });
});

describe("walking a date range", () => {
  it("includes both ends", () => {
    expect(eachDay("2026-09-10", "2026-09-12")).toEqual([
      "2026-09-10",
      "2026-09-11",
      "2026-09-12",
    ]);
  });

  it("returns the single day for a one-day range", () => {
    expect(eachDay("2026-09-12", "2026-09-12")).toEqual(["2026-09-12"]);
  });

  it("crosses a month boundary", () => {
    expect(eachDay("2026-09-29", "2026-10-01")).toEqual([
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
    ]);
  });

  it("returns nothing for a reversed range rather than looping forever", () => {
    expect(eachDay("2026-09-12", "2026-09-10")).toEqual([]);
  });
});

describe("the reported bug, as a test", () => {
  it("12 September is not free when the scooter was lent out over it", () => {
    // The owner's own example. Before this existed, the only thing that could
    // make a date unavailable was a booking made through the website — so a
    // scooter lent to a friend showed as free and a stranger could book it.
    const lentOut = [b("2026-09-08", "2026-09-15", "unit-1")];
    const units = 1;
    const held = 0; // nothing booked through the site
    expect(held + blockedOn(lentOut, "2026-09-12") >= units).toBe(true);
  });

  it("but the day after it comes back IS free", () => {
    const lentOut = [b("2026-09-08", "2026-09-15")];
    expect(0 + blockedOn(lentOut, "2026-09-16") >= 1).toBe(false);
  });
});
