import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = readFileSync(join(process.cwd(), "components", "TrustBar.tsx"), "utf8");
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// ── TWELVE ENGLISH PROMISES UNDER A FRENCH HEADING ─────────────────────────
//
// TrustBar was a server component with its copy hardcoded in English, so the
// "Why book with us" bar sat directly beneath a French h1 telling a French
// reader "Air conditioning / Automatic, insured, ready to drive". It renders
// no data and fetches nothing, so reading the language costs it nothing — and
// it still server-renders, exactly like the header and the footer do.
describe("the trust bar speaks the reader's language", () => {
  it("reads the language", () => {
    expect(CODE).toContain('"use client"');
    expect(CODE).toContain("useLanguage()");
    expect(CODE).toMatch(/title\[language\] \?\? title\.en/);
    expect(CODE).toMatch(/desc\[language\] \?\? desc\.en/);
  });

  it("gives every string all three languages", () => {
    // Equal counts is the invariant. One missing key falls back to English
    // silently, which is precisely the failure this component already shipped.
    const n = (re: RegExp) => (CODE.match(re) ?? []).length;
    const en = n(/\ben:\s*"/g);
    expect({ fr: n(/\bfr:\s*"/g), cr: n(/\bcr:\s*"/g) }).toEqual({ fr: en, cr: en });
    // six items (two shared, two scooter, two car), a title and a desc each.
    expect(en).toBe(12);
  });

  it("has no bare English title or desc left", () => {
    // The old shape was a plain string: title: "Air conditioning".
    expect(CODE).not.toMatch(/title:\s*"/);
    expect(CODE).not.toMatch(/desc:\s*"/);
  });

  it("keys the list on a stable value, not the translated one", () => {
    // Keying on the rendered title remounts every row on a language change.
    expect(CODE).toContain("key={title.en}");
  });

  it("still tells a car customer the truth about a car", () => {
    // This bar's own header comment: these are promises, so they have to be
    // true of the page they are on. A helmet is not included with a car, and
    // that correctness must survive being translated.
    const car = CODE.slice(CODE.indexOf("const CAR"), CODE.indexOf("export default"));
    expect(car).not.toMatch(/helmet|casque|kask/i);
    expect(car).toMatch(/Climatisation/);
    expect(car).toMatch(/Erkondisyone/);
  });
});
