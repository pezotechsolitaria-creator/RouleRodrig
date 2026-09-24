import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const BANNER = join(ROOT, "components", "world-page", "WorldHeroBanner.tsx");
const FONTS = join(ROOT, "components", "world-page", "WorldFonts.tsx");

// ── THE HEADLINE WAS INVISIBLE WITHOUT JAVASCRIPT ───────────────────────────
//
// WorldFonts.tsx ships a <noscript> block whose comment promises that a reader
// with no JavaScript gets the page complete and static. It un-hid two classes,
// .rr-cur-reveal and .rr-cur-rise — the CSS animation path's. /curated renders
// the CINEMATIC path, whose eyebrow, headline letters, italic ending and
// sub-line are framer nodes carrying an inline opacity:0 and no class at all.
//
// Measured on the live page before the fix: 26 elements with an inline
// opacity:0, 21 of them the individual letters of "Experience Rodrigues,
// elevated." — and zero matches for either selector. The promise held for the
// scroll reveals further down and failed for the first thing on the page.
//
// rr-cur-cine is an empty hook class: no base CSS, so with JavaScript on it
// cannot fight the animation it exists to insure.

/** Comments name the very classes this file forbids and requires; drop them. */
function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

/** The classes the noscript rule can reach. */
const COVERED = ["rr-cur-reveal", "rr-cur-rise", "rr-cur-cine"];

/**
 * Every JSX opening tag in the hero, as written. A tag containing a `>` of its
 * own would be truncated here and lose its className — which fails this test
 * rather than passing it silently, so the failure direction is the safe one.
 */
function openingTags(src: string): string[] {
  return src.match(/<motion\.\w+\b[^>]*>/g) ?? [];
}

describe("the cinematic hero renders with JavaScript switched off", () => {
  const tags = openingTags(code(BANNER));
  const hidden = tags.filter((t) => /initial=\{[^]*opacity:\s*0\b/.test(t));

  it("found the nodes that start hidden", () => {
    // A tripwire: if the regex stops matching, every assertion below passes
    // vacuously and the bug walks back in unannounced.
    expect(tags.length).toBeGreaterThan(3);
    expect(hidden.length).toBeGreaterThanOrEqual(4);
  });

  it("every one of them carries a class the noscript rule un-hides", () => {
    const naked = hidden.filter((t) => !COVERED.some((c) => t.includes(c)));
    // The message is the tag itself: whoever adds the next animated element
    // sees exactly which one they left invisible.
    expect(naked).toEqual([]);
  });
});

describe("the noscript rule reaches all three classes", () => {
  const css = code(FONTS);

  it("un-hides each one, and with !important", () => {
    for (const cls of COVERED) {
      expect(css, cls).toContain(`.${cls}{opacity:1!important`);
    }
  });

  it("is still inside a <noscript>, not a stylesheet everyone pays for", () => {
    // These rules exist to defeat the animation. Served to a browser that runs
    // it, they would cancel the entire intro.
    expect(css).toContain("<noscript");
    expect(css.indexOf("<noscript")).toBeLessThan(css.indexOf(".rr-cur-cine"));
  });
});

describe("rr-cur-cine stays inert while JavaScript is on", () => {
  it("has no styles of its own anywhere in the CSS", () => {
    const globals = readFileSync(join(ROOT, "app", "globals.css"), "utf8");
    // .rr-cur-rise has keyframes; this one must not, or it would animate
    // against framer on every visit instead of only rescuing the ones framer
    // never reached.
    expect(globals).not.toContain(".rr-cur-cine");
  });
});
