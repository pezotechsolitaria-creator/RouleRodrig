import { describe, it, expect } from "vitest";
import { readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { FR_PAGES, GUIDE_PAGES } from "./hubs";

// ── The two parents that were 404s ──────────────────────────────────────────
//
// /guide had eight pages beneath it and /fr had eleven, and BOTH PARENTS
// returned the not-found screen. Nothing in the app linked to either, which is
// how they survived a repo that already tests reachability: that test asks
// whether every page has a link, and an absent page has no page to check.
//
// These hubs are the fix, and this file is what stops them rotting. A hub that
// silently stops listing half its cluster is worse than no hub — it looks
// complete.

function childRoutes(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => {
      const p = join(dir, name);
      // Route groups "(x)" and dynamic "[x]" segments are not pages of their own.
      if (!statSync(p).isDirectory()) return false;
      if (name.startsWith("(") || name.startsWith("[") || name.startsWith("_")) return false;
      return existsSync(join(p, "page.tsx"));
    })
    .map((name) => `/${dir.split(/[\\/]/).slice(1).join("/")}/${name}`);
}

describe("the guide hub lists every guide", () => {
  const children = childRoutes(join("app", "guide"));

  it("finds the guides at all (tripwire)", () => {
    expect(children.length).toBeGreaterThan(5);
  });

  it("has no guide missing from the hub", () => {
    // A guide added next month must fail HERE, on the commit that adds it,
    // rather than sitting unlinked and uncrawled the way four French pages did.
    const listed = new Set(GUIDE_PAGES.map((g) => g.href));
    const missing = children.filter((c) => !listed.has(c));
    expect(missing, `Add these to GUIDE_PAGES in lib/nav/hubs.ts: ${missing.join(", ")}`).toEqual([]);
  });

  it("lists nothing that does not exist", () => {
    // The other direction: a hub linking a deleted guide is a 404 with a nice
    // card around it, which is exactly what this whole exercise was about.
    const real = new Set(children);
    const ghosts = GUIDE_PAGES.map((g) => g.href).filter((h) => !real.has(h));
    expect(ghosts, `These are listed but have no page: ${ghosts.join(", ")}`).toEqual([]);
  });
});

describe("the French hub lists every French page", () => {
  const children = childRoutes(join("app", "fr"));

  it("finds the French pages at all (tripwire)", () => {
    expect(children.length).toBeGreaterThan(8);
  });

  it("has no French page missing from the hub", () => {
    const listed = new Set(FR_PAGES.map((p) => p.href));
    const missing = children.filter((c) => !listed.has(c));
    expect(missing, `Add these to FR_PAGES in lib/nav/hubs.ts: ${missing.join(", ")}`).toEqual([]);
  });

  it("lists nothing that does not exist", () => {
    const real = new Set(children);
    const ghosts = FR_PAGES.map((p) => p.href).filter((h) => !real.has(h));
    expect(ghosts, `These are listed but have no page: ${ghosts.join(", ")}`).toEqual([]);
  });

  it("is written in French", () => {
    // A French visitor arriving at /fr and being greeted in English has been
    // told something about how much the French half of this site is looked
    // after. Checked by accented characters rather than by eye, so a future
    // edit that quietly drops to English is caught.
    const text = FR_PAGES.map((p) => `${p.title} ${p.blurb}`).join(" ");
    expect(text).toMatch(/[àâçéèêëîïôùûü]/i);
    expect(text).not.toMatch(/\bthe\b|\bwhat\b|\bwhere\b/i);
  });
});
