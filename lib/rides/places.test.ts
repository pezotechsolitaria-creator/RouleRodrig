import { describe, it, expect } from "vitest";
import { RIDE_PLACES, searchPlaces, placeById } from "./places";

// The place list is what makes a fare computable: a free-text address gives no
// coordinates, and no coordinates means no distance, no price and no ranking. So
// these tests are about the two ways the picker fails a customer — not finding
// somewhere they typed, and putting the wrong place first.

describe("the list itself", () => {
  it("gives every place real coordinates, because a fare depends on them", () => {
    for (const p of RIDE_PLACES) {
      expect(p.lat, p.name).not.toBeNull();
      expect(p.lng, p.name).not.toBeNull();
      // Rodrigues sits in a box roughly this size. A transposed pair or a stray
      // minus sign would put a "place" in the Atlantic and quote a Rs 40,000 fare.
      expect(p.lat!, `${p.name} latitude`).toBeGreaterThan(-19.80);
      expect(p.lat!, `${p.name} latitude`).toBeLessThan(-19.63);
      expect(p.lng!, `${p.name} longitude`).toBeGreaterThan(63.33);
      expect(p.lng!, `${p.name} longitude`).toBeLessThan(63.52);
    }
  });

  it("has no duplicate ids", () => {
    const ids = RIDE_PLACES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("includes the two places every transfer needs", () => {
    // An airport run and a ferry run are the two journeys that pay for this
    // feature. If either is missing, the flat fares point at nothing.
    expect(placeById("airport")?.name).toContain("Airport");
    expect(placeById("ferry")?.name).toContain("ferry");
  });
});

describe("searchPlaces", () => {
  it("shows the whole list before anything is typed", () => {
    // A blank screen with a search box teaches nobody what their options are, and
    // on a first visit the list IS the interface.
    expect(searchPlaces("").length).toBeGreaterThan(20);
  });

  it("puts the obvious answer first", () => {
    // Somebody typing "port" means Port Mathurin, not Pointe Coton — a name that
    // STARTS with the query beats one that merely contains it.
    expect(searchPlaces("port")[0].name).toBe("Port Mathurin");
    expect(searchPlaces("pointe")[0].name).toBe("Pointe Coton");
  });

  it("finds a place without its accents, because phone keyboards do not have them", () => {
    expect(searchPlaces("riviere").some((p) => p.name.includes("Rivière"))).toBe(true);
    expect(searchPlaces("brulee").some((p) => p.name.includes("Brûlée"))).toBe(true);
    expect(searchPlaces("francois").some((p) => p.name.includes("François"))).toBe(true);
  });

  it("answers the words a tourist actually types", () => {
    // Nobody types "Plaine Corail Airport". They type "airport", or "aeroport",
    // or the flight code.
    for (const q of ["airport", "aeroport", "szr"]) {
      expect(searchPlaces(q)[0].id, q).toBe("airport");
    }
    for (const q of ["ferry", "boat", "bateau"]) {
      expect(searchPlaces(q)[0].id, q).toBe("ferry");
    }
    expect(searchPlaces("tortoise")[0].id).toBe("francois-leguat");
    expect(searchPlaces("hospital")[0].id).toBe("hospital");
  });

  it("matches an area when the place name does not", () => {
    // "east coast" should surface the east-coast beaches even though none of them
    // is called that.
    expect(searchPlaces("east coast").length).toBeGreaterThan(0);
  });

  it("returns nothing rather than everything for a real miss", () => {
    // The picker offers "use what I typed" in that case, which prices on request.
    // Returning the full list would look like a match and pick the wrong place.
    expect(searchPlaces("zzzznowhere")).toEqual([]);
  });

  it("is case and whitespace insensitive", () => {
    expect(searchPlaces("  MONT LUBIN ")[0].id).toBe("mont-lubin");
  });

  it("respects the limit, so a slow phone never renders forty rows it cannot use", () => {
    expect(searchPlaces("", 5)).toHaveLength(5);
  });
});
