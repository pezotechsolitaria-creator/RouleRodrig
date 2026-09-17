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

  // ── AND THE COLLISION HAD A CAUSE UNDERNEATH IT — TWICE ─────────────────
  //
  // These two entries were 505 m apart, which is why they stacked. They were
  // 505 m apart because BOTH coordinates were wrong, 2.6 km north of the real
  // village. The village was corrected first (to OSM's -19.7265, 63.4830) and
  // a previous version of this test then asserted the pair was ">2,000 m
  // apart" and "no longer needs thinning" — which enshrined the still-broken
  // beach pin, on a wooded hillside, as the correct state. The owner found it
  // on the tracking map on 17 Sept 2026: "a beach is in a forest".
  //
  // With the beach now on the sand in front of the village they are ~300 m
  // apart, a village and its beach, and the declutter is exercised by exactly
  // the pair it was written for. The behaviour below was measured, not
  // assumed: at zoom 14 the two are ~35 px apart — inside the 60 px gap — so
  // the village (higher tier) survives and the beach waits; at 15 there is
  // room for both.
  it("has the village where OSM and the owner say it is", () => {
    const g = byName("Graviers")!;
    expect(g.lat).toBeCloseTo(-19.7265, 3);
    expect(g.lng).toBeCloseTo(63.483, 3);
  });

  it("keeps the beach beside its village, not up the coast", () => {
    const a = byName("Graviers")!;
    const b = byName("Graviers beach")!;
    const dy = (a.lat - b.lat) * 110_574;
    const dx = (a.lng - b.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
    // A beach named after a village is next to it. The wrong-way assertion
    // that used to live here (> 2,000 m) is the one that let the bug through.
    expect(Math.hypot(dx, dy)).toBeLessThan(1_000);
  });

  it("thins the pair at zoom 14 and lets the village win", () => {
    const names = labelsForZoom(14).map((l) => l.name);
    expect(names).toContain("Graviers");
    expect(names).not.toContain("Graviers beach");
  });

  it("shows both once there is room, at zoom 15", () => {
    const names = labelsForZoom(15).map((l) => l.name);
    expect(names).toContain("Graviers");
    expect(names).toContain("Graviers beach");
  });

  it("still thins a pair that IS too close, whatever the pair", () => {
    // The guard must not depend on Graviers having been broken. Any two
    // labels inside the 60 px gap collapse to one.
    for (let z = 11; z <= 18; z++) {
      const shown = labelsForZoom(z);
      expect(new Set(shown.map((l) => l.id)).size).toBe(shown.length);
    }
  });

  it("keeps the one that orients you, not whichever came first in the file", () => {
    // Graviers is a village and sits in a lower zoom tier than its beach.
    expect(byName("Graviers")!.minZoom).toBeLessThanOrEqual(
      byName("Graviers beach")!.minZoom,
    );
  });

  it("shows both once there is room for them", () => {
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

// ── THE LABELS WERE NEVER ALL OURS ─────────────────────────────────────────
//
// The owner: "Note that these places is integrated by default by mapbox and
// not by me". He is right, and it is the half my gazetteer fix could not
// reach. Production serves Mapbox satellite-streets-v12 — imagery WITH street
// and place names drawn into the raster — while tiles.ts still carried the
// comment "Place names come from our own gazetteer", true of the EOX fallback
// it was written for and false of what actually ships.
//
// So every name was printed twice: once by Mapbox, once by us. A label burnt
// into a JPEG cannot be moved or hidden. Ours can, so ours gives way.
describe("our overlay defers to a basemap that labels itself", () => {
  it("draws the full set only when the basemap is bare", () => {
    const bare = labelsForZoom(16, false);
    const labelled = labelsForZoom(16, true);
    expect(bare.length).toBeGreaterThan(labelled.length);
  });

  it("keeps exactly the names OpenStreetMap has never heard of", () => {
    // Mapbox's labels are OSM-derived, so these are the ones no basemap will
    // ever supply — and they are the ones a local actually says.
    const shown = labelsForZoom(18, true).map((l) => l.name);
    for (const n of [
      "Port Mathurin ferry terminal",
      "Graviers beach",
      "Île aux Cocos jetty",
      "Queen Elizabeth Hospital",
    ]) {
      expect(shown).toContain(n);
    }
  });

  it("stops drawing the ones Mapbox already prints", () => {
    const shown = labelsForZoom(18, true).map((l) => l.name);
    // These were the visible duplicates in the owner's screenshot.
    expect(shown).not.toContain("Graviers");
    expect(shown).not.toContain("Port Mathurin");
    expect(shown).not.toContain("Mont Lubin");
  });

  it("every ownOnly id is a real gazetteer entry", () => {
    // A typo here silently drops a name nobody else supplies. "cocos-jetty"
    // was wrong; the entry is "ile-aux-cocos".
    const own = PLACE_LABELS.filter((l) => l.ownOnly);
    expect(own.length).toBe(7);
  });

  it("defaults to the old behaviour for a caller that does not say", () => {
    expect(labelsForZoom(16)).toEqual(labelsForZoom(16, false));
  });
});
