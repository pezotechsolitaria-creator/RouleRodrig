import { describe, expect, it } from "vitest";
import { layerOpacities } from "@/components/DuskSequence";

// ── THE SUNSET MUST NOT PASS THROUGH GREY ───────────────────────────────────
//
// The first dusk cross-faded a blue day sky into a navy night sky. It compiled,
// it animated, and it was wrong: at the midpoint both layers sat at 50% and the
// screen went muddy brown-grey. That class of bug survives a type checker, a
// build, and a screenshot taken at rest, because at rest the overlay is not
// rendered at all — it is only visible in the 600ms nobody is testing.
//
// So the shape is asserted here instead.

describe("dusk sequence layers", () => {
  it("shows pure sunset at the midpoint — neither endpoint is on screen", () => {
    const m = layerOpacities(0.5);
    expect(m.day).toBe(0);
    expect(m.night).toBe(0);
    // ...and the warm sky is fully opaque there, so there is nothing behind it
    // for the two endpoints to have averaged into.
    expect(m.warm).toBeCloseTo(1, 5);
  });

  it("never lets the two endpoints overlap — that overlap IS the mud", () => {
    for (let i = 0; i <= 100; i++) {
      const { day, night } = layerOpacities(i / 100);
      expect(Math.min(day, night)).toBe(0);
    }
  });

  it("ends where it started: full day at 0, full night at 1", () => {
    const a = layerOpacities(0);
    expect(a.day).toBe(1);
    expect(a.night).toBe(0);
    expect(a.stars).toBe(0);

    const b = layerOpacities(1);
    expect(b.day).toBe(0);
    expect(b.night).toBe(1);
    expect(b.stars).toBeGreaterThan(0);
  });

  it("keeps the warm sky present through the whole middle of the sweep", () => {
    // If this ever collapses, the transition is a fade rather than a sunset.
    for (let i = 20; i <= 80; i++) {
      expect(layerOpacities(i / 100).warm).toBeGreaterThan(0.5);
    }
  });

  it("the sun sets before the moon rises — they are never both bright", () => {
    for (let i = 0; i <= 100; i++) {
      const { sun, moon } = layerOpacities(i / 100);
      expect(Math.min(sun, moon)).toBe(0);
    }
  });

  it("the sun is fully bright through the first half — the frame people see", () => {
    // The reported bug, exactly. The sun used to fade from the first frame, so
    // at the midpoint — the moment anyone actually catches, and the moment a
    // screenshot lands on — it sat at 15% and read as a coloured wash with no
    // sun in it. Anything below full brightness here is that bug returning.
    for (let i = 0; i <= 50; i++) {
      expect(layerOpacities(i / 100).sun).toBe(1);
    }
  });

  it("the moon and stars stay off until the sky is actually dark", () => {
    expect(layerOpacities(0.5).moon).toBe(0);
    expect(layerOpacities(0.5).stars).toBe(0);
    expect(layerOpacities(0.62).moon).toBe(0);
    expect(layerOpacities(1).moon).toBeGreaterThan(0.9);
  });
});
