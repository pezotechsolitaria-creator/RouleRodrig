import { describe, expect, it } from "vitest";
import { findVehicleUnits, unitToBook } from "@/lib/vehicle-slug";

// Twin units (architecture review 2026-09-30): the fleet models physical units,
// and the owner's two AVENIS 125cc rows share one name, so one page. The live
// ids, because the whole point is that neither is renamed or merged.
const fleet = [
  { id: "burgman", name: "BURGMAN 125cc", category: "scooter" },
  { id: "avenis", name: "AVENIS 125cc", category: "scooter" },
  { id: "scooter-1780519312391", name: "AVENIS 125cc", category: "scooter" },
  { id: "veh-1", name: "AVENIS 125cc", category: "car" },
];

describe("findVehicleUnits", () => {
  it("returns both AVENIS rows for the page they share", () => {
    expect(findVehicleUnits(fleet, "scooter", "avenis-125cc").map((f) => f.id)).toEqual([
      "avenis",
      "scooter-1780519312391",
    ]);
  });

  it("returns the same pair when the link is either twin's old id", () => {
    for (const id of ["avenis", "scooter-1780519312391"]) {
      expect(findVehicleUnits(fleet, "scooter", id).map((f) => f.id)).toEqual([
        "avenis",
        "scooter-1780519312391",
      ]);
    }
  });

  it("never pulls in a same-name row from another category", () => {
    expect(findVehicleUnits(fleet, "car", "avenis-125cc").map((f) => f.id)).toEqual(["veh-1"]);
  });

  it("returns one row for a model with no twin, and none for an unknown slug", () => {
    expect(findVehicleUnits(fleet, "scooter", "burgman-125cc").map((f) => f.id)).toEqual([
      "burgman",
    ]);
    expect(findVehicleUnits(fleet, "scooter", "harley")).toEqual([]);
  });
});

describe("unitToBook", () => {
  const u = (id: string, o: { available?: boolean; soldOutToday?: boolean } = {}) => ({ id, ...o });

  it("picks a unit that is free today over the first row", () => {
    expect(unitToBook([u("a", { soldOutToday: true }), u("b")])?.id).toBe("b");
  });

  it("picks a unit still for hire over a withdrawn one", () => {
    expect(unitToBook([u("a", { available: false }), u("b", { soldOutToday: true })])?.id).toBe("b");
  });

  it("keeps the first row when every unit is busy, or every unit withdrawn", () => {
    const busy = unitToBook([u("a", { soldOutToday: true }), u("b", { soldOutToday: true })]);
    expect(busy).toEqual({ id: "a", soldOutToday: true });
    const gone = unitToBook([u("a", { available: false }), u("b", { available: false })]);
    expect(gone).toEqual({ id: "a", available: false });
  });

  it("returns undefined for no units", () => {
    expect(unitToBook([])).toBeUndefined();
  });
});
