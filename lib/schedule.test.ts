import { describe, it, expect } from "vitest";
import {
  hhmm, toMinutes, validateDay, validateWeek, defaultWeek,
  todayLine, deliveryLine, openTone, WEEK_ORDER, WEEKDAYS, RODRIGUES_TZ,
  type DaySchedule, type ScheduleStatus,
} from "./schedule";

const day = (o: Partial<DaySchedule> = {}): DaySchedule => ({
  weekday: 1,
  is_closed: false,
  opens_at: "08:00",
  closes_at: "20:00",
  delivery_opens_at: null,
  delivery_closes_at: null,
  delivery_closed: false,
  ...o,
});

const status = (o: Partial<ScheduleStatus> = {}): ScheduleStatus => ({
  has_schedule: true, is_open: true, delivery_available: true,
  local_date: "2026-08-03", local_time: "12:00:00", weekday: 1,
  opens_at: "08:00:00", closes_at: "20:00:00", is_closed: false,
  delivery_opens_at: null, delivery_closes_at: null, delivery_closed: false,
  is_override: false, next_open_at: null,
  ...o,
});

describe("time parsing", () => {
  it("normalises Postgres time values to HH:MM", () => {
    expect(hhmm("08:00:00")).toBe("08:00");
    expect(hhmm("8:05")).toBe("08:05");
    expect(hhmm(null)).toBe("");
    expect(hhmm("nonsense")).toBe("");
  });

  it("converts to minutes since midnight", () => {
    expect(toMinutes("00:00")).toBe(0);
    expect(toMinutes("08:30")).toBe(510);
    expect(toMinutes("23:59")).toBe(1439);
    expect(toMinutes(null)).toBeNull();
  });
});

// These mirror the CHECK constraints on store_hours and the checks inside
// store_hours_write_internal(). The database is the authority — if one of these
// ever disagrees with it, the database wins and this test is the bug.
describe("day validation mirrors the database constraints", () => {
  it("accepts a normal open day", () => {
    expect(validateDay(day())).toBeNull();
  });

  it("ignores times on a closed day", () => {
    expect(validateDay(day({ is_closed: true, opens_at: null, closes_at: null }))).toBeNull();
  });

  it("rejects closing before opening", () => {
    expect(validateDay(day({ opens_at: "17:00", closes_at: "09:00" }))).toMatch(/after opening/i);
  });

  it("rejects a zero-length day", () => {
    expect(validateDay(day({ opens_at: "09:00", closes_at: "09:00" }))).toMatch(/after opening/i);
  });

  it("requires both times on an open day", () => {
    expect(validateDay(day({ closes_at: null }))).toMatch(/both/i);
  });

  it("treats an unset delivery window as inheriting shop hours", () => {
    expect(validateDay(day({ delivery_opens_at: null, delivery_closes_at: null }))).toBeNull();
  });

  it("rejects a half-specified delivery window", () => {
    expect(validateDay(day({ delivery_opens_at: "09:00" }))).toMatch(/both/i);
  });

  it("rejects delivery starting before the shop opens", () => {
    expect(validateDay(day({ delivery_opens_at: "07:00", delivery_closes_at: "18:00" })))
      .toMatch(/before the shop opens/i);
  });

  it("rejects delivery ending after the shop closes", () => {
    expect(validateDay(day({ delivery_opens_at: "09:00", delivery_closes_at: "21:00" })))
      .toMatch(/after the shop closes/i);
  });

  it("rejects a backwards delivery window", () => {
    expect(validateDay(day({ delivery_opens_at: "18:00", delivery_closes_at: "09:00" })))
      .toMatch(/end after it starts/i);
  });

  it("accepts a delivery window narrower than the shop's hours", () => {
    expect(validateDay(day({ delivery_opens_at: "09:00", delivery_closes_at: "18:00" }))).toBeNull();
  });

  it("accepts delivery exactly matching the shop's hours", () => {
    expect(validateDay(day({ delivery_opens_at: "08:00", delivery_closes_at: "20:00" }))).toBeNull();
  });

  it("names the offending day when validating a week", () => {
    const week = defaultWeek().map((d) => (d.weekday === 3 ? { ...d, closes_at: "01:00" } : d));
    expect(validateWeek(week)).toMatch(/^Wednesday:/);
  });

  it("accepts the default starting week", () => {
    expect(validateWeek(defaultWeek())).toBeNull();
  });
});

describe("week ordering", () => {
  it("runs Monday..Sunday while keeping Postgres Sunday-zero indices", () => {
    expect(WEEK_ORDER).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(WEEKDAYS[0]).toBe("Sunday");
    expect(WEEKDAYS[1]).toBe("Monday");
    expect(WEEKDAYS[6]).toBe("Saturday");
  });

  it("closes Sunday by default and opens the rest", () => {
    const w = defaultWeek();
    expect(w.find((d) => d.weekday === 0)?.is_closed).toBe(true);
    expect(w.filter((d) => !d.is_closed)).toHaveLength(6);
  });
});

describe("customer-facing copy", () => {
  it("shows today's window when open", () => {
    expect(todayLine(status())).toBe("08:00 – 20:00");
  });

  it("says closed on a closed day", () => {
    expect(todayLine(status({ is_closed: true, opens_at: null, closes_at: null }))).toBe("Closed today");
  });

  it("distinguishes 'hours not set' from 'closed'", () => {
    expect(todayLine(status({ has_schedule: false }))).toBe("Hours not set");
    expect(openTone(status({ has_schedule: false }))).toBe("unknown");
    expect(openTone(status({ is_open: false }))).toBe("closed");
    expect(openTone(status())).toBe("open");
  });

  it("falls back to shop hours when the delivery window is unset", () => {
    expect(deliveryLine(status())).toBe("08:00 – 20:00");
  });

  it("uses the narrowed delivery window when set", () => {
    expect(deliveryLine(status({ delivery_opens_at: "09:00:00", delivery_closes_at: "18:00:00" })))
      .toBe("09:00 – 18:00");
  });

  it("reports no delivery when the day is delivery_closed", () => {
    expect(deliveryLine(status({ delivery_closed: true }))).toBe("No delivery today");
  });
});

// Rodrigues is UTC+4 with no DST. The server runs in UTC, so the local calendar
// day can be AHEAD of the UTC one — the exact trap this system had to avoid.
describe("Rodrigues timezone", () => {
  it("is pinned to a named IANA zone, not a hardcoded offset", () => {
    expect(RODRIGUES_TZ).toBe("Indian/Mauritius");
  });

  it("is four hours ahead of UTC", () => {
    const instant = new Date("2026-08-05T20:30:00Z");
    const local = new Date(instant.toLocaleString("en-US", { timeZone: RODRIGUES_TZ }));
    const utc = new Date(instant.toLocaleString("en-US", { timeZone: "UTC" }));
    expect((local.getTime() - utc.getTime()) / 3_600_000).toBe(4);
  });

  it("rolls into the next calendar day before UTC does", () => {
    // 20:30 UTC on the 5th is already 00:30 on the 6th in Rodrigues.
    const instant = new Date("2026-08-05T20:30:00Z");
    const local = new Date(instant.toLocaleString("en-US", { timeZone: RODRIGUES_TZ }));
    expect(local.getDate()).toBe(6);
    expect(local.getHours()).toBe(0);
    // ...and it is a different weekday, which is what breaks naive now() logic.
    expect(local.getDay()).not.toBe(instant.getUTCDay());
  });

  it("does not observe DST — same offset in January and July", () => {
    const jan = new Date("2026-01-15T12:00:00Z");
    const jul = new Date("2026-07-15T12:00:00Z");
    const off = (d: Date) =>
      (new Date(d.toLocaleString("en-US", { timeZone: RODRIGUES_TZ })).getTime() -
       new Date(d.toLocaleString("en-US", { timeZone: "UTC" })).getTime()) / 3_600_000;
    expect(off(jan)).toBe(off(jul));
  });
});
