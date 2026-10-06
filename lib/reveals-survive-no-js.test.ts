import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

// ── THE SCOOTER PAGE WAS A HERO IMAGE AND NOTHING ELSE ──────────────────────
//
// Scroll reveals are framer nodes: served at inline opacity:0, set to 1 only
// by JavaScript. Counted in the LIVE html on the day this was written —
// /browse/scooter 7 of them, / 12, /browse/car 7 — and not one <noscript>
// block anywhere in the customer app except the /curated one.
//
// On /browse/scooter those seven are all four vehicle cards, the BOOK ONLINE
// heading, the booking form and the booking summary. A crawler that does not
// run JavaScript — which is most of the AI ones — saw a rental page with no
// vehicles, no prices and no form.
//
// The fix has two halves that are useless apart: a marker class on the hidden
// nodes, and a noscript rule that un-hides it. This holds them together.

/** Comments here name the classes they explain; read code only. */
function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

function tsxUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((e) => {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) return tsxUnder(p);
    return e.endsWith(".tsx") ? [p] : [];
  });
}

/**
 * Every `<motion.*>` opening tag in a file, as written.
 *
 * Line-based rather than a regex over the whole file: these tags carry props
 * containing `>` (arrow functions, comparisons), so `[^>]*>` would truncate
 * one and silently drop its className from the check.
 */
function motionTags(src: string): string[] {
  const lines = src.split("\n");
  const tags: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/<motion\.\w+/.test(lines[i])) continue;
    let end = i;
    while (end < lines.length && lines[end].trim() !== ">") end++;
    tags.push(lines.slice(i, Math.min(end + 1, lines.length)).join("\n"));
  }
  return tags;
}

const STARTS_HIDDEN = "initial={{ opacity: 0";

// Every component that animates at all, not just the ones that already reveal
// on scroll: a new file that hides content on mount has to be caught too, and
// Hero.tsx — the home page headline — has no whileInView anywhere in it.
const revealFiles = tsxUnder(join(ROOT, "components")).filter((f) =>
  readFileSync(f, "utf8").includes("<motion."),
);

describe("every scroll reveal survives a reader with no JavaScript", () => {
  const tags = revealFiles.flatMap((f) =>
    motionTags(code(f)).map((t) => ({ file: f.slice(ROOT.length + 1), t })),
  );
  const reveals = tags.filter(
    (x) => x.t.includes(STARTS_HIDDEN) && x.t.includes("whileInView"),
  );

  it("found them", () => {
    // A tripwire: if the scanner stops matching, everything below passes
    // vacuously and the page goes back to being blank without JavaScript.
    expect(revealFiles.length).toBeGreaterThan(5);
    // 15 until 6 Oct 2026, when the rental cards and the in-page booking
    // form stopped hiding on load at all (the form became a sheet): five
    // fewer nodes a reader without JavaScript could lose.
    expect(reveals.length).toBeGreaterThanOrEqual(10);
  });

  it("every one carries the class the noscript rule un-hides", () => {
    const naked = reveals
      .filter((x) => !x.t.includes("rr-reveal"))
      .map((x) => `${x.file}: ${x.t.split("\n")[0].trim()}`);
    expect(naked).toEqual([]);
  });

  it("and no overlay does", () => {
    // A toast, a success banner, the map lightbox: each starts at opacity 0
    // too, and each is only ever on screen because JavaScript put it there.
    // Un-hiding a fullscreen overlay for a reader without JavaScript would be
    // worse than the bug this fixes — it would cover the page. So the marking
    // is never a blanket search for `initial={{ opacity: 0`.
    //
    // `fixed`, not `inset-0`: the test first forbade both and caught the
    // decorative glow inside a Fleet card, which is `absolute inset-0` within
    // its own relative parent and covers nothing. Fixed positioning is what
    // makes a box able to cover the page.
    const overlays = tags
      .filter((x) => x.t.includes("rr-reveal"))
      .filter((x) => /className=["'{`][^"'`]*fixed /.test(x.t))
      .map((x) => `${x.file}: ${x.t.split("\n")[0].trim()}`);
    expect(overlays).toEqual([]);
  });

  it("outside the hero, only scroll reveals are marked", () => {
    // Hero.tsx is the deliberate exception and the reason this assertion names
    // a file instead of forbidding mount animations outright: the home page's
    // <h1> is written letter by letter on MOUNT, not on scroll, so it never
    // carries whileInView — and it was the 12 hidden nodes the live home page
    // served. A headline is not an overlay. It is always in the DOM, so
    // un-hiding it is simply the page rendering.
    //
    // Widening this list is a deliberate act: check the node is content that
    // is always present, never something conditionally mounted.
    const MOUNT_ANIMATED_CONTENT = new Set(["components\\Hero.tsx", "components/Hero.tsx"]);
    const wrong = tags
      .filter((x) => x.t.includes("rr-reveal") && !x.t.includes("whileInView"))
      .filter((x) => !MOUNT_ANIMATED_CONTENT.has(x.file))
      .map((x) => `${x.file}: ${x.t.split("\n")[0].trim()}`);
    expect(wrong).toEqual([]);
  });

  it("the home page headline is one of them", () => {
    // Named explicitly, because the allowlist above would otherwise let this
    // regress to unmarked without any test noticing.
    const hero = code(join(ROOT, "components", "Hero.tsx"));
    expect(hero).toContain('className="rr-reveal inline-block"');
  });
});

describe("the rule that does the un-hiding", () => {
  it("is served, inside a noscript, from the root layout", () => {
    const layout = code(join(ROOT, "app", "layout.tsx"));
    expect(layout).toContain("<noscript");
    expect(layout).toContain(".rr-reveal{opacity:1!important");
    // Inside the noscript and not in the stylesheet: served to a browser that
    // runs the animation, it would cancel every reveal on the site.
    expect(layout.indexOf("<noscript")).toBeLessThan(layout.indexOf(".rr-reveal{"));
  });

  it("leaves the class inert while JavaScript is on", () => {
    const globals = readFileSync(join(ROOT, "app", "globals.css"), "utf8");
    expect(globals).not.toContain(".rr-reveal");
  });

  it("does not disturb the /curated rule, which covers different classes", () => {
    const fonts = code(join(ROOT, "components", "world-page", "WorldFonts.tsx"));
    for (const cls of ["rr-cur-reveal", "rr-cur-rise", "rr-cur-cine"]) {
      expect(fonts, cls).toContain(`.${cls}{opacity:1!important`);
    }
  });
});
