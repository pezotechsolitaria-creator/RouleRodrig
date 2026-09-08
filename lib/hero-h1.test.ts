import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const HERO = readFileSync(join(process.cwd(), "components/Hero.tsx"), "utf8");

// ── "WHY DO I ONLY GET SCOOTER BOOKINGS?" ───────────────────────────────────
//
// Asked by the owner on 2026-09-08. Part of the answer was on the homepage,
// which is the page that ranks — searches ending in a booking land here, not on
// /browse/scooter.
//
// Its <h1> was the animated hero greeting. That headline renders one <span> per
// letter, each aria-hidden, and the space between the words is an empty
// width-only span rather than a character. So the element's TEXT CONTENT — the
// thing a crawler extracts, since aria-label is an accessibility affordance and
// not content — was:
//
//     WELCOMETO
//
// A non-word, as the primary heading of the strongest page on the site. The
// letters also carry inline opacity:0 until JS animates them in.
//
// Measured the same day on the live homepage: the body said "scooter" 3 times
// and "car" once. BRAND.md calls the primary service "scooter & car rental",
// so the page Google trusts most was, in text, a scooter-only page.
describe("the homepage h1", () => {
  it("is not the animated greeting", () => {
    // The greeting keeps its aria-label so a screen reader still hears
    // "WELCOME TO" — it just stops being the document's heading.
    expect(HERO).not.toMatch(/<h1[\s\S]{0,80}aria-label=\{line\}/);
  });

  it("exists, and names both services", () => {
    expect(HERO).toContain('<h1 className="sr-only">');
    expect(HERO.toLowerCase()).toMatch(/scooter and car rental in rodrigues/);
  });

  it("is translated for the French and Creole audiences", () => {
    // BRAND.md: the audience is largely fr-RE / fr-MU. Both are first-class.
    expect(HERO).toContain("Location de scooter et de voiture à Rodrigues");
    expect(HERO).toMatch(/Lokasion skooter ek loto Rodrig/);
  });

  it("uses the site's own Creole words, not a translation of the English", () => {
    // lib/i18n.ts already says "Lokasion skooter" and calls a car "loto".
    const i18n = readFileSync(join(process.cwd(), "lib/i18n.ts"), "utf8");
    expect(i18n).toMatch(/Lokasion skooter/i);
    expect(i18n).toMatch(/\bloto\b/i);
  });

  it("costs the hero no height", () => {
    // The subheadline and hero CTA are out at the owner's direction, because
    // hero height pushes the six discovery cards below the fold. A visible
    // heading would reopen exactly that argument; sr-only does not.
    expect(HERO).toMatch(/<h1 className="sr-only">/);
  });

  it("sits outside the block that retires when the video plays", () => {
    // hideText removes the headline once footage is genuinely playing. If the
    // h1 lived inside it, the page would end up with no heading at all.
    const h1At = HERO.indexOf('<h1 className="sr-only">');
    const headlineAt = HERO.indexOf("headlineLines.filter");
    expect(h1At).toBeGreaterThan(-1);
    expect(headlineAt).toBeGreaterThan(-1);
    expect(h1At).toBeLessThan(headlineAt);
  });

  it("spells the brand the way BRAND.md requires", () => {
    // "Roule Rodrigues" — unaccented — everywhere. The h1 says Rodrigues the
    // place, which does take no accent either way, but guard the island name.
    expect(HERO).not.toMatch(/Rodrígues|Rodrigúes/);
  });
});
