import { describe, expect, it } from "vitest";
import { capacityOf, unitsFor } from "./listing";

// Real listings, 4 Oct 2026: the same `capacity` field means seats on one
// listing and trips on another (see capacityOf).
describe("what a listing's capacity counts", () => {
  it("Île aux Cocos: 36 seats, a party takes one per person", () => {
    const r = capacityOf({ capacity: 36, maxGuests: undefined });
    expect(r).toEqual({ mode: "seats", capacity: 36, maxParty: 36 });
    expect(unitsFor(r, 4)).toBe(4);
  });

  it("Sunrise hike: one trip a day for up to 8 — a party of 4 takes the trip", () => {
    const r = capacityOf({ capacity: 1, maxGuests: 8 });
    expect(r).toEqual({ mode: "trips", capacity: 1, maxParty: 8 });
    expect(unitsFor(r, 4)).toBe(1);
  });

  it("Balade en mer (8 and 8): read as 8 seats, the cautious reading", () => {
    expect(capacityOf({ capacity: 8, maxGuests: 8 })).toEqual({ mode: "seats", capacity: 8, maxParty: 8 });
  });

  it("a massage for one, six a day: seats, parties of one", () => {
    expect(capacityOf({ capacity: 6, maxGuests: 1 })).toEqual({ mode: "seats", capacity: 6, maxParty: 1 });
  });

  it("no capacity set means one", () => {
    expect(capacityOf({}).capacity).toBe(1);
  });
});
