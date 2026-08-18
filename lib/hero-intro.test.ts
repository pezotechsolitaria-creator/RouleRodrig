import { describe, it, expect } from "vitest";
import { INTRO, lettersDoneMs } from "./hero-intro";

// The hero timeline is shared by two heroes now — the Authentic homepage and
// the Curated banner — so the numbers below are a contract, not a preference.
// A change to any of them changes both pages, which is the point.

describe("the opening sequence keeps the shape the owner asked for", () => {
  it("writes the homepage headline in about five seconds", () => {
    // "WELCOME TO" is what the homepage headline actually says. Ten characters,
    // because the space is staggered like any other — 0.25 + 9x0.45 + 0.9.
    //
    // Measured from the moment the splash lifts, and the splash owns roughly
    // the first 1.9s, so this lands around 7s from page load.
    const done = lettersDoneMs(["WELCOME TO"]);
    expect(done).toBeCloseTo(5_200, -2);
  });

  it("resolves the whole arrival in about nine seconds after the splash", () => {
    const total = lettersDoneMs(["WELCOME TO"]) + INTRO.HOLD_MS + INTRO.DISSOLVE * 1000;
    expect(total).toBeGreaterThan(7_500);
    expect(total).toBeLessThan(9_500);
  });

  it("takes its timing from the LONGEST line, not the first", () => {
    // Lines are staggered against each other, but the phrase is not finished
    // until the widest one has finished writing. Taking the first line would
    // dissolve a two-line headline mid-word.
    expect(lettersDoneMs(["Hi", "Experience Rodrigues"])).toBe(
      lettersDoneMs(["Experience Rodrigues"]),
    );
  });

  it("ignores empty and blank lines rather than counting them", () => {
    // The content model keeps three headline slots and this site fills one, so
    // two blanks arrive on every single page load.
    expect(lettersDoneMs(["WELCOME TO", "", "   ", undefined, null])).toBe(
      lettersDoneMs(["WELCOME TO"]),
    );
  });

  it("survives a headline that has been emptied in admin", () => {
    // No letters means no wait — not NaN, and not a negative delay that would
    // fire the dissolve before the hero had rendered.
    const done = lettersDoneMs([]);
    expect(Number.isFinite(done)).toBe(true);
    expect(done).toBeGreaterThanOrEqual(0);
    expect(lettersDoneMs([""])).toBe(done);
  });

  it("grows with the headline, so editing the copy cannot outrun the timing", () => {
    // The whole reason this is derived rather than hardcoded: an editor who
    // writes a longer headline must not have it cut off mid-word.
    expect(lettersDoneMs(["Experience Rodrigues, elevated"])).toBeGreaterThan(
      lettersDoneMs(["WELCOME TO"]),
    );
  });
});
