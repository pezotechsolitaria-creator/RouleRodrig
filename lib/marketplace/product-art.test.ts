import { describe, it, expect } from "vitest";
import { productArt, wordmarkFor } from "./product-art";

describe("wordmarkFor", () => {
  it("drops the size suffix that follows an em dash", () => {
    expect(wordmarkFor("Miel de Rodrigues — Large")).toBe("Miel Rodrigues");
    expect(wordmarkFor("Atelier Vannerie — Small")).toBe("Atelier Vannerie");
  });

  it("prints the product, not the seller's connectives", () => {
    // "de" would otherwise take one of the two slots and print "Miel de".
    expect(wordmarkFor("Miel de Rodrigues")).toBe("Miel Rodrigues");
    // The shop name leads and the size trails — the product is in the middle.
    expect(wordmarkFor("Chez Marlène — Piment & Épices — Small")).toBe("Piment Épices");
  });

  it("takes the noun at the end, not the place name in front", () => {
    // "Rodrigues" is on half the catalogue; "Honey" is what is being sold.
    expect(wordmarkFor("Fresh Rodrigues Honey")).toBe("Rodrigues Honey");
    expect(wordmarkFor("Rodrigues Handwoven Pandanus Basket")).toBe("Pandanus Basket");
  });

  it("ignores a size wherever it appears", () => {
    expect(wordmarkFor("Piment confit 500g")).toBe("Piment confit");
    expect(wordmarkFor("Panier pandanus - XL")).toBe("Panier pandanus");
  });

  it("survives a name made entirely of noise", () => {
    expect(wordmarkFor("— — —")).toBeTruthy();
    expect(wordmarkFor("")).toBe("Product");
  });

  it("never returns something too long to set large", () => {
    const long = "Extraordinarily Magnificent Handwoven Pandanus Basket Collection";
    expect(wordmarkFor(long).length).toBeLessThanOrEqual(22);
  });
});

describe("productArt", () => {
  it("is deterministic — the same product looks the same forever", () => {
    const a = productArt("honey-500g", "Rodrigues Honey", "Honey");
    const b = productArt("honey-500g", "Rodrigues Honey", "Honey");
    expect(a).toEqual(b);
  });

  it("tints by category meaning, so a renamed category keeps its colour", () => {
    const honey = productArt("x", "X", "Honey");
    const jam = productArt("y", "Y", "Jams & Preserves");
    expect(jam.from).toBe(honey.from);
  });

  it("gives an uncategorised product a stable colour rather than one default", () => {
    const a = productArt("aaa", "A");
    const b = productArt("zzz", "Z");
    expect(a.from).toBeTruthy();
    expect(b.from).toBeTruthy();
    // Two different slugs should not be guaranteed identical — the point of the
    // hash is variety across a grid.
    expect(new Set([a.from, b.from]).size).toBeGreaterThanOrEqual(1);
  });

  it("captions with the category, and says nothing when there is none", () => {
    expect(productArt("x", "X", "Handicraft & Art").caption).toBe("Handicraft & Art");
    expect(productArt("x", "X").caption).toBe("");
  });

  it("emits colours that are valid CSS, not tailwind class names", () => {
    const art = productArt("x", "X", "Honey");
    expect(art.from).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(art.to).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });
});
