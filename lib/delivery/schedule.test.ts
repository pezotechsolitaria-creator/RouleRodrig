import { describe, it, expect } from "vitest";
import {
  ASAP_HOURS,
  MAX_DAYS_AHEAD,
  SLOT_HOURS,
  TIME_SLOTS,
  formatWindow,
  islandDate,
  islandDatePlus,
  islandHour,
  maxBookableDate,
  slotAvailableToday,
  slotHoursLabel,
  slotsFor,
  todayIsStillPossible,
  urgencyLabel,
  urgencyOf,
} from "./schedule";

// A UTC instant. Rodrigues is UTC+4 with no DST, so 22:00Z is 02:00 the NEXT
// day on the island — which is the case every timezone bug here comes from.
const at = (iso: string) => new Date(iso);

describe("the clock that matters is the island's", () => {
  it("rolls the date over at 20:00 UTC, not at midnight UTC", () => {
    expect(islandDate(at("2026-09-10T19:59:00Z"))).toBe("2026-09-10");
    expect(islandDate(at("2026-09-10T20:00:00Z"))).toBe("2026-09-11");
  });

  it("reads 02:00 local from 22:00 UTC the day before", () => {
    // The exact case the SQL probe asserts on the other side. A person opening
    // the app at 2am is, in UTC, still yesterday evening.
    const t = at("2026-09-10T22:00:00Z");
    expect(islandDate(t)).toBe("2026-09-11");
    expect(islandHour(t)).toBeCloseTo(2, 5);
  });

  it("gives the hour with minutes, so a half-past is not rounded away", () => {
    expect(islandHour(at("2026-09-10T07:30:00Z"))).toBeCloseTo(11.5, 5);
  });

  it("adds days without a local-timezone shift moving the date", () => {
    expect(islandDatePlus(1, at("2026-09-10T09:00:00Z"))).toBe("2026-09-11");
    // Month end, and a leap year.
    expect(islandDatePlus(1, at("2026-01-31T09:00:00Z"))).toBe("2026-02-01");
    expect(islandDatePlus(1, at("2028-02-28T09:00:00Z"))).toBe("2028-02-29");
    expect(islandDatePlus(365, at("2026-01-01T09:00:00Z"))).toBe("2027-01-01");
  });

  it("puts the horizon 90 days out", () => {
    expect(maxBookableDate(at("2026-09-10T09:00:00Z"))).toBe(
      islandDatePlus(MAX_DAYS_AHEAD, at("2026-09-10T09:00:00Z")),
    );
  });
});

describe("a slot is only offered while it can still be met", () => {
  // 05:00Z = 09:00 island, mid-morning.
  const nineAm = at("2026-09-10T05:00:00Z");
  // 11:00Z = 15:00 island, mid-afternoon.
  const threePm = at("2026-09-10T11:00:00Z");
  // 17:00Z = 21:00 island, after everything.
  const ninePm = at("2026-09-10T17:00:00Z");

  it("keeps the morning open at 09:00 and closes it by 15:00", () => {
    expect(slotAvailableToday("morning", nineAm)).toBe(true);
    expect(slotAvailableToday("morning", threePm)).toBe(false);
  });

  it("still offers the afternoon at 15:00 — it runs to 17:00", () => {
    // The half-started case. The server starts the window at `now` rather than
    // at noon; the point here is only that it is not hidden.
    expect(slotAvailableToday("afternoon", threePm)).toBe(true);
  });

  it("offers nothing for today once the evening has closed", () => {
    expect(slotsFor("today", ninePm)).toEqual([]);
    expect(todayIsStillPossible(ninePm)).toBe(false);
    // ...and "today" as a whole should then not be offered at all.
    expect(todayIsStillPossible(nineAm)).toBe(true);
  });

  it("never narrows tomorrow or a future date", () => {
    // The reason slotsFor takes the kind: only TODAY is eroded by the clock.
    expect(slotsFor("tomorrow", ninePm)).toEqual(TIME_SLOTS);
    expect(slotsFor("date", ninePm)).toEqual(TIME_SLOTS);
  });

  it("offers no slots for ASAP, because ASAP is not a time of day", () => {
    expect(slotsFor("asap", nineAm)).toEqual([]);
  });
});

describe("the hours match the ones in the database", () => {
  it("keeps the table identical to compute_delivery_window()", () => {
    // If this and 20260827090000_m152 ever disagree, a screen is offering a
    // window dispatch will refuse. The SQL side is asserted in that migration's
    // own probe; this is the other half of the pair.
    expect(SLOT_HOURS).toEqual({
      any: { from: 8, to: 20 },
      morning: { from: 8, to: 12 },
      afternoon: { from: 12, to: 17 },
      evening: { from: 17, to: 20 },
    });
    expect(ASAP_HOURS).toBe(4);
    expect(MAX_DAYS_AHEAD).toBe(90);
  });

  it("never leaves a slot that ends before it starts", () => {
    for (const s of TIME_SLOTS) {
      expect(SLOT_HOURS[s].to, s).toBeGreaterThan(SLOT_HOURS[s].from);
    }
  });

  it("labels the hours the way a clock reads", () => {
    expect(slotHoursLabel("morning")).toBe("08:00 – 12:00");
    expect(slotHoursLabel("evening")).toBe("17:00 – 20:00");
  });
});

describe("saying the window back", () => {
  const now = at("2026-09-10T05:00:00Z"); // 09:00 island

  it("says Today for a window starting today", () => {
    const s = "2026-09-10T08:00:00Z"; // 12:00 island
    expect(formatWindow(s, "2026-09-10T13:00:00Z", "today", "afternoon", "en", now))
      .toBe("Today · 12:00 – 17:00");
  });

  it("says Tomorrow, in each language", () => {
    const s = "2026-09-11T08:00:00Z";
    const e = "2026-09-11T13:00:00Z";
    expect(formatWindow(s, e, "tomorrow", "afternoon", "en", now)).toContain("Tomorrow");
    expect(formatWindow(s, e, "tomorrow", "afternoon", "fr", now)).toContain("Demain");
    expect(formatWindow(s, e, "tomorrow", "afternoon", "cr", now)).toContain("Demen");
  });

  it("names the day for anything further out", () => {
    const out = formatWindow(
      "2026-12-25T04:00:00Z", "2026-12-25T16:00:00Z", "date", "any", "en", now,
    );
    expect(out).toMatch(/25 Dec/);
    expect(out).not.toContain("Tomorrow");
  });

  it("says ASAP as words, never as a clock", () => {
    // "08:00 – 12:00" for an ASAP job would be a window the customer never
    // chose and the driver should not be held to.
    expect(formatWindow("2026-09-10T05:00:00Z", "2026-09-10T09:00:00Z", "asap", "any", "en", now))
      .toBe("As soon as possible");
    expect(formatWindow(null, null, "asap", "any", "fr", now)).toBe("Dès que possible");
  });

  it("returns something empty rather than throwing on a missing window", () => {
    expect(formatWindow(null, null, "today", "any", "en", now)).toBe("");
  });
});

describe("the badge on a driver's card", () => {
  const now = at("2026-09-10T05:00:00Z"); // 09:00 island

  it("calls a window that is already open 'now'", () => {
    expect(urgencyOf("2026-09-10T04:00:00Z", now)).toBe("now");
    expect(urgencyOf("2026-09-10T05:00:00Z", now)).toBe("now");
  });

  it("separates later-today from tomorrow from further out", () => {
    expect(urgencyOf("2026-09-10T13:00:00Z", now)).toBe("today");
    expect(urgencyOf("2026-09-11T08:00:00Z", now)).toBe("tomorrow");
    expect(urgencyOf("2026-12-25T04:00:00Z", now)).toBe("later");
  });

  it("treats a missing window as later, never as urgent", () => {
    // Cautious in the safe direction: a row with no window must not jump the
    // queue on a board that is sorted by urgency.
    expect(urgencyOf(null, now)).toBe("later");
  });

  it("labels every bucket in every language", () => {
    for (const lang of ["en", "fr", "cr"] as const) {
      for (const u of ["now", "today", "tomorrow", "later"] as const) {
        expect(urgencyLabel(u, lang), `${lang}/${u}`).toBeTruthy();
      }
    }
  });
});
