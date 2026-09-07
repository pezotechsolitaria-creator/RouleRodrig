import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

// ── ONE TAB LIST, TWO CHROMES, AND THEY DRIFTED ─────────────────────────────
//
// showsVisitorNav("/") returns false, so the global BottomNav never renders on
// the homepage: AppHome draws its own bar from the same NAV_TABS. Both files
// say so in a comment — "Same five tabs as the global BottomNav — one list, two
// chromes" — and lib/nav-tabs.test.ts already pins the LIST.
//
// Nothing pinned the CHROME. So the selected state drifted: every other page
// fills the active tab with a gold pill and dark text, and the homepage tinted
// the label yellow instead. One tab away from Ti Roulé's solid gold button,
// yellow text does not read as "you are here" — the homepage looked like the
// only screen in the app with nothing selected. Reported as "just the home page
// bad".
//
// A screenshot test would have caught it and this repo has none. Reading the
// two sources for the same construction is the cheap version, and it is enough:
// the failure was one file having a rule the other did not.

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const BOTTOM = "components/BottomNav.tsx";
const HOME = "components/AppHome.tsx";

/** The gradient that fills a selected tab. Both bars must use it. */
const PILL = "bg-gradient-to-b from-yellow to-yellow-dark";

describe("the two bottom bars agree about the selected tab", () => {
  it("both fill the active tab with the same gold pill", () => {
    for (const f of [BOTTOM, HOME]) {
      expect(read(f), `${f} lost the active pill`).toContain(PILL);
    }
  });

  it("both position that pill the same way", () => {
    // `absolute inset-0 -z-10` inside a `relative` parent. Get this wrong and
    // the pill covers the icon instead of sitting behind it.
    for (const f of [BOTTOM, HOME]) {
      expect(read(f), `${f}`).toMatch(/absolute inset-0 -z-10 rounded-xl/);
    }
  });

  it("both switch the label to dark text on the pill", () => {
    // Yellow-on-gold is the state this test exists to prevent: legible in a
    // screenshot at 100%, unreadable on a phone in sunlight.
    for (const f of [BOTTOM, HOME]) {
      const src = read(f);
      expect(src, `${f} does not darken the active label`).toMatch(
        /active \? "text-dark"/,
      );
    }
  });

  it("neither tints the active label yellow instead", () => {
    // The exact regression: `active ? "text-yellow"` on the tab row.
    for (const f of [BOTTOM, HOME]) {
      expect(read(f), `${f} is back to yellow text`).not.toMatch(
        /active \? "text-yellow"/,
      );
    }
  });

  it("neither file defines the tabs itself", () => {
    // The list lives in lib/nav-tabs.ts. Both bars own their look and nothing
    // else — that separation is what makes this test only about chrome.
    for (const f of [BOTTOM, HOME]) {
      const src = read(f);
      expect(src, `${f} stopped importing the shared tabs`).toContain(
        "NAV_TABS",
      );
    }
  });

  it("both keep Ti Roulé as a solid gold button, not a pill", () => {
    // It is an action, not a destination, so it is always gold whether or not
    // anything is selected. If it ever took the active pill too, two adjacent
    // tabs would look identical.
    for (const f of [BOTTOM, HOME]) {
      const src = read(f);
      expect(src, `${f}`).toContain('tab.action === "tiroule"');
    }
  });
});
