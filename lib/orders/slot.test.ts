import { describe, it, expect } from "vitest";
import {
  parseInstant, parseSlotRange, slotFromBounds, formatSlot, slotTimes,
  rodriguesDay, isSlotToday, isSlotLaterDay,
} from "./slot";

// The two shapes Postgres actually sends, copied from production on
// 23 Sept 2026 (a rolled-back rehearsal order for Chez Banane, Friday 12:00).
const RANGE = '["2026-09-25 08:00:00+00","2026-09-25 08:30:00+00")';
const FROM_JSON = "2026-09-25T08:00:00+00:00";
const TO_JSON = "2026-09-25T08:30:00+00:00";

describe("parsing both shapes", () => {
  it("reads PostgREST's range text — the shape WorkQueue could not parse", () => {
    const w = parseSlotRange(RANGE);
    expect(w).not.toBeNull();
    expect(w!.from.toISOString()).toBe("2026-09-25T08:00:00.000Z");
    expect(w!.to.toISOString()).toBe("2026-09-25T08:30:00.000Z");
  });

  it("reads the RPC jsonb bounds", () => {
    const w = slotFromBounds(FROM_JSON, TO_JSON);
    expect(w!.from.toISOString()).toBe("2026-09-25T08:00:00.000Z");
  });

  it("a bare '+00' offset parses (V8 alone returns Invalid Date for it)", () => {
    expect(Number.isNaN(new Date("2026-09-25T08:00:00+00").getTime())).toBe(true);
    expect(parseInstant("2026-09-25 08:00:00+00")?.toISOString()).toBe("2026-09-25T08:00:00.000Z");
  });

  it("no slot is null, never a guess", () => {
    expect(parseSlotRange(null)).toBeNull();
    expect(parseSlotRange("")).toBeNull();
    expect(slotFromBounds(null, null)).toBeNull();
    expect(parseInstant("not a date")).toBeNull();
  });
});

describe("Rodrigues time, whatever the machine's zone", () => {
  const w = parseSlotRange(RANGE)!;

  it("08:00 UTC is 12:00 on the island", () => {
    expect(slotTimes(w)).toBe("12:00–12:30");
  });

  it("names the day and date in each language", () => {
    expect(formatSlot(w, "en")).toBe("Friday 25 September, 12:00–12:30");
    expect(formatSlot(w, "fr")).toBe("vendredi 25 septembre, 12:00–12:30");
    expect(formatSlot(w, "cr")).toBe("Vandredi 25 Septam, 12:00–12:30");
  });

  it("says Today / Tomorrow only when it is", () => {
    const wedNight = new Date("2026-09-23T19:40:00Z"); // Wed 23:40 on the island
    const thuMorning = new Date("2026-09-24T04:00:00Z"); // Thu 08:00
    const friMorning = new Date("2026-09-25T04:00:00Z"); // Fri 08:00
    expect(formatSlot(w, "en", wedNight)).toBe("Friday 25 September, 12:00–12:30");
    expect(formatSlot(w, "en", thuMorning)).toBe("Tomorrow, 12:00–12:30");
    expect(formatSlot(w, "en", friMorning)).toBe("Today, 12:00–12:30");
  });

  it("the island's midnight, not UTC's, decides which day it is", () => {
    // 21:00 UTC Thursday is already 01:00 Friday in Rodrigues.
    const lateThuUtc = new Date("2026-09-24T21:00:00Z");
    expect(rodriguesDay(lateThuUtc)).toBe("2026-09-25");
    expect(isSlotToday(w, lateThuUtc)).toBe(true);
    expect(isSlotLaterDay(w, new Date("2026-09-24T19:59:00Z"))).toBe(true);  // Thu 23:59
    expect(isSlotLaterDay(w, new Date("2026-09-24T20:00:00Z"))).toBe(false); // Fri 00:00
  });
});
