import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TRACKING_ACCURACY_M, gradeAccuracy, gradeIsDrawable } from "./model";

const read = (...p: string[]) =>
  readFileSync(join(process.cwd(), ...p), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const MAP = read("components", "tracking", "TrackingMap.tsx");
const VIEW = read("components", "tracking", "LiveTripView.tsx");

// ── PUBLISHING A VAGUE FIX WITHOUT SAYING IT IS VAGUE IS THE OTHER LIE ─────
//
// filterFix used to refuse anything over 50 m, so the dot on the customer's
// map was always precise or absent. That is why a driver on the inland road
// looked parked for ten minutes, and it is now fixed: a 51-150 m fix is
// published.
//
// Which creates the opposite risk. A 120 m reading cannot tell two parallel
// roads apart, and drawn as a confident 12 px dot it asserts one of them. The
// error ring is what makes publishing it honest, so the two must ship
// together — and the ring must start exactly where "precise" stops.
describe("a degraded fix is drawn as degraded", () => {
  it("rings at the precision boundary, not at an unrelated number", () => {
    // Was a bare 120, chosen when nothing over 50 m ever reached the map.
    expect(MAP).toContain("acc > TRACKING_ACCURACY_M");
    expect(MAP).not.toMatch(/acc\s*>\s*120/);
  });

  it("declares accuracyM on MapPin instead of casting for it", () => {
    // It was read as (driver as MapPin & { accuracyM?: number }) — which is
    // why nobody noticed that no caller passed it and the ring had never
    // been drawn once in production.
    expect(MAP).toMatch(/accuracyM\?: number;/);
    expect(MAP).not.toContain("as MapPin & {");
  });

  it("actually passes it from the live fix", () => {
    expect(VIEW).toContain("accuracyM: fix.accuracyM");
  });

  it("covers the whole band that filterFix now publishes", () => {
    // Every accuracy that is drawable but not precise must get a ring.
    for (const m of [51, 80, 120, 150]) {
      expect(gradeIsDrawable(gradeAccuracy(m))).toBe(true);
      expect(m).toBeGreaterThan(TRACKING_ACCURACY_M);
    }
    // And a precise fix must not be cluttered with one.
    expect(TRACKING_ACCURACY_M).toBe(50);
    expect(gradeAccuracy(50)).toBe("precise");
  });
});
