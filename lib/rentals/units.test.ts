import { describe, expect, it } from "vitest";
import { displayUnits, scooterModelLabel, unitCount } from "./units";

// ── One card per physical scooter (owner brief, 6 Oct 2026) ─────────────────
//
// The live fleet as the owner typed it: "BURGMAN 125cc" (one bike), two
// "AVENIS 125cc" rows, and "Suzuki Burgman 125cc" — the same model spelled
// with its brand, holding two bikes. The cards must read as five bikes of two
// models, numbered within the model, while every card still books its row.

const live = [
  { id: "burgman", name: "BURGMAN 125cc", category: "scooter" },
  { id: "avenis", name: "AVENIS 125cc", category: "scooter" },
  { id: "avenis-2", name: "AVENIS 125cc", category: "scooter" },
  { id: "suzuki-burgman", name: "Suzuki Burgman 125cc", category: "scooter", units: 2 },
  { id: "swift", name: "Suzuki Swift (Latest Gen) ", category: "car", units: 2 },
];

describe("scooterModelLabel", () => {
  it("drops the brand and the cc, and reads ALL CAPS as a name", () => {
    expect(scooterModelLabel("BURGMAN 125cc")).toBe("Burgman 125");
    expect(scooterModelLabel("Suzuki Burgman 125cc")).toBe("Burgman 125");
    expect(scooterModelLabel("AVENIS 125cc")).toBe("Avenis 125");
  });
});

describe("unitCount", () => {
  it("counts active assets when the row lists them, else its units", () => {
    expect(unitCount({ id: "a", name: "x", units: 3 })).toBe(3);
    expect(unitCount({ id: "a", name: "x" })).toBe(1);
    expect(unitCount({ id: "a", name: "x", units: 3, assets: [{ active: true }, { active: false }] })).toBe(1);
  });
});

describe("displayUnits", () => {
  const units = displayUnits(live);

  it("gives every physical scooter its own card, numbered within its model", () => {
    expect(units.map((u) => u.label)).toEqual([
      "Burgman 125 · 01",
      "Avenis 125 · 01",
      "Avenis 125 · 02",
      "Burgman 125 · 02",
      "Burgman 125 · 03",
      "Suzuki Swift (Latest Gen)",
    ]);
  });

  it("keeps a car one card per row, whatever its units", () => {
    expect(units.filter((u) => u.item.category === "car")).toHaveLength(1);
  });

  it("books the row: a pooled row's cards share its id, with unique keys", () => {
    const pooled = units.filter((u) => u.item.id === "suzuki-burgman");
    expect(pooled.map((u) => u.key)).toEqual(["suzuki-burgman#1", "suzuki-burgman#2"]);
    expect(new Set(units.map((u) => u.key)).size).toBe(units.length);
  });

  it("leaves a model of one bike with its plain name", () => {
    expect(displayUnits([{ id: "a", name: "AVENIS 125cc", category: "scooter" }]).map((u) => u.label)).toEqual([
      "Avenis 125",
    ]);
  });
});
