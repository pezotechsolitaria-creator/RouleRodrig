import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const GLOBALS = readFileSync(join(ROOT, "app", "globals.css"), "utf8");

/** Comments name the properties they explain; read declarations only. */
function css(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "");
}

function tsx(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

// ── A RULE THAT PROMISED READABLE WORDS MADE ONE UNREADABLE ─────────────────
//
// globals.css set `word-break: keep-all` and `overflow-wrap: normal` on every
// heading so that no word is ever split. For a word that fits, right. For a
// word that does not, it left the browser no legal break point, so the word
// did not wrap — it overflowed, and the first ancestor with overflow-hidden
// cut it off.
//
// Measured on /experiences at 375px: the two-up grid gives a card 128px of
// text, and "Plongée en apnée/Aquarium Rivière Banane" put "apnée/Aquarium" —
// one 147px token — on a line of its own. The reader got "apnée/Aquari".

describe("the heading wrap rule", () => {
  const block = css(GLOBALS).match(/h1,\s*h2,\s*h3,\s*h4\s*\{[^}]*\}/);

  it("still exists, and still refuses hyphenation", () => {
    expect(block).not.toBeNull();
    expect(block![0]).toContain("hyphens: none");
  });

  it("lets a word that cannot fit break rather than overflow", () => {
    expect(block![0]).toContain("overflow-wrap: break-word");
    expect(block![0]).not.toContain("overflow-wrap: normal");
  });

  it("does not suppress the ordinary break opportunities", () => {
    // keep-all is a CJK rule. On Latin text it mostly removed break points
    // and gave nothing back.
    expect(block![0]).not.toContain("keep-all");
  });

  it("is inside @layer base, so a utility on one heading can still win", () => {
    // Unlayered CSS beats every Tailwind v4 layer whatever the specificity.
    // As a raw top-level rule this silently defeated `break-words` on every
    // heading in the codebase: the class was in the markup, the computed
    // style said otherwise, and nothing said why.
    const layered = css(GLOBALS).match(/@layer base\s*\{[\s\S]*?\n\}/g) ?? [];
    expect(layered.some((b) => /h1,\s*h2,\s*h3,\s*h4/.test(b))).toBe(true);
  });
});

// ── THE PRICE FIELD IS ONE FREE-TEXT BOX ────────────────────────────────────
//
// The owner types the whole thing into it, and one experience carries
// "Rs 2,500 per person(Free transfer to starting point)". On /explore that is
// 318px of text in a 214px column, and it was `shrink-0` inside a card with
// overflow-hidden: cut mid-word, 163px gone, the free-transfer promise with
// it. Not priceParts() — that splitter keeps the number and free DELIVERY,
// which would drop the rest of what the owner wrote.

describe("the free-text price is never cut", () => {
  it("/explore lets it wrap, and drop to its own line", () => {
    const src = tsx("components/ExploreClient.tsx");
    expect(src).toContain("mt-auto flex flex-wrap items-center");
    expect(src).toContain("ml-auto min-w-0 break-words text-right");
    // shrink-0 was the whole defect: the column could not give ground.
    expect(src).not.toContain("ml-auto shrink-0 font-syne text-xs");
  });

  it("/experiences lets the price note break", () => {
    // Not a heading, so the rule above does not reach it — and "person(Free"
    // has no break opportunity of its own.
    expect(tsx("components/experiences/ExperiencesHub.tsx")).toContain(
      "break-words pt-3 font-dm text-xs font-semibold",
    );
  });
});
