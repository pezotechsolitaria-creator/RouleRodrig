import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LANGUAGE_TAGS, LANGUAGE_NAMES, languageTag } from "./i18n";
import type { Language } from "./i18n";

// ── THE SITE MUST NOT LIE ABOUT WHAT LANGUAGE IT IS IN ──────────────────────
//
// Measured in a real browser before this was fixed: the UI was rendering Kreol
// ("Etap 1 lor 4"), localStorage rr_language was "cr", and
// document.documentElement.lang was "en". Nothing in the repo ever wrote that
// attribute — it was a literal in app/layout.tsx with no writer anywhere.
//
// A screen reader takes its pronunciation rules from `lang`. Kreol and French
// read aloud with English phonetics are close to unusable, and on this island
// the people relying on a screen reader are exactly the people the delivery
// flow was redesigned for.
//
// ── AND THE OBVIOUS FIX IS ALSO WRONG ───────────────────────────────────────
//
// `document.documentElement.lang = language` looks right and is not: the
// internal code for Kreol is "cr", which as a real tag is ISO 639-1 for CREE,
// an Algonquian language of Canada. It is perfectly well-formed BCP-47, so
// Intl accepts it, validators accept it, axe's valid-lang rule accepts it, and
// the site goes on lying — in Cree instead of English, which is harder to
// notice. That is why the `not.toBe("cr")` assertions below are spelled out
// rather than implied.
//
// The suite runs on node with no DOM (vitest.config.ts), so these test the pure
// mapping, plus the two hand-written copies of it that cannot import anything.

const ROOT = join(__dirname, "..");
const ALL: Language[] = ["en", "fr", "cr"];

describe("the language tag table", () => {
  it("covers every language the switcher can reach", () => {
    // Guards the drift where a fourth language is added to the union and this
    // table is not, which TypeScript catches but only if someone runs it.
    expect(Object.keys(LANGUAGE_TAGS).sort()).toEqual([...ALL].sort());
    expect(Object.keys(LANGUAGE_TAGS).sort()).toEqual(
      Object.keys(LANGUAGE_NAMES).sort(),
    );
  });

  it("maps Kreol to mfe and NEVER to cr", () => {
    expect(LANGUAGE_TAGS.cr).toBe("mfe");
    // The whole point. "cr" is Cree.
    expect(LANGUAGE_TAGS.cr).not.toBe("cr");
  });

  it("leaves English and French alone", () => {
    expect(LANGUAGE_TAGS.en).toBe("en");
    expect(LANGUAGE_TAGS.fr).toBe("fr");
  });

  it("emits tags a browser will actually accept", () => {
    for (const lang of ALL) {
      const tag = LANGUAGE_TAGS[lang];
      expect(Intl.getCanonicalLocales(tag), lang).toEqual([tag]);
    }
  });

  it("falls back to English rather than throwing on junk", () => {
    // It is fed localStorage, which anybody can put anything into.
    expect(languageTag(null)).toBe("en");
    expect(languageTag(undefined)).toBe("en");
    expect(languageTag("")).toBe("en");
    expect(languageTag("klingon")).toBe("en");
    expect(languageTag("cr")).toBe("mfe");
  });
});

// ── The two copies that cannot import the table ─────────────────────────────
//
// Both run where an import is either impossible or unwise, so both spell the
// mapping out. Neither has a type checker watching it, which is what these are.

describe("the pre-paint script in app/layout.tsx", () => {
  const src = readFileSync(join(ROOT, "app", "layout.tsx"), "utf8");

  it("sets the document language before React ever mounts", () => {
    // Without this the attribute is only corrected after hydration, and
    // assistive tech that samples the language once at load reads English.
    expect(src).toContain("d.lang=");
  });

  it("carries the same cr -> mfe mapping", () => {
    expect(src).toContain("lang==='cr'?'mfe':lang");
  });

  it("still writes the detected language back, not just a discarded value", () => {
    // The branch used to compute the fallback inline inside setItem and throw
    // it away, leaving nothing to stamp onto <html>.
    expect(src).toContain("localStorage.setItem('rr_language',lang)");
  });
});

describe("the crash page in app/global-error.tsx", () => {
  const src = readFileSync(join(ROOT, "app", "global-error.tsx"), "utf8");

  it("agrees with the table", () => {
    // It cannot import lib/i18n: it is the last thing standing when the root
    // layout has thrown, and it should not pull a translation dictionary in to
    // read three letters.
    expect(src).toContain('"mfe"');
    expect(src).toContain("rr_language");
  });

  it("reads the language rather than assuming English", () => {
    expect(src).toContain("document.documentElement.lang");
  });
});

describe("structured data agrees with itself", () => {
  it("publishes the same three languages everywhere", () => {
    // websiteLd() said ["en", "fr"] while app/page.tsx published
    // knowsLanguage ["en", "fr", "mfe"] into the same rendered document.
    const schema = readFileSync(join(ROOT, "lib", "schema.ts"), "utf8");
    expect(schema).toContain('inLanguage: ["en", "fr", "mfe"]');

    const home = readFileSync(join(ROOT, "app", "page.tsx"), "utf8");
    for (const tag of Object.values(LANGUAGE_TAGS)) {
      expect(home, `knowsLanguage is missing ${tag}`).toContain(`"${tag}"`);
    }
  });
});
