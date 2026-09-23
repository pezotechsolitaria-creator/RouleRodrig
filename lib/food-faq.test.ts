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
    // Beach Experience Package Rs 1,000; Flame-Grilled Lobster Package
    // Rs 2,500 — food_catalog, 24 Sept 2026. It quoted the purged demo
    // kitchen's Rs 80 Coconut Napolitaine, and "curry … noodles", for weeks —
    // inside the FAQPage JSON-LD that /food publishes.
    expect(en).toContain("Rs 1,000");
    expect(en).toContain("Rs 2,500");
    expect(en).not.toMatch(/Rs 80\b|noodles/);
  });

  it("describes collection the way the page implements it, not a cooking time", () => {
    // M216: this used to pin "15 to 30 minutes". Since 23 Sept 2026 the only
    // kitchen on /food needs 24 hours' notice, and the checkout refuses "as
    // soon as it's ready" for it — the half hour was a promise nobody made.
    expect(en).not.toContain("15 to 30 minutes");
    expect(en).toMatch(/day’s notice/);
    expect(en).toMatch(/Each dish says how far ahead to order/);
    expect(en).toMatch(/At checkout you choose when you want it/);
    // Not while no kitchen does it: "some kitchens cook on the spot" and "as
    // soon as it is ready" described a checkout option the only kitchen on
    // /food refuses — and this answer is published as FAQPage JSON-LD.
    expect(en).not.toMatch(/cook on the spot|as soon as it is ready/);
    expect(en).toContain("at least 24 hours");
  });

  it("no longer says only what is cooking now is offered", () => {
    // A notice kitchen's dish is ORDERABLE while nothing is being cooked.
    expect(en).not.toMatch(/cooking now is offered/i);
  });

  it("says who is paid, and how, where the rule is one kitchen's", () => {
    // M201: Chez Banane takes cash; the platform switch still says prepay.
    // Naming the kitchen keeps it from reading as a platform-wide rule.
    expect(en).toMatch(/You pay the kitchen, not the site/);
    expect(en).toMatch(/Chez Banane takes cash when you collect/);
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
    // By KIND, and only kinds actually on the menu: "curry … noodles" was the
    // purged demo kitchen's, still promised here in September 2026.
    expect(en.toLowerCase()).toMatch(/grilled lobster|seafood|curry|grilled fish/);
  });
});

describe("the French says the same thing (M216)", () => {
  const fr = FR.map((f) => `${f.question} ${f.answer}`).join(" ");
  const frPage = readFileSync(
    join(__dirname, "..", "app", "fr", "manger-a-rodrigues", "page.tsx"),
    "utf8",
  );

  it("drops the half-hour promise and the cooking-now claim", () => {
    for (const text of [fr, frPage]) {
      expect(text).not.toContain("15 à 30 minutes");
      expect(text).not.toMatch(/Seul ce qu.une cuisine prépare sur le moment est proposé/);
      expect(text).not.toMatch(/Seuls les plats réellement préparés sur le moment/);
    }
  });

  it("names the notice, the choice of time and the cash", () => {
    for (const text of [fr, frPage]) {
      expect(text).toMatch(/jour de préavis/);
      expect(text).toMatch(/espèces au retrait/);
    }
    expect(fr).toMatch(/au moins 24 heures/);
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
