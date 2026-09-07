import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { RIDES_COPY } from "./rides/copy.i18n";

// ── A TRANSLATION THAT WAS WRITTEN AND NEVER WIRED UP ───────────────────────
//
// The fare box on /taxi/book is fully translated — eyebrow, night rate, "paid
// directly to your driver", the lot — except for the one line that carries the
// numbers. That line was hardcoded:
//
//     {quote.roadKm != null && <span>about {quote.roadKm} km</span>}
//
// while `price.distance` sat in the dictionary in all three languages: "about",
// "environ", "apepre". Somebody wrote the translation, shipped it, and nothing
// ever read it, so a French customer was quoted "about 18.9 km".
//
// This is the third instance of the same defect in this codebase — IslandMap
// printed the literal strings "{t.common.liveLocationOnly}" and
// "{t.common.youAreHere}" for the same reason. The pattern is worth a test
// rather than a third fix: the copy exists, the component ignores it, and every
// language-parity test still passes because the dictionaries themselves agree.

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const SRC = "app/taxi/book/BookRide.tsx";
const LANGS = ["en", "fr", "cr"] as const;

describe("the fare box speaks the reader's language", () => {
  it("reads the distance and duration copy instead of inlining English", () => {
    const src = read(SRC);
    expect(src).toContain("c.price.distance(");
    expect(src).toContain("c.price.duration(");
  });

  it("has no hardcoded 'about … km' left in the component", () => {
    const src = read(SRC);
    // Strip comments: the note explaining this bug quotes the old line.
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((l) => !l.trim().startsWith("//"))
      .join("\n");
    expect(code).not.toMatch(/>about \{/);
    expect(code).not.toMatch(/~\{quote\.tripMinutes\} min/);
  });

  it("actually differs between languages, so the wiring is provable", () => {
    // If distance() returned the same string everywhere, reading it would be
    // indistinguishable from hardcoding it and this test would prove nothing.
    const rendered = LANGS.map((l) => RIDES_COPY[l].book.price.distance(18.9));
    expect(new Set(rendered).size).toBeGreaterThan(1);
    expect(RIDES_COPY.fr.book.price.distance(18.9)).toContain("environ");
    expect(RIDES_COPY.cr.book.price.distance(18.9)).toContain("apepre");
  });

  it("keeps the number in every language", () => {
    for (const l of LANGS) {
      expect(RIDES_COPY[l].book.price.distance(18.9), l).toContain("18.9");
      expect(RIDES_COPY[l].book.price.duration(41), l).toContain("41");
    }
  });
});
