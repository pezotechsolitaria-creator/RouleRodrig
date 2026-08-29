import { describe, expect, it } from "vitest";
import { realProse } from "./place-prose";

// Locks the guide pages' defence against the admin placeholder. Every case in
// "stubs" below was live data on 2026-08-29 — these are not hypotheticals.
describe("realProse", () => {
  it("rejects the placeholder in every observed form", () => {
    const stubs = [
      "Add a description.",
      "Add a description. 19.74152° S, 63.46855° E",
      "Add a description.-19,7634660, 63,3799462",
      "Add ",
      "Add a ",
      "add a description for this beach.",
      "",
      " ",
      null,
      undefined,
    ];
    for (const s of stubs) expect(realProse(s)).toBe("");
  });

  it("keeps real prose, trimmed, including prose that mentions adding", () => {
    expect(realProse("  A quiet beach in Gravier.  ")).toBe(
      "A quiet beach in Gravier.",
    );
    // "Add" appearing INSIDE a sentence is not the placeholder.
    expect(realProse("Locals add salt to the octopus here.")).toBe(
      "Locals add salt to the octopus here.",
    );
    // A sentence merely starting with "Additional..." is not the placeholder.
    expect(realProse("Additional parking sits behind the dunes.")).toBe(
      "Additional parking sits behind the dunes.",
    );
  });
});
