import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ── THE RICHEST PAGE ON THE SITE HAD NOTHING QUOTABLE (M156) ────────────────
//
// /fr/plages-rodrigues serves 8,817 characters and twelve Beach entities — the
// most substantial page here — and was the only one of the eight French pages
// without a FAQPage. So the page best placed to be quoted for "quelle plage a
// Rodrigues" gave an answer engine nothing to lift.

const ROOT = join(__dirname, "..");
const SRC = readFileSync(
  join(ROOT, "app", "fr", "plages-rodrigues", "page.tsx"),
  "utf8",
);
/** Prose in comments must never be what satisfies a test. */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("the answers come from the beaches' own French writing", () => {
  it("asks six questions, marked up as French", () => {
    expect(CODE).toContain('"@type": "FAQPage"');
    expect(CODE).toContain('inLanguage: "fr"');
    expect((CODE.match(/^\s{4}q: "/gm) ?? []).length).toBe(6);
  });

  it("names only beaches this page actually lists", () => {
    // Twelve beaches have storyFr and are the only ones rendered. Naming one
    // that is not listed sends a reader looking for a page that is not there.
    const listed = [
      "Pointe Coton",
      "Saint-François",
      "Baladirou",
      "Pointe du Diable",
      "Anse aux Anglais",
    ];
    for (const b of listed) expect(CODE).toContain(b);
    // These six DO render now — someone filled in descriptionFr for them on
    // 2026-08-29, which is exactly what the page's filter is designed to pick
    // up. They stay out of the FAQ anyway: the answers are drawn from storyFr,
    // the longer piece the owner wrote, and these six have only a short
    // description. Naming a beach here whose story we cannot quote would mean
    // inventing what it is like.
    for (const absent of ["Anse Raffin", "Gravier", "Île Michel", "Mourouk", "Sandy Patate"]) {
      expect(CODE).not.toContain(absent);
    }
  });

  it("repeats the owner's own warnings rather than softening them", () => {
    // Baladirou's storyFr: "mefiez-vous des courants a maree basse".
    // Pointe du Diable's: "le cote sauvage et venteux".
    expect(CODE).toContain("marée basse");
    expect(CODE).toMatch(/sauvage et venteux/);
    expect(CODE).toMatch(/^\s+a: "Non\./m);
  });
});

describe("it answers Trou d'Argent, which people search and the page never listed", () => {
  it("has a question for it", () => {
    expect(CODE).toContain("Trou d'Argent");
  });

  it("says it is reached on foot, and names both trailheads", () => {
    // Both come from storyFr: Pointe Coton is "le depart du sentier des
    // falaises vers Trou d'Argent", and Saint-Francois' coastal path reaches
    // it via Anse Bouteille. It is not a listed beach because there is no road.
    const q = CODE.slice(CODE.indexOf("Trou d'Argent"));
    expect(q).toContain("à pied");
    expect(q).toContain("Anse Bouteille");
  });
});

describe("the markup cannot outrun the page", () => {
  it("renders the same array it marks up", () => {
    expect((CODE.match(/FAQ\(places\.length\)/g) ?? []).length).toBe(2);
    expect(CODE).toContain("{f.q}");
    expect(CODE).toContain("{f.a}");
  });

  it("counts the beaches from live content, so the copy cannot drift", () => {
    expect(CODE).toMatch(/const FAQ = \(n: number\)/);
    expect(CODE).toContain('" + n + "');
  });
});

describe("a French page sends French readers to French pages", () => {
  it("points at the French accommodation page, not the English one", () => {
    expect(CODE).toContain("/fr/hebergement-rodrigues");
    expect(CODE).not.toMatch(/href: "\/browse\/stays"/);
  });

  it("links the other French pages that exist", () => {
    for (const href of ["/fr/que-faire-a-rodrigues", "/fr/taxi-rodrigues"]) {
      expect(CODE).toContain(href);
    }
  });
});
