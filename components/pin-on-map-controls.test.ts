import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ── TWO CONTROLS, ONE CORNER ────────────────────────────────────────────────
//
// PinOnMap pins a "Where I am" button at right-3/top-3 with z-[500]. The
// Map/Satellite switcher is `position:absolute; right:10px; top:10px;
// z-index:500`. Same corner, same layer — and the button comes later in the
// DOM, so it won the paint.
//
// Measured in a real browser at 375px before the fix: the button covered 92%
// of the switcher, and document.elementFromPoint on the CENTRE of each chip
// returned the "Where I am" button. Not merely hard to hit — impossible. Every
// tap aimed at Map or Satellite pressed recentre instead.
//
// What made it hard to see is that it looked like a rendering artefact: all
// that showed was a couple of pixels of the yellow "on" chip poking out from
// behind the pill.

const PIN = readFileSync(join(process.cwd(), "components/PinOnMap.tsx"), "utf8");
const CSS = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

describe("the basemap switcher is reachable on the pin-the-place map", () => {
  it("still puts the recentre button in the top-right corner", () => {
    // If this ever moves, the stacking below is no longer needed — but the two
    // must be changed together, so this asserts the premise.
    expect(PIN).toMatch(/absolute right-3 top-3/);
  });

  it("moves the switcher out from under it", () => {
    const sw = /className="rr-basemap-switch[^"]*"/.exec(PIN);
    expect(sw, "PinOnMap no longer renders a basemap switch").toBeTruthy();
    expect(
      sw![0],
      "the switcher shares the corner with the recentre button, so it needs the --below modifier",
    ).toContain("rr-basemap-switch--below");
  });

  it("clears the button rather than merely nudging past it", () => {
    // 12px inset + 44px min-h-11 button + 8px breathing room.
    const rule = /\.rr-basemap-switch--below\s*\{([^}]*)\}/.exec(CSS);
    expect(rule, "the --below rule is gone from globals.css").toBeTruthy();
    const top = /top:\s*(\d+)px/.exec(rule![1]);
    expect(top).toBeTruthy();
    expect(Number(top![1])).toBeGreaterThanOrEqual(56);
  });

  it("leaves the shared class alone for the maps that do not collide", () => {
    // IslandMap and TrackingMap have no competing top-right control; pushing
    // every switcher down would be a regression on both.
    const base = /\.rr-basemap-switch\s*\{([^}]*)\}/.exec(CSS);
    expect(base).toBeTruthy();
    expect(base![1]).toMatch(/top:\s*10px/);
  });
});
