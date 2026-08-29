import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { foodFaq, foodFaqHeading } from "./food-faq";

// ── /food HAD THE MOST TEXT AND THE FEWEST ANSWERS (M152) ───────────────────
//
// 3,476 characters, more than /taxi, /shop or /experiences, because it lists
// nine dishes with prices. A list is not an answer: "can you order food in
// Rodrigues", "does anywhere deliver", "is there vegetarian food" had no
// sentence anywhere on the page for an engine to quote.

const EN = foodFaq("en");
const FR = foodFaq("fr");
const en = EN.map((f) => `${f.question} ${f.answer}`).join(" ");

describe("the answers exist in both languages", () => {
  it("asks and answers five questions", () => {
    expect(EN).toHaveLength(5);
    expect(FR).toHaveLength(5);
    for (const f of [...EN, ...FR]) expect(f.answer.length).toBeGreaterThan(80);
  });

  it("falls Kreol back to French", () => {
    expect(foodFaq("cr")).toEqual(FR);
    expect(foodFaqHeading("cr")).toBe(foodFaqHeading("fr"));
  });
});

describe("every figure was read off the live page", () => {
  it("quotes the real price floor and ceiling", () => {
    // Coconut Napolitaine Rs 80; Flame-Grilled Lobster Package Rs 2,500.
    expect(en).toContain("Rs 80");
    expect(en).toContain("Rs 2,500");
  });

  it("quotes the prep time every kitchen actually shows", () => {
    expect(en).toContain("15 to 30 minutes");
  });

  it("describes collection the way the page implements it", () => {
    // "Collect it from the kitchen. No fee, and you get a code to show."
    const collect = EN.find((f) => /collect/i.test(f.question));
    expect(collect).toBeDefined();
    expect(collect!.answer).toContain("no fee");
    expect(collect!.answer).toContain("code");
  });

  it("lists only the dietary filters the page really offers", () => {
    for (const f of ["vegetarian", "halal", "gluten free"]) {
      expect(en.toLowerCase()).toContain(f);
    }
    // Not offered as a filter — claiming it would send someone looking.
    expect(en.toLowerCase()).not.toContain("vegan");
  });
});

describe("it names no dish, on purpose", () => {
  it("keeps the DEMO kitchen's dishes out of an answer engine", () => {
    // Seven of the nine listed dishes belong to "Ti Kitchen (DEMO)", a store
    // flagged no_index. Putting those names into an FAQ would push into AI
    // answers exactly what the site is keeping out of search — and they are
    // also the names most likely to vanish when the demo is retired.
    for (const dish of [
      "Ourite Rougaille",
      "Boulettes",
      "Mine Frite",
      "Farata",
      "Napolitaine",
      "Ti Kitchen",
    ]) {
      expect(en).not.toContain(dish);
    }
  });

  it("describes the food by category instead, which cannot go stale", () => {
    expect(en.toLowerCase()).toMatch(/curry|grilled fish|noodles/);
  });
});

describe("the page renders what it marks up", () => {
  const page = readFileSync(join(__dirname, "..", "app", "food", "page.tsx"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const cmp = readFileSync(
    join(__dirname, "..", "components", "food", "FoodFaq.tsx"),
    "utf8",
  );

  it("marks up the English list beside the breadcrumb", () => {
    expect(page).toMatch(/faqPageLd\(`\$\{SITE_URL\}\/food`, foodFaq\("en"\)\)/);
  });

  it("renders the visible half in the reader's language", () => {
    expect(page).toMatch(/<FoodFaq \/>/);
    expect(cmp).toMatch(/^"use client";/);
    expect(cmp).toMatch(/foodFaq\(language\)/);
    expect(cmp).toMatch(/\{f\.question\}/);
    expect(cmp).toMatch(/\{f\.answer\}/);
  });

  it("puts the FAQ at the foot, above the concierge hand-off", () => {
    expect(page.indexOf("<FoodFaq />")).toBeLessThan(page.indexOf("<ConciergeFooter />"));
  });
});
