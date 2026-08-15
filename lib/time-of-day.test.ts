import { describe, it, expect } from "vitest";
import {
  countByMode, defaultMode, matchesMode, modeCue, rodriguesHour,
} from "./time-of-day";

// A fixed UTC instant, so these assertions mean the same thing on any machine.
const at = (utcHour: number, minute = 0) =>
  new Date(Date.UTC(2026, 7, 14, utcHour, minute, 0));

describe("rodriguesHour", () => {
  it("is UTC+4, not the visitor's clock", () => {
    // The bug this prevents is invisible from anywhere except Rodrigues: a
    // traveller browsing from Paris should see the ISLAND's evening.
    expect(rodriguesHour(at(0))).toBe(4);
    expect(rodriguesHour(at(8))).toBe(12);
    expect(rodriguesHour(at(14))).toBe(18);
  });

  it("wraps past midnight rather than going to 24+", () => {
    expect(rodriguesHour(at(20))).toBe(0);
    expect(rodriguesHour(at(21))).toBe(1);
    expect(rodriguesHour(at(23))).toBe(3);
  });
});

describe("defaultMode", () => {
  it("opens in day during island daylight", () => {
    expect(defaultMode(at(2))).toBe("day");   // 06:00 Rodrigues
    expect(defaultMode(at(8))).toBe("day");   // 12:00
    expect(defaultMode(at(13, 59))).toBe("day"); // 17:59
  });

  it("opens in night after island sunset", () => {
    expect(defaultMode(at(14))).toBe("night"); // 18:00 Rodrigues
    expect(defaultMode(at(18))).toBe("night"); // 22:00
    expect(defaultMode(at(23))).toBe("night"); // 03:00
    expect(defaultMode(at(1, 59))).toBe("night"); // 05:59
  });

  it("flips exactly on the boundaries and nowhere else", () => {
    expect(defaultMode(at(1, 59))).toBe("night");
    expect(defaultMode(at(2, 0))).toBe("day");
    expect(defaultMode(at(13, 59))).toBe("day");
    expect(defaultMode(at(14, 0))).toBe("night");
  });

  it("covers all 24 hours without a gap", () => {
    for (let h = 0; h < 24; h++) {
      expect(["day", "night"]).toContain(defaultMode(at(h)));
    }
  });
});

describe("matchesMode", () => {
  it("shows an unset listing in BOTH modes", () => {
    // Every listing that predates this feature has no value. If unset meant
    // "hidden", turning the switch on would empty the marketplace.
    expect(matchesMode(undefined, "day")).toBe(true);
    expect(matchesMode(undefined, "night")).toBe(true);
    expect(matchesMode(null, "day")).toBe(true);
  });

  it("shows a 'both' listing in both", () => {
    expect(matchesMode("both", "day")).toBe(true);
    expect(matchesMode("both", "night")).toBe(true);
  });

  it("keeps a night-only experience out of the day", () => {
    // Stargazing is not a night-themed lagoon trip; it does not exist at noon.
    expect(matchesMode("night", "night")).toBe(true);
    expect(matchesMode("night", "day")).toBe(false);
  });

  it("keeps a day-only experience out of the night", () => {
    expect(matchesMode("day", "day")).toBe(true);
    expect(matchesMode("day", "night")).toBe(false);
  });
});

describe("countByMode", () => {
  const items = [
    { t: "day" as const },
    { t: "night" as const },
    { t: "both" as const },
    { t: undefined },
  ];
  const read = (i: { t?: "day" | "night" | "both" }) => i.t;

  it("counts what each mode would actually show", () => {
    // Used to stop the switch offering a mode that leads nowhere.
    expect(countByMode(items, read)).toEqual({ day: 3, night: 3 });
  });

  it("reports zero honestly", () => {
    expect(countByMode([{ t: "night" as const }], read)).toEqual({ day: 0, night: 1 });
  });

  it("handles an empty catalogue", () => {
    expect(countByMode([], read)).toEqual({ day: 0, night: 0 });
  });
});

describe("modeCue", () => {
  it("explains a dark page rather than letting it look like a bug", () => {
    expect(modeCue("night")).toMatch(/night/i);
    expect(modeCue("day")).toMatch(/day/i);
  });

  it("speaks all three languages", () => {
    expect(modeCue("night", "fr")).toContain("nuit");
    expect(modeCue("night", "cr")).toContain("nwar");
    expect(modeCue("day", "fr")).toContain("jour");
  });
});
