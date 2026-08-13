import { describe, expect, it } from "vitest";
import { typeChips, shouldShowTypeFilter, applyTypeFilter } from "./vehicle-filter";
import type { VehicleType } from "./defaults";

const TYPES: VehicleType[] = [
  { id: "suv", label: "SUV", enabled: true },
  { id: "sedan", label: "Sedan", enabled: true },
  { id: "van", label: "Van", enabled: true },
  { id: "pickup", label: "Pick-up", enabled: false },
];

const CARS = [
  { id: "a", type: "suv" },
  { id: "b", type: "suv" },
  { id: "c", type: "sedan" },
  { id: "d" }, // never tagged
  { id: "e", type: "pickup" }, // tagged, but the filter is switched off
];

describe("typeChips", () => {
  it("counts the vehicles carrying each style", () => {
    expect(typeChips(CARS, TYPES)).toEqual([
      { id: "suv", label: "SUV", count: 2 },
      { id: "sedan", label: "Sedan", count: 1 },
    ]);
  });

  // The invariant this module exists for. The owner enables styles before he
  // tags the cars, so "Van" is enabled here with nothing to show — offering it
  // would give the customer a chip that empties the page.
  it("never offers a chip that would return nothing", () => {
    for (const chip of typeChips(CARS, TYPES)) {
      expect(applyTypeFilter(CARS, typeChips(CARS, TYPES), chip.id).length).toBe(chip.count);
      expect(chip.count).toBeGreaterThan(0);
    }
  });

  it("drops a style the owner switched off, even when vehicles carry it", () => {
    expect(typeChips(CARS, TYPES).map((c) => c.id)).not.toContain("pickup");
  });

  it("keeps the owner's own order rather than sorting by popularity", () => {
    const busiestLast: VehicleType[] = [
      { id: "sedan", label: "Sedan", enabled: true },
      { id: "suv", label: "SUV", enabled: true },
    ];
    expect(typeChips(CARS, busiestLast).map((c) => c.id)).toEqual(["sedan", "suv"]);
  });

  it("returns nothing when the category has no styles at all", () => {
    expect(typeChips(CARS, undefined)).toEqual([]);
    expect(typeChips(CARS, [])).toEqual([]);
  });

  it("ignores whitespace-only tags rather than counting them as a style", () => {
    expect(typeChips([{ type: "  " }, { type: "suv" }], TYPES)).toEqual([
      { id: "suv", label: "SUV", count: 1 },
    ]);
  });
});

describe("shouldShowTypeFilter", () => {
  it("stays hidden for one style — a lone chip beside All filters nothing", () => {
    expect(shouldShowTypeFilter(typeChips([{ type: "suv" }], TYPES))).toBe(false);
    expect(shouldShowTypeFilter([])).toBe(false);
  });

  it("appears once there is a real choice", () => {
    expect(shouldShowTypeFilter(typeChips(CARS, TYPES))).toBe(true);
  });
});

describe("applyTypeFilter", () => {
  const chips = typeChips(CARS, TYPES);

  it("narrows to the chosen style", () => {
    expect(applyTypeFilter(CARS, chips, "suv").map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("shows everything under All, including untagged vehicles", () => {
    expect(applyTypeFilter(CARS, chips, "all")).toHaveLength(CARS.length);
  });

  // A style deleted in /admin while a customer had that chip selected, or a
  // page restored from the back-forward cache holding a stale selection.
  it("falls back to everything for a style that no longer exists", () => {
    expect(applyTypeFilter(CARS, chips, "hovercraft")).toHaveLength(CARS.length);
    expect(applyTypeFilter(CARS, chips, "pickup")).toHaveLength(CARS.length);
  });
});
