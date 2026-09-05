import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { translations } from "./i18n";

// ── "&NBSP;" PRINTED ACROSS THE HOMEPAGE (M162) ─────────────────────────────
//
// The hero's marquee ribbon read, in every language, on production:
//
//   EXPLORE THE ISLAND&NBSP;•&NBSP;FEEL THE WIND&NBSP;•&NBSP;ROULE RODRIGUES&NBSP;•
//
// The dictionary held "EXPLORE THE ISLAND&nbsp;•&nbsp;…". An HTML entity only
// decodes when the BROWSER parses it out of markup. React renders a JS string
// as a text node, verbatim, precisely so a translation cannot inject HTML — so
// the entity is printed rather than turned into a space.
//
// The fix is a real U+00A0 in the string. The rule generalises: nothing in a
// dictionary is markup, because nothing in a dictionary is ever parsed as
// markup.

const LIB = __dirname;

/** Entities that would be printed literally rather than rendered. */
const ENTITY = /&(?:nbsp|amp|lt|gt|quot|apos|middot|hellip|mdash|ndash|times|#\d+|#x[0-9a-f]+);/i;

const dictionaries = [
  "i18n.ts",
  ...readdirSync(LIB, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => join(e.name, "copy.i18n.ts"))
    .filter((rel) => {
      try { readFileSync(join(LIB, rel)); return true; } catch { return false; }
    }),
];

describe("a dictionary holds text, never markup", () => {
  for (const rel of dictionaries) {
    it(`${rel} has no HTML entities`, () => {
      const src = readFileSync(join(LIB, rel), "utf8");
      const offenders = src
        .split("\n")
        .map((line, i) => ({ line, n: i + 1 }))
        .filter(({ line }) => ENTITY.test(line) && !line.trimStart().startsWith("//"));

      expect(
        offenders.map((o) => `${rel}:${o.n} ${o.line.trim().slice(0, 90)}`),
      ).toEqual([]);
    });
  }
});

describe("the marquee says what it means", () => {
  it("separates its phrases with a real space in all three languages", () => {
    for (const lang of ["en", "fr", "cr"] as const) {
      const m = translations[lang].a11yMore.marquee;
      expect(m).not.toContain("&nbsp;");
      expect(m).not.toMatch(ENTITY);
      // A non-breaking space is still a space: the words must not run together
      // the way "ISLAND&NBSP;" did once the entity was stripped by hand.
      expect(m).toMatch(/\S[\u00a0 ]•[\u00a0 ]\S/);
    }
  });

  it("keeps the non-breaking space, so a bullet never starts a line", () => {
    // The ribbon scrolls; a • orphaned at a wrap point looks like a typo.
    expect(translations.en.a11yMore.marquee).toContain("\u00a0");
  });
});
