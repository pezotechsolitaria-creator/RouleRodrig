import { describe, it, expect } from "vitest";
import translations, { type Language } from "./i18n";

// ── Every language says everything ──────────────────────────────────────────
//
// The dictionary is one object per language and nothing enforced that they
// agree. A key added to `en` during a feature and not to `fr`/`cr` does not
// break a build, does not throw at runtime, and does not look wrong in review —
// it just quietly renders `undefined` for a French visitor, or falls through to
// English on a page that is otherwise translated. Both failures are invisible
// to whoever is writing English.
//
// This makes the three dictionaries structurally identical by assertion, and
// names the paths that are missing so fixing it is mechanical rather than a
// hunt.

type Dict = Record<string, unknown>;

/** Every leaf path in an object, as "a.b.c". */
function paths(o: Dict, prefix = ""): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(o)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      out.push(...paths(v as Dict, p));
    } else {
      out.push(p);
    }
  }
  return out;
}

function at(o: Dict, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, k) => (acc as Dict)?.[k], o);
}

const LANGS: Language[] = ["en", "fr", "cr"];
const en = translations.en as unknown as Dict;
const enPaths = paths(en);

describe("translation dictionaries", () => {
  it("finds a real dictionary (tripwire)", () => {
    // A comparison that silently walks an empty object passes forever.
    expect(enPaths.length).toBeGreaterThan(200);
  });

  for (const lang of LANGS.filter((l) => l !== "en")) {
    it(`${lang} has every key English has`, () => {
      const d = translations[lang] as unknown as Dict;
      const missing = enPaths.filter((p) => at(d, p) === undefined);
      expect(
        missing,
        `${lang} is missing ${missing.length} of ${enPaths.length} keys. A visitor ` +
          `on this language sees English, or nothing at all, at each of these:\n  ` +
          missing.join("\n  "),
      ).toEqual([]);
    });

    it(`${lang} has no key English lacks`, () => {
      // The other direction matters too: a key only in `fr` is dead weight that
      // no component can reach through the typed `T`, and it usually means a
      // rename landed in one dictionary and not the other.
      const d = translations[lang] as unknown as Dict;
      const extra = paths(d).filter((p) => at(en, p) === undefined);
      expect(extra, `${lang} has keys English does not:\n  ${extra.join("\n  ")}`).toEqual([]);
    });

    it(`${lang} has no empty strings`, () => {
      // An empty string is worse than a missing key: `loc()` and the `t` lookup
      // both treat it as present, so it renders as a blank label rather than
      // falling back to English.
      const d = translations[lang] as unknown as Dict;
      const blank = enPaths.filter((p) => {
        const v = at(d, p);
        return typeof v === "string" && v.trim() === "";
      });
      expect(blank, `${lang} has blank values at:\n  ${blank.join("\n  ")}`).toEqual([]);
    });
  }
});
