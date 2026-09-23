import { describe, it, expect } from "vitest";
import { dayLabel } from "./day-label";
import { FOOD_COPY } from "./copy.i18n";

// M216. The picker labelled every day that was not today "Tomorrow", because
// M161 only ever offered two. Chez Banane now offers three.

describe("day chips name the day they stand for", () => {
  const en = FOOD_COPY.en.when;
  const today = "2026-09-23"; // a Wednesday

  it("today, tomorrow, then weekday and date", () => {
    expect(dayLabel("2026-09-23", today, en)).toBe("Today");
    expect(dayLabel("2026-09-24", today, en)).toBe("Tomorrow");
    expect(dayLabel("2026-09-25", today, en)).toBe("Friday 25");
  });

  it("the third chip is never 'Tomorrow' again", () => {
    expect(dayLabel("2026-09-25", today, en)).not.toBe(en.tomorrow);
  });

  it("across a Sunday and a month end", () => {
    expect(dayLabel("2026-09-27", "2026-09-26", en)).toBe("Tomorrow");
    expect(dayLabel("2026-09-28", "2026-09-26", en)).toBe("Monday 28");
    expect(dayLabel("2026-10-01", "2026-09-29", en)).toBe("Thursday 1");
  });

  it("in French and Kreol", () => {
    expect(dayLabel("2026-09-25", today, FOOD_COPY.fr.when)).toBe("vendredi 25");
    expect(dayLabel("2026-09-25", today, FOOD_COPY.cr.when)).toBe("Vandredi 25");
  });

  it("depends only on the date strings, never the browser clock", () => {
    // Same inputs, same answer — there is no Date.now() in it.
    expect(dayLabel("2026-09-25", today, en)).toBe(dayLabel("2026-09-25", today, en));
  });
});
