import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { splitWords } from "./hero-words";

// The failure this guards cannot be reproduced in jsdom: it is a LINE BREAKING
// decision, and jsdom does no layout. It was found by measuring the real
// homepage at 1280px and reading back which letters shared a top offset —
// "WELCOMET" on one line and "O" on the next. So the unit tests below pin the
// grouping, and the source assertions pin the two CSS facts that make the
// grouping mean anything.

describe("splitWords", () => {
  it("keeps each word whole", () => {
    expect(splitWords("WELCOME TO").map((w) => w.text)).toEqual([
      "WELCOME",
      "TO",
    ]);
  });

  it("numbers letters as if the line had never been split", () => {
    // The intro staggers on this index. Renumbering per word would restart the
    // delay at every space, so the second word would animate on top of the
    // first instead of after it.
    const [first, second] = splitWords("WELCOME TO");
    expect(first.at).toBe(0);
    expect(second.at).toBe(8); // 7 letters + the space
  });

  it("survives a one-word line", () => {
    expect(splitWords("RODRIGUES")).toEqual([{ text: "RODRIGUES", at: 0 }]);
  });

  it("keeps the gap count right when a line is spaced twice", () => {
    // A double space from the CMS must not silently swallow a gap: an empty
    // word still occupies a slot, so the two gaps around it are both drawn.
    expect(splitWords("A  B").map((w) => w.text)).toEqual(["A", "", "B"]);
    expect(splitWords("A  B").map((w) => w.at)).toEqual([0, 2, 3]);
  });

  it("indexes a three-word line from the front of the line", () => {
    expect(splitWords("ONE TWO THREE").map((w) => w.at)).toEqual([0, 4, 8]);
  });
});

describe("the headline can only break between words", () => {
  const HERO = readFileSync(join(process.cwd(), "components/Hero.tsx"), "utf8");
  // The fix comment quotes the broken markup to explain it, so a naive scan
  // matches its own explanation. Same trap as lib/island-map-seam.test.ts.
  const code = HERO.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("wraps every word in a group that refuses to break", () => {
    // Without nowrap the group is still a run of inline-blocks and the browser
    // may break between any two of them — which is the original bug, moved.
    expect(code).toContain('className="inline-block whitespace-nowrap"');
  });

  it("draws the gap outside the groups, so a break has somewhere to go", () => {
    // Inside a group the gap would be unbreakable too, and a long headline
    // would then overflow the viewport rather than wrap at all.
    expect(code).toMatch(/w > 0 &&[\s\S]{0,220}w-\[0\.26em\]/);
  });

  it("still renders one span per letter", () => {
    // The whole point of the greeting is the per-letter intro. A fix that
    // grouped the letters into one span per word would have removed it.
    expect(code).toMatch(/\[\.\.\.word\.text\]\.map/);
  });
});
