import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  MAX_DESCRIPTION,
  MIN_USEFUL_DESCRIPTION,
  dishMetaDescription,
} from "./meta-description";

// ── Nine dish pages had no usable meta description ──────────────────────────
//
// Measured against the live site, not guessed:
//   /food/grilled-lobster-package  "500g lobster"                    12 chars
//   /food/chicken-curry            "Creole curry · rice · achard"    27
//   /food/ourite-rougaille         "Octopus · tomato · thyme · rice"  30
//
// The cause was the ORDER of the fallback: `descriptor` was tried first, and a
// descriptor is the ingredient strip printed under a name on a menu card —
// three words, by design. A twelve-character description is not a short
// description, it is none: Google discards it and writes its own snippet,
// which on a page that sells something means giving up the one line you control
// in the result.

describe("a real description beats an ingredient strip", () => {
  it("uses the cook's own prose when there is enough of it", () => {
    const prose =
      "Octopus caught in the lagoon that morning, stewed slowly with tomato, thyme and onion until it falls apart, served with rice.";
    expect(
      dishMetaDescription({ name: "Ourite rougaille", descriptor: "Octopus · tomato", description: prose }),
    ).toBe(prose);
  });

  it("does not let a three-word descriptor win over that prose", () => {
    // This is the exact inversion that shipped.
    const out = dishMetaDescription({
      name: "Chicken curry",
      descriptor: "Creole curry · rice · achard",
      description:
        "Chicken simmered in a Creole masala with thyme and curry leaves, served with rice and a spoon of achard on the side.",
    });
    expect(out).not.toBe("Creole curry · rice · achard");
    expect(out.length).toBeGreaterThan(MIN_USEFUL_DESCRIPTION);
  });
});

describe("a short field still produces a usable sentence", () => {
  it("rescues the worst case on the site", () => {
    // "500g lobster" — twelve characters, and the only text this dish had.
    const out = dishMetaDescription({
      name: "Grilled lobster package",
      descriptor: "500g lobster",
      kitchenName: "Ti Kitchen",
    });
    expect(out.length).toBeGreaterThan(MIN_USEFUL_DESCRIPTION);
    expect(out).toContain("500g lobster");
    expect(out).toContain("Ti Kitchen");
    expect(out).toContain("Rodrigues");
  });

  it("keeps the descriptor, because it is the most concrete thing there", () => {
    const out = dishMetaDescription({ name: "Boulettes", descriptor: "Steamed · pork · broth" });
    // The interpuncts become commas: a menu card reads them fine, a sentence
    // in a search result does not.
    expect(out).toContain("Steamed, pork, broth");
    expect(out).not.toContain("·");
  });

  it("works with nothing but a name", () => {
    const out = dishMetaDescription({ name: "Farata rougaille" });
    expect(out).toContain("Farata rougaille");
    expect(out.length).toBeGreaterThan(MIN_USEFUL_DESCRIPTION);
  });
});

describe("ten dishes must not produce ten identical snippets", () => {
  it("varies with the dish, not just the template", () => {
    // Duplicate meta descriptions across a set of pages are worth about as much
    // as none — Google picks one and rewrites the rest.
    const dishes = [
      { name: "Ourite rougaille", descriptor: "Octopus · tomato", kitchenName: "Ti Kitchen" },
      { name: "Chicken curry", descriptor: "Creole curry · rice", kitchenName: "Ti Kitchen" },
      { name: "Boulettes", descriptor: "Steamed · pork", kitchenName: "Chez Marie" },
    ];
    const out = dishes.map(dishMetaDescription);
    expect(new Set(out).size).toBe(dishes.length);
  });
});

describe("it never ships something Google will cut badly", () => {
  it("stays inside the snippet budget", () => {
    const long = "x".repeat(400);
    expect(dishMetaDescription({ name: "Long", description: long }).length).toBeLessThanOrEqual(
      MAX_DESCRIPTION,
    );
  });

  it("cuts on a word, and never leaves a dangling separator", () => {
    const out = dishMetaDescription({
      name: "Test",
      description:
        "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty twentyone, twentytwo",
    });
    expect(out).not.toMatch(/[\s,;·-]$/);
    expect(out).not.toMatch(/\s{2}/);
  });
});

describe("the page actually uses it", () => {
  it("no longer prefers descriptor over description inline", () => {
    // The whole bug was four lines of fallback in the page. If they come back,
    // this file is decoration.
    const page = readFileSync("app/food/[slug]/page.tsx", "utf8");
    expect(page).toMatch(/dishMetaDescription\(/);
    expect(page).not.toMatch(/dish\.descriptor \?\?\s*\n?\s*dish\.description\?\.slice/);
  });
});

// ── THE SNIPPET THAT ENDED ON A DANGLING BRACKET ────────────────────────────
//
// The Rs 2,500 flagship dish shipped this as its meta description AND its
// og:description: "…your choice of one beer, water, or fresh local
// juice(lemonade". A Google snippet and a WhatsApp preview for the most
// expensive thing on the site, cut mid-word inside an open parenthesis.
describe("a clipped description reads like a sentence", () => {
  const long = (tail: string) => "A".repeat(120) + " " + tail;

  it("never leaves a bracket it opened", () => {
    const out = dishMetaDescription({
      name: "Lobster",
      description: long("with beer, water or fresh local juice(lemonade or orange) on the side"),
    });
    const opens = (out.match(/\(/g) ?? []).length;
    const closes = (out.match(/\)/g) ?? []).length;
    expect(opens).toBe(closes);
    expect(out).not.toMatch(/\([^)]*$/);
  });

  it("says that it cut something", () => {
    const out = dishMetaDescription({ name: "Lobster", description: long("and more words that will not fit at all") });
    expect(out.endsWith("…")).toBe(true);
  });

  it("stays inside the limit WITH the ellipsis", () => {
    // The first version of this fix came back at 156 against a 155 budget.
    for (const tail of ["x", "some trailing words", "juice(lemonade or orange"]) {
      const out = dishMetaDescription({ name: "Lobster", description: long(tail) });
      expect(out.length, tail).toBeLessThanOrEqual(155);
    }
  });

  it("keeps the first whole sentence rather than cutting inside it", () => {
    // dishMetaDescription composes the name, the descriptor, the prose and
    // the kitchen and clips the WHOLE thing, so the cut usually lands past
    // this sentence rather than inside it. What matters is that the sentence
    // survives intact.
    const out = dishMetaDescription({
      name: "Lobster",
      description: "Grilled over flame and served with rice. " + "B".repeat(200),
    });
    expect(out).toContain("served with rice.");
    expect(out).not.toMatch(/served with ric$|served wit$/);
  });

  it("leaves a short description exactly alone", () => {
    const out = dishMetaDescription({ name: "Rougaille", description: "Tomato, onion, thyme." });
    expect(out).not.toContain("…");
  });
});
