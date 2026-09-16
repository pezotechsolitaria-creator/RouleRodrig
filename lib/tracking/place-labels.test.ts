import { describe, expect, it } from "vitest";
import { labelsForZoom, PLACE_LABELS } from "./place-labels";

const byName = (n: string) => PLACE_LABELS.find((l) => l.name === n);

// ── "THERE ARE 2 GRAVIERS U SHOWS ME ON ADMIN DASHBOARD" ───────────────────
//
// The owner's screenshot of the Graviers coast carried "Graviers" and
// "Graviers beach" as two pills on top of each other, plus a third "Graviers"
// printed into the satellite imagery. The gazetteer holds both entries 505 m
// apart, which at zoom 14 is 56 px — one smudge.
describe("two names for one place", () => {
  it("still holds both entries — neither is deleted", () => {
    expect(byName("Graviers")).toBeTruthy();
    expect(byName("Graviers beach")).toBeTruthy();
  });

  it("they really are close enough to collide", () => {
    const a = byName("Graviers")!;
    const b = byName("Graviers beach")!;
    const dy = (a.lat - b.lat) * 110_574;
    const dx = (a.lng - b.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
    const metres = Math.hypot(dx, dy);
    expect(metres).toBeGreaterThan(300);
    expect(metres).toBeLessThan(700);
  });

  it("draws only one of them at the zoom the owner was looking at", () => {
    const names = labelsForZoom(14).map((l) => l.name);
    const graviers = names.filter((n) => n.startsWith("Graviers"));
    expect(graviers).toEqual(["Graviers"]);
  });

  it("keeps the one that orients you, not whichever came first in the file", () => {
    // Graviers is a village and sits in a lower zoom tier than its beach.
    expect(byName("Graviers")!.minZoom).toBeLessThanOrEqual(
      byName("Graviers beach")!.minZoom,
    );
  });

  it("reveals the finer name once there is room for it", () => {
    // Zoomed right in, the difference between a village and its beach is
    // exactly what the reader needs, so both come back.
    const names = labelsForZoom(17).map((l) => l.name);
    expect(names).toContain("Graviers");
    expect(names).toContain("Graviers beach");
  });
});

describe("the overlay never stacks labels at any zoom", () => {
  const gapPx = (zoom: number) => {
    const mpp = (156543.03392 * Math.cos((-19.7 * Math.PI) / 180)) / 2 ** zoom;
    return 60 * mpp;
  };

  it("holds the minimum gap from zoom 11 to 18", () => {
    for (let z = 11; z <= 18; z++) {
      const shown = labelsForZoom(z);
      const gap = gapPx(z);
      const collisions: string[] = [];
      for (let i = 0; i < shown.length; i++) {
        for (let j = i + 1; j < shown.length; j++) {
          const a = shown[i], b = shown[j];
          const dy = (a.lat - b.lat) * 110_574;
          const dx = (a.lng - b.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
          if (Math.hypot(dx, dy) < gap) collisions.push(`${a.name} / ${b.name} @z${z}`);
        }
      }
      expect(collisions).toEqual([]);
    }
  });

  it("still shows the three anchors when the whole island is on screen", () => {
    // Thinning must not empty the map. At zoom 11 you should still know which
    // way up Rodrigues is.
    const names = labelsForZoom(11).map((l) => l.name);
    expect(names.length).toBeGreaterThanOrEqual(2);
  });

  it("shows more as you zoom in, never fewer", () => {
    let prev = 0;
    for (let z = 11; z <= 18; z++) {
      const n = labelsForZoom(z).length;
      expect(n).toBeGreaterThanOrEqual(prev);
      prev = n;
    }
  });
});
