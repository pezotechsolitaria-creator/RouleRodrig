import { describe, it, expect } from "vitest";
import {
  DEFAULT_LARGE_ITEM_VEHICLES, VEHICLE_TYPES, vehicleCanCarry, vehicleEligibilityNote,
} from "./vehicle";

// These assertions deliberately mirror the ones run against the real database
// after M103 was applied (vehicle_can_carry, called for every case below). If
// this file and that function ever disagree, a screen is explaining a rule that
// dispatch does not follow — which is worse than not explaining it at all.
describe("vehicleCanCarry — mirrors the SQL authority", () => {
  it("keeps a large item off two wheels and off foot", () => {
    expect(vehicleCanCarry("scooter", "large")).toBe(false);
    expect(vehicleCanCarry("bicycle", "large")).toBe(false);
    expect(vehicleCanCarry("foot", "large")).toBe(false);
  });

  it("sends a large item to a car or a van", () => {
    expect(vehicleCanCarry("car", "large")).toBe(true);
    expect(vehicleCanCarry("van", "large")).toBe(true);
  });

  it("offers a standard job to every vehicle — the compatibility promise", () => {
    // The whole fleet must keep behaving exactly as it did before M103 for
    // every delivery that does not declare itself large.
    for (const v of VEHICLE_TYPES) expect(vehicleCanCarry(v, "standard")).toBe(true);
  });

  it("treats an unknown requirement as carryable, never as stranded", () => {
    // Matches the SQL's coalesce. An unset size must not produce a delivery
    // that nobody in the fleet is eligible for.
    expect(vehicleCanCarry("scooter", null)).toBe(true);
    expect(vehicleCanCarry("scooter", undefined)).toBe(true);
    expect(vehicleCanCarry("scooter", "")).toBe(true);
  });

  it("refuses an unknown vehicle a large job", () => {
    // The cautious direction: a vehicle nobody has described is not assumed to
    // be a van.
    expect(vehicleCanCarry(null, "large")).toBe(false);
    expect(vehicleCanCarry("", "large")).toBe(false);
    expect(vehicleCanCarry("hovercraft", "large")).toBe(false);
  });

  it("follows the owner's list when it is widened", () => {
    // delivery_settings.large_item_vehicles exists so the fleet can change
    // shape without a migration; this must follow it rather than the default.
    expect(vehicleCanCarry("scooter", "large", ["scooter", "car", "van"])).toBe(true);
    expect(vehicleCanCarry("car", "large", ["van"])).toBe(false);
  });

  it("mirrors the column default", () => {
    expect([...DEFAULT_LARGE_ITEM_VEHICLES].sort()).toEqual(["car", "van"]);
  });
});

describe("vehicleEligibilityNote", () => {
  it("tells a car driver they get everything", () => {
    expect(vehicleEligibilityNote("car")).toContain("every delivery");
  });

  it("tells a scooter rider what they get, not what they lack", () => {
    const note = vehicleEligibilityNote("scooter");
    expect(note).toContain("standard deliveries");
    // Tone matters: this is a fact about a vehicle, not a demotion.
    expect(note.toLowerCase()).not.toMatch(/cannot|not allowed|denied|sorry/);
  });
});
