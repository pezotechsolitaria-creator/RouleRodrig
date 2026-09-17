import { describe, it, expect } from "vitest";
import { RIDE_PLACES } from "./places";

// ── A BEACH IN A FOREST ─────────────────────────────────────────────────────
//
// On 17 Sept 2026 the owner panned the tracking map to the south-east coast
// and found the "Graviers beach" label on a wooded hillside with no sand in
// sight. It was 2.6 km north of Graviers village and 1.3 km inland — a pin
// that priced and dispatched real bookings to a place nobody could reach.
//
// Nothing caught it because nothing checked it. The gazetteer is hand-typed,
// its header promises "approximate to a few hundred metres", and no test held
// it to that. These do. They cannot know where every coastline is, but they
// can know something simpler and just as useful: a beach named after a village
// belongs next to that village.

/** Great-circle distance in km. The same formula the pricing uses. */
function km(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const p = Math.PI / 180;
  const x =
    Math.sin(((bLat - aLat) * p) / 2) ** 2 +
    Math.cos(aLat * p) * Math.cos(bLat * p) * Math.sin(((bLng - aLng) * p) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

const byId = new Map(RIDE_PLACES.map((p) => [p.id, p]));
const byName = new Map(RIDE_PLACES.map((p) => [p.name.toLowerCase(), p]));

describe("Graviers beach is on the beach", () => {
  it("sits within 300 m of the OpenStreetMap beach in front of the village", () => {
    // natural=beach way beside "Graviers fisheries", OSM, 17 Sept 2026.
    const p = byId.get("gravier-beach")!;
    expect(km(p.lat!, p.lng!, -19.72817, 63.48544)).toBeLessThan(0.3);
  });

  it("is next to Graviers village, not 2.6 km up the coast", () => {
    const beach = byId.get("gravier-beach")!;
    const village = byId.get("graviers")!;
    expect(km(beach.lat!, beach.lng!, village.lat!, village.lng!)).toBeLessThan(0.6);
  });
});

describe("every beach named after a place is beside that place", () => {
  // "Saint François beach" must be near "Saint François"; "Graviers beach"
  // near "Graviers". This is the rule the broken pin violated, and it is
  // checkable from the file alone — no coastline data needed.
  const pairs = RIDE_PLACES.filter((p) => /\bbeach$/i.test(p.name))
    .map((beach) => {
      const stem = beach.name.replace(/\s+beach$/i, "").toLowerCase();
      return { beach, place: byName.get(stem) ?? null };
    })
    .filter((x): x is { beach: (typeof RIDE_PLACES)[number]; place: (typeof RIDE_PLACES)[number] } =>
      Boolean(x.place),
    );

  it("has at least one such pair to check", () => {
    expect(pairs.length).toBeGreaterThan(0);
  });

  for (const { beach, place } of pairs) {
    it(`${beach.name} is within 1 km of ${place.name}`, () => {
      const d = km(beach.lat!, beach.lng!, place.lat!, place.lng!);
      expect(d, `${beach.name} is ${d.toFixed(2)} km from ${place.name}`).toBeLessThan(1);
    });
  }
});

describe("the gazetteer stays on the island", () => {
  // Rodrigues, generously bounded. A pin outside this is a typo in a
  // coordinate — a dropped minus sign, a swapped lat/lng — and prices from it
  // would be absurd rather than merely wrong.
  it("every coordinate is inside Rodrigues", () => {
    for (const p of RIDE_PLACES) {
      expect(p.lat, p.name).toBeGreaterThan(-19.85);
      expect(p.lat, p.name).toBeLessThan(-19.6);
      expect(p.lng, p.name).toBeGreaterThan(63.3);
      expect(p.lng, p.name).toBeLessThan(63.55);
    }
  });

  it("no two entries share a pin", () => {
    // Two names on one coordinate means one of them was pasted, not placed.
    const seen = new Map<string, string>();
    for (const p of RIDE_PLACES) {
      const key = `${p.lat},${p.lng}`;
      expect(seen.has(key), `${p.name} shares a pin with ${seen.get(key)}`).toBe(false);
      seen.set(key, p.name);
    }
  });
});
