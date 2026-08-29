import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ── THE FRENCH FOOD PAGE (M155) ─────────────────────────────────────────────
//
// /food is the richest English page this site has — it lists nine dishes with
// real prices — and none of it was readable by somebody searching in French.
// "manger a Rodrigues", "cuisine rodriguaise" and "commander a manger
// Rodrigues" reached an English page or nothing.

const ROOT = join(__dirname, "..");
const SRC = readFileSync(
  join(ROOT, "app", "fr", "manger-a-rodrigues", "page.tsx"),
  "utf8",
);
/** Prose in comments must never be what satisfies a test. */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("it names no dish, for the same reason the English FAQ does not", () => {
  it("keeps the DEMO kitchen out of French search and AI answers", () => {
    // Seven of the nine listed dishes belong to "Ti Kitchen (DEMO)", a store
    // flagged no_index. Naming them here would push into search exactly what
    // the site is keeping out of it, and they are the names most likely to
    // vanish when the demo is retired.
    for (const dish of [
      "Ourite Rougaille",
      "Boulettes",
      "Mine Frite",
      "Farata",
      "Napolitaine",
      "Ti Kitchen",
    ]) {
      expect(CODE).not.toContain(dish);
    }
  });

  it("describes the cuisine instead, which does not go stale", () => {
    expect(CODE).toContain("ourite");
    expect(CODE).toMatch(/caris|rougailles/);
  });
});

describe("the prices are the real ones", () => {
  it("quotes the live floor and ceiling, written the French way", () => {
    // Rs 80 is the smallest dish on the rendered page; Rs 2 500 the whole
    // grilled lobster. French uses a space as the thousands separator.
    expect(CODE).toContain("Rs 80");
    expect(CODE).toContain("Rs 2 500");
    expect(CODE).not.toContain("Rs 2,500");
  });

  it("states the collection rule the page actually implements", () => {
    expect(CODE).toMatch(/sans frais/);
    expect(CODE).toContain("code");
  });

  it("offers delivery only where a kitchen offers it", () => {
    // Not island-wide delivery — that is a promise nobody signed up to.
    expect(CODE).toMatch(/lorsque la cuisine la propose/);
  });
});

describe("it does not claim to be the restaurant", () => {
  it("models an ordering service, not a Restaurant", () => {
    // Roule Rodrigues does not cook; the kitchens do.
    expect(CODE).toContain('"@type": "Service"');
    expect(CODE).not.toMatch(/"@type":\s*"Restaurant"|FoodEstablishment/);
    expect(CODE).toContain('serviceType: "Commande de repas en ligne"');
  });
});

describe("it is paired, reachable and declared", () => {
  it("names its English twin, which names it back", () => {
    expect(CODE).toMatch(/["']en["']?\s*:\s*`\$\{SITE_URL\}\/food`/);
    const food = readFileSync(join(ROOT, "app", "food", "page.tsx"), "utf8");
    expect(food).toContain("/fr/manger-a-rodrigues");
  });

  it("is linked from the English food page, not only annotated", () => {
    const food = readFileSync(join(ROOT, "app", "food", "page.tsx"), "utf8");
    expect(food).toContain('href="/fr/manger-a-rodrigues"');
  });

  it("is in the sitemap and in llms.txt", () => {
    expect(readFileSync(join(ROOT, "app", "sitemap.ts"), "utf8")).toContain(
      "/fr/manger-a-rodrigues",
    );
    expect(readFileSync(join(ROOT, "public", "llms.txt"), "utf8")).toContain(
      "/fr/manger-a-rodrigues",
    );
  });

  it("carries a FAQPage marked as French", () => {
    expect(CODE).toContain('"@type": "FAQPage"');
    expect(CODE).toContain('inLanguage: "fr"');
    expect((CODE.match(/^\s{4}q: "/gm) ?? []).length).toBeGreaterThanOrEqual(5);
  });
});
