import { describe, it, expect } from "vitest";
import {
  BOOKING_STATUSES,
  STATUS_VOCAB,
  clockAt,
  clockRange,
  dayLabel,
  dayLabelAt,
  dayLoad,
  durationText,
  minutesBetween,
  todayOnIsland,
  type DiaryDay,
} from "./diary";

function day(over: Partial<DiaryDay> = {}): DiaryDay {
  return {
    date: "2026-09-08",
    isClosed: false,
    opensAt: "08:00:00",
    closesAt: "17:00:00",
    bookings: [],
    bookedMinutes: 0,
    ...over,
  };
}

describe("how full a day is", () => {
  it("measures against open minutes TIMES bays", () => {
    // Nine hours, two bays, eighteen hours to sell. Nine hours booked is half a
    // day for that business — measured against nine it would read 100% and a
    // provider coping fine would be told they were full.
    expect(dayLoad(day({ bookedMinutes: 540 }), 2)).toBeCloseTo(0.5);
    expect(dayLoad(day({ bookedMinutes: 540 }), 1)).toBeCloseTo(1);
  });

  it("never exceeds 1, so a bar cannot overflow its track", () => {
    expect(dayLoad(day({ bookedMinutes: 5000 }), 1)).toBe(1);
  });

  it("returns null for a closed day rather than zero", () => {
    // Closed and empty are different facts. A closed Sunday drawn as an empty
    // bar reads as a day nobody wanted.
    expect(dayLoad(day({ isClosed: true }), 1)).toBeNull();
    expect(dayLoad(day({ bookedMinutes: 0 }), 1)).toBe(0);
  });

  it("returns null when the hours are missing or inside out", () => {
    expect(dayLoad(day({ opensAt: null }), 1)).toBeNull();
    expect(dayLoad(day({ opensAt: "18:00:00", closesAt: "09:00:00" }), 1)).toBeNull();
  });

  it("treats zero bays as one rather than dividing by zero", () => {
    expect(dayLoad(day({ bookedMinutes: 270 }), 0)).toBeCloseTo(0.5);
  });
});

describe("minutesBetween", () => {
  it("reads both HH:MM and Postgres HH:MM:SS", () => {
    expect(minutesBetween("08:00", "17:00")).toBe(540);
    expect(minutesBetween("08:30:00", "09:00:00")).toBe(30);
  });
  it("refuses nonsense instead of returning a negative width", () => {
    expect(minutesBetween("17:00", "08:00")).toBeNull();
    expect(minutesBetween("nope", "09:00")).toBeNull();
    expect(minutesBetween(null, "09:00")).toBeNull();
  });
});

describe("times are Rodrigues wall-clock, always", () => {
  // The island is UTC+4. 05:00Z is 09:00 there, and a diary that rendered in
  // the viewer's zone would show a merchant abroad the wrong morning.
  it("formats a timestamp on the island", () => {
    expect(clockAt("2026-09-08T05:00:00+00:00")).toBe("09:00");
  });
  it("shows a range, because a duration is the point of a booking", () => {
    expect(clockRange("2026-09-08T05:00:00Z", "2026-09-08T08:00:00Z")).toBe("09:00 – 12:00");
  });
  it("survives a bad timestamp without throwing", () => {
    expect(clockAt("not a date")).toBe("");
  });
  it("labels a bare date as the day it actually is", () => {
    expect(dayLabel("2026-09-08")).toMatch(/Tue/);
  });
  it("dates a booking by the island, not by UTC", () => {
    // 20:00 in Rodrigues is 16:00Z the same day — but 21:00 local on the 8th is
    // 17:00Z on the 8th, and 2026-09-08T20:00:00Z is already the 9th there.
    // Slicing the UTC date off the string would show the customer the wrong day.
    expect(dayLabelAt("2026-09-08T20:00:00Z")).toMatch(/Wed/);
    expect(dayLabel("2026-09-08")).toMatch(/Tue/);
    expect(dayLabelAt("rubbish")).toBe("");
  });

  it("todayOnIsland is a plain YYYY-MM-DD", () => {
    expect(todayOnIsland(new Date("2026-09-08T20:00:00Z"))).toBe("2026-09-09");
  });
});

describe("durations read like a provider says them", () => {
  it("switches to hours once a job passes one", () => {
    expect(durationText(30)).toBe("30 min");
    expect(durationText(60)).toBe("1 h");
    expect(durationText(90)).toBe("1 h 30");
    expect(durationText(180)).toBe("3 h");
  });
  it("says nothing rather than something wrong", () => {
    expect(durationText(0)).toBe("");
    expect(durationText(Number.NaN)).toBe("");
  });
});

describe("only a booked appointment holds time", () => {
  // This must agree with service_slots, which counts `status = 'booked'` alone.
  // If they disagree the diary shows a slot as taken that the booker will sell.
  it("agrees with the SQL", () => {
    expect(STATUS_VOCAB.booked.holdsTime).toBe(true);
    for (const s of BOOKING_STATUSES.filter((x) => x !== "booked")) {
      expect(STATUS_VOCAB[s].holdsTime, `${s} must not hold time`).toBe(false);
    }
  });
  it("keeps a no-show separate from a cancellation", () => {
    // Both free the slot, and they are not the same event: a customer who did
    // not turn up cost the provider the morning anyway.
    expect(STATUS_VOCAB.no_show.label).not.toBe(STATUS_VOCAB.cancelled.label);
  });
});
