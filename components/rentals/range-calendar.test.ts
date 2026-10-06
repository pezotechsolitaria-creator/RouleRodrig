import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { addDays, isoOf, monthCells, monthTitle, pickDay, weekdayHeads } from "./RangeCalendar";

// ── The sheet's calendar (owner brief, 6 Oct 2026) ──────────────────────────
//
// Monday first, the month in the reader's language, and the same six rows in
// every month so nothing below it moves when the month changes.

describe("monthCells", () => {
  it("is always 42 cells: six rows, so the sheet never changes height", () => {
    for (let m = 0; m < 12; m++) expect(monthCells(2026, m)).toHaveLength(42);
  });

  it("starts the week on Monday", () => {
    // 1 October 2026 is a Thursday: three blanks, then the 1st.
    const oct = monthCells(2026, 9);
    expect(oct.slice(0, 4)).toEqual([null, null, null, "2026-10-01"]);
    // 1 February 2027 is a Monday: no blank at all.
    expect(monthCells(2027, 1)[0]).toBe("2027-02-01");
    // 1 November 2026 is a Sunday: six blanks.
    expect(monthCells(2026, 10).indexOf("2026-11-01")).toBe(6);
  });

  it("puts every day of the month in, once", () => {
    expect(monthCells(2026, 9).filter(Boolean)).toHaveLength(31);
    expect(monthCells(2028, 1).filter(Boolean)).toHaveLength(29);
  });
});

describe("monthTitle and the weekday heads", () => {
  it("names the month in the site's language, not the browser's", () => {
    expect(monthTitle(2026, 9, "en")).toBe("October 2026");
    expect(monthTitle(2026, 9, "fr")).toBe("octobre 2026");
    expect(monthTitle(2026, 9, "cr")).toBe("octobre 2026");
  });

  it("heads the columns Monday to Sunday", () => {
    expect(weekdayHeads("en").map((d) => d.long)).toEqual([
      "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
    ]);
    expect(weekdayHeads("fr")[0].long).toBe("lundi");
    expect(weekdayHeads("en").map((d) => d.short)).toEqual(["M", "T", "W", "T", "F", "S", "S"]);
  });
});

describe("pickDay", () => {
  const none = () => false;

  it("takes the first tap as pickup and the second as return", () => {
    const a = pickDay("2026-10-06", "", "", none);
    expect(a).toEqual({ start: "2026-10-06", end: "" });
    expect(pickDay("2026-10-07", a.start, a.end, none)).toEqual({ start: "2026-10-06", end: "2026-10-07" });
  });

  it("starts again on a tap before the pickup, or after a full range", () => {
    expect(pickDay("2026-10-04", "2026-10-06", "", none)).toEqual({ start: "2026-10-04", end: "" });
    expect(pickDay("2026-10-20", "2026-10-06", "2026-10-07", none)).toEqual({ start: "2026-10-20", end: "" });
  });

  it("never spans a booked day: the tap becomes a new pickup instead", () => {
    const blocked = (d: string) => d === "2026-10-09";
    expect(pickDay("2026-10-12", "2026-10-06", "", blocked)).toEqual({ start: "2026-10-12", end: "" });
  });

  it("walks dates in UTC, across a month and a year", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(isoOf(2026, 0, 5)).toBe("2026-01-05");
  });
});

describe("the component holds its height", () => {
  const src = readFileSync(join(process.cwd(), "components", "rentals", "RangeCalendar.tsx"), "utf8");

  it("renders day cells of a fixed height, and a fixed-height hint line", () => {
    expect(src).toContain("h-11");
    expect(src).toMatch(/tapReturnHint/);
  });

  it("is keyboardable: arrows, Home/End, PageUp/PageDown", () => {
    expect(src).toContain("{ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }");
    for (const k of ["Home", "End", "PageUp", "PageDown"]) expect(src).toContain(`"${k}"`);
    expect(src).toContain("onKeyDown={(e) => onKey(e, day)}");
  });
});
