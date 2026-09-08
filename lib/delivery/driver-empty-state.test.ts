import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

// ── THE PANEL THAT SAID THERE WAS NO WORK, ABOVE THE WORK ───────────────────
//
// The owner, with a screenshot: "Nothing available right now" filling the
// screen, and a real job — "f44 Collect & deliver" — further down the same
// page, reachable only by scrolling past the panel telling them not to bother.
//
// The cause was one condition. The driver's home renders THREE separate lists:
//
//   active         jobs already accepted
//   offers         direct dispatch offers, aimed at this driver
//   openRequests   the quote board — jobs anyone may name a price on
//
// The empty state was computed from the first two and rendered above the third.
// So with no direct offer and a full quote board, the screen said there was
// nothing while holding a boardful of work underneath.
//
// This is the worst class of bug this app can have, and it is invisible to
// every kind of testing except this one: the page renders, nothing errors,
// the tests pass, and the driver closes the app because it told them to.

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const SRC = "app/driver/DriverDashboard.tsx";

/**
 * Drop comments before counting.
 *
 * The fix comment in that file QUOTES the offending string to explain it, so a
 * naive count sees two and fails on the very note describing the bug. Same trap
 * caught lib/island-map-seam.test.ts.
 */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("the driver's home never claims there is no work while holding some", () => {
  it("counts the quote board before showing the empty state", () => {
    const src = read(SRC);
    // The condition guarding "Nothing available right now" must consider all
    // three lists. Dropping openRequests from it is precisely the regression.
    expect(src).toMatch(
      /active\.length === 0 && openRequests\.length === 0 \?/,
    );
  });

  it("still has exactly one empty state, not two competing ones", () => {
    const src = read(SRC);
    const hits = code(src).match(/Nothing available right now/g) ?? [];
    expect(hits).toHaveLength(1);
  });

  it("points at the board when there is no direct offer but jobs to quote", () => {
    // Not silence. A driver with no offer and five quotable jobs should be told
    // the jobs exist, and taken to them — the board is far enough down the page
    // that "scroll and hope" is not an answer.
    const src = read(SRC);
    expect(src).toMatch(/active\.length === 0 && openRequests\.length > 0 \?/);
    expect(src).toContain("jobs open for quotes");
    expect(src).toContain('href="#quote-board"');
  });

  it("gives that link somewhere to land", () => {
    // A jump link to an id that does not exist scrolls nowhere and looks
    // broken, which on this screen is worse than not offering it.
    const src = read(SRC);
    expect(src).toContain('id="quote-board"');
  });

  it("says one job in the singular", () => {
    // "1 jobs open for quotes" on the screen a driver checks twenty times a day
    // is the kind of detail that makes an app feel unmaintained.
    const src = read(SRC);
    expect(src).toContain('"1 job open for quotes"');
  });
});
