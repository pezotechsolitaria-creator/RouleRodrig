import { describe, it, expect } from "vitest";
import {
  CARGO_KINDS,
  CARGO_LABEL,
  DEFAULT_LARGE_ITEM_VEHICLES,
  VEHICLE_TYPES,
  vehicleCanCarry,
  vehicleEligibilityNote,
  vehiclesFor,
} from "./vehicle";

// These assertions deliberately mirror the ones run against the real database
// (vehicle_can_handle, called for every case below). If this file and that
// function ever disagree, a screen is explaining a rule that dispatch does not
// follow — which is worse than not explaining it at all.

describe("size: does it fit", () => {
  it("keeps a large item off two wheels and off foot", () => {
    expect(vehicleCanCarry("scooter", "large")).toBe(false);
    expect(vehicleCanCarry("bicycle", "large")).toBe(false);
    expect(vehicleCanCarry("foot", "large")).toBe(false);
  });

  it("sends a large item to anything built to take one", () => {
    for (const v of ["car", "van", "pickup", "lorry"]) {
      expect(vehicleCanCarry(v, "large"), v).toBe(true);
    }
  });

  it("offers a plain job to every vehicle — the compatibility promise", () => {
    for (const v of VEHICLE_TYPES) expect(vehicleCanCarry(v, "standard"), v).toBe(true);
  });

  it("treats an unknown requirement as carryable, never as stranded", () => {
    expect(vehicleCanCarry("scooter", null)).toBe(true);
    expect(vehicleCanCarry("scooter", undefined)).toBe(true);
    expect(vehicleCanCarry("scooter", "")).toBe(true);
  });

  it("refuses an UNKNOWN vehicle a large job", () => {
    // The cautious direction, unchanged from M103: a vehicle nobody has
    // described is not assumed to be a van.
    expect(vehicleCanCarry(null, "large")).toBe(false);
    expect(vehicleCanCarry("", "large")).toBe(false);
    expect(vehicleCanCarry("hovercraft", "large")).toBe(false);
  });
});

// ── The rule the owner actually asked for ──────────────────────────────────
describe("suitability: is it the right tool", () => {
  it("A LORRY CANNOT DELIVER FOOD", () => {
    // The whole reason this dimension exists. Not because it does not fit —
    // because a hot meal in a flatbed arrives cold and covered in dust, and a
    // lorry cannot reach half the tracks on this island.
    expect(vehicleCanCarry("lorry", "standard", "food")).toBe(false);
    expect(vehicleCanCarry("pickup", "standard", "food")).toBe(false);
  });

  it("lets a scooter deliver a takeaway", () => {
    // The most common food-delivery vehicle on earth. "Enclosed" means the LOAD
    // is contained -- a top box, a delivery bag -- not that the vehicle has a
    // roof. Getting that wrong excluded scooters, bicycles and foot from every
    // food job on the island.
    expect(vehicleCanCarry("scooter", "standard", "food")).toBe(true);
    expect(vehicleCanCarry("bicycle", "standard", "food")).toBe(true);
    expect(vehicleCanCarry("foot", "standard", "food")).toBe(true);
  });

  it("sends food to anything quick AND protected", () => {
    // A van is enclosed and reaches everywhere a car does, so it carries food.
    // Excluding it narrowed hot food to cars alone for no physical reason.
    expect(vehicleCanCarry("car", "standard", "food")).toBe(true);
    expect(vehicleCanCarry("van", "standard", "food")).toBe(true);
    // A pickup is nimble enough but open: the load is not protected.
    expect(vehicleCanCarry("pickup", "standard", "food")).toBe(false);
  });

  it("keeps anything that must stay dry out of an open bed", () => {
    expect(vehicleCanCarry("pickup", "standard", "fragile")).toBe(false);
    expect(vehicleCanCarry("lorry", "standard", "fragile")).toBe(false);
    expect(vehicleCanCarry("car", "standard", "fragile")).toBe(true);
    expect(vehicleCanCarry("van", "standard", "fragile")).toBe(true);
  });

  it("keeps a gas bottle off a bicycle", () => {
    for (const v of ["foot", "bicycle", "scooter"]) {
      expect(vehicleCanCarry(v, "standard", "heavy"), v).toBe(false);
    }
    for (const v of ["van", "pickup", "lorry"]) {
      expect(vehicleCanCarry(v, "standard", "heavy"), v).toBe(true);
    }
  });

  it("does not let a car pretend to be a builder's truck", () => {
    // A car is enclosed and nimble but is not the thing you put cement in.
    expect(vehicleCanCarry("car", "standard", "heavy")).toBe(false);
  });

  it("treats an unknown cargo kind as carryable", () => {
    // Permissive here, unlike size: a job nobody can be offered just sits
    // there, while a job offered too widely has a driver who can decline.
    for (const v of VEHICLE_TYPES) {
      expect(vehicleCanCarry(v, "standard", "spaceship"), v).toBe(true);
      expect(vehicleCanCarry(v, "standard", null), v).toBe(true);
    }
  });

  it("applies BOTH gates, not whichever is convenient", () => {
    expect(vehicleCanCarry("van", "large", "heavy")).toBe(true);
    expect(vehicleCanCarry("car", "large", "heavy")).toBe(false);
    expect(vehicleCanCarry("scooter", "large", "heavy")).toBe(false);
  });
});

describe("who can take this job", () => {
  it("never returns an empty fleet for any real combination", () => {
    // The failure this guards: a customer posts something and NOBODY on the
    // island is eligible, so it sits until it expires with no explanation.
    for (const size of ["standard", "large"]) {
      for (const kind of CARGO_KINDS) {
        expect(vehiclesFor(size, kind).length, `${size}/${kind}`).toBeGreaterThan(0);
      }
    }
  });

  it("narrows as the job gets more demanding", () => {
    expect(vehiclesFor("standard", "general").length).toBe(VEHICLE_TYPES.length);
    expect(vehiclesFor("large", "heavy").length).toBeLessThan(
      vehiclesFor("standard", "general").length,
    );
  });
});

describe("what a driver is told", () => {
  it("tells a car driver what reaches them", () => {
    expect(vehicleEligibilityNote("car")).toMatch(/large items reach you/i);
  });

  it("states a fact about the vehicle, never a demotion", () => {
    // Tone matters: a scooter rider is not being penalised, and a lorry driver
    // is not being told the lorry is bad.
    for (const v of VEHICLE_TYPES) {
      const note = vehicleEligibilityNote(v);
      expect(note, v).toBeTruthy();
      expect(note.toLowerCase(), v).not.toMatch(/cannot|not allowed|denied|sorry|unfortunately/);
    }
  });

  it("names what a lorry driver will not be sent", () => {
    expect(vehicleEligibilityNote("lorry").toLowerCase()).toContain(
      CARGO_LABEL.food.toLowerCase(),
    );
  });
});

describe("the shape the rest of the code relies on", () => {
  it("labels every cargo kind", () => {
    for (const k of CARGO_KINDS) expect(CARGO_LABEL[k], k).toBeTruthy();
  });

  it("keeps the large-item list in step with the capability table", () => {
    expect([...DEFAULT_LARGE_ITEM_VEHICLES].sort()).toEqual(
      VEHICLE_TYPES.filter((v) => vehicleCanCarry(v, "large"))
        .slice()
        .sort(),
    );
  });
});
