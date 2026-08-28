import { describe, it, expect } from "vitest";
import { dishArt } from "./dish-art";

// Two properties matter here and nothing else does. The colours are taste; the
// determinism is correctness, and the matching is the difference between a
// designed placeholder and a random emoji next to somebody's dinner.

describe("dishArt", () => {
  it("is stable for the same dish, forever", () => {
    // This renders on the SERVER and again on the client. Anything
    // non-deterministic here is a hydration mismatch, and — because the grid
    // re-renders on every navigation — a menu that changes colour as you
    // browse it. Math.random() was the obvious way to write this and is wrong.
    const a = dishArt("ourite-rougaille", "Ourite Rougaille");
    const b = dishArt("ourite-rougaille", "Ourite Rougaille");
    expect(a).toEqual(b);
  });

  it("gives different dishes different colours", () => {
    // The whole point is a grid that reads as varied. One flat default for
    // everything is the empty box this replaced, just in a nicer colour.
    const seeds = ["a-dish", "b-dish", "c-dish", "d-dish", "e-dish", "f-dish"];
    const tiles = seeds.map((s) => dishArt(s, s).from);
    expect(new Set(tiles).size).toBeGreaterThan(1);
  });

  it("reads the island's own words for a dish", () => {
    // "Ourite" is octopus in Rodrigues, and it is what the dish is actually
    // called — matching only on the English would put a generic plate on the
    // signature dish of the menu.
    expect(dishArt("x", "Ourite Rougaille").glyph).toBe("🐙");
    expect(dishArt("x", "Mine Frite Légumes").glyph).toBe("🍜");
    expect(dishArt("x", "Coconut Napolitaine").glyph).toBe("🍰");
    expect(dishArt("x", "Boulettes (8 pieces)").glyph).toBe("🥟");
  });

  it("prefers the specific ingredient over the cooking method", () => {
    // "Grilled Fish of the Day" contains both `grill` and `fish`. A customer
    // scanning a grid is looking for the fish, not the grill.
    expect(dishArt("x", "Grilled Fish of the Day").glyph).toBe("🐟");
  });

  it("uses the description when the name alone says nothing", () => {
    // Real menus are full of names like this, and the descriptor is the only
    // place the dish is identifiable.
    expect(dishArt("x", "Catch of the day Fresh fish, grilled").glyph).toBe("🐟");
  });

  it("still returns something usable for a dish it cannot place", () => {
    const art = dishArt("mystery-dish", "Zourit Special");
    expect(art.glyph).toBeTruthy();
    expect(art.from).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(art.to).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });
});
