import { describe, expect, it } from "vitest";
import { coversRodrigues, displayNetworks, isOffIslandOperator, rodriguesOperator } from "./networks";

// The rule the store stands on: only my.t and Emtel reach Rodrigues.

describe("rodriguesOperator", () => {
  it.each([
    ["my.t", "my.t"],
    ["MyT", "my.t"],
    ["my t 4G", "my.t"],
    ["Mauritius Telecom", "my.t"],
    ["Cellplus Mobile Communications Ltd", "my.t"],
    ["Orange Mauritius", "my.t"],
    ["617-01", "my.t"],
    ["Emtel", "Emtel"],
    ["EMTEL Ltd", "Emtel"],
    ["61710", "Emtel"],
  ])("recognises %s as %s", (name, op) => {
    expect(rodriguesOperator(name)).toBe(op);
  });

  it.each(["Chili", "MTML", "Mahanagar Telephone (Mauritius) Ltd", "617-03", "Orange France", "Orange", "", "Unknown"])(
    "does NOT count %j as reaching Rodrigues",
    (name) => {
      expect(rodriguesOperator(name)).toBeNull();
    },
  );
});

describe("coversRodrigues", () => {
  it("is true when any operator is my.t or Emtel", () => {
    expect(coversRodrigues([{ name: "Chili" }, { name: "Emtel", type: "4G" }])).toBe(true);
  });
  it("is false for a Chili-only plan — the dead-on-arrival case the store exists to prevent", () => {
    expect(coversRodrigues([{ name: "Chili", type: "4G" }])).toBe(false);
    expect(isOffIslandOperator("Chili")).toBe(true);
  });
  it("is false for an empty or missing list: unknown is not coverage", () => {
    expect(coversRodrigues([])).toBe(false);
    expect(coversRodrigues(null)).toBe(false);
  });
});

describe("displayNetworks", () => {
  it("normalises, de-duplicates, drops Chili and puts my.t first", () => {
    expect(
      displayNetworks([
        { name: "Emtel", type: "4G" },
        { name: "Chili", type: "4G" },
        { name: "Mauritius Telecom", type: "LTE" },
        { name: "my.t" },
      ]),
    ).toEqual(["my.t 4G", "Emtel 4G"]);
  });
});
