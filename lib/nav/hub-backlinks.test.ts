import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GUIDE_PAGES, FR_PAGES } from "./hubs";

const ROOT = process.cwd();

// ── A HUB THAT ONLY POINTS DOWNWARD IS HALF A HUB ───────────────────────────
//
// /guide lists its eight children and /fr lists its eleven. Measured on the
// live site before this: ZERO of the eleven French pages rendered an href to
// /fr, and zero of the eight guide pages rendered one to /guide.
//
// That is the "French pages are an island" problem one level down — and the
// /fr hub exists specifically to end it. Those pages are the best-performing
// writing on this site and people arrive on them from search, one at a time,
// with no route to the other ten. The hub's only inbound link anywhere was a
// single row on /more, an English page behind a "More" tap.
//
// lib/nav/hubs.ts already has a test asserting the hub LISTS every child. This
// is the other direction, which nothing checked.

function childPages(segment: string): { route: string; file: string }[] {
  const dir = join(ROOT, "app", segment);
  return readdirSync(dir)
    .filter((e) => statSync(join(dir, e)).isDirectory())
    .map((e) => ({ route: `/${segment}/${e}`, file: join(dir, e, "page.tsx") }))
    .filter((p) => {
      try {
        return statSync(p.file).isFile();
      } catch {
        return false;
      }
    });
}

describe("every guide links back to the list of guides", () => {
  const pages = childPages("guide");

  it("found them, and the hub agrees how many there are", () => {
    // A tripwire: an empty list makes the assertion below vacuous.
    expect(pages.length).toBeGreaterThan(5);
    // The hub lists /guide/rodrigues et al; every directory here should be in it.
    const listed = new Set(GUIDE_PAGES.map((p) => p.href));
    expect(pages.filter((p) => !listed.has(p.route)).map((p) => p.route)).toEqual([]);
  });

  it("every one renders a link up to /guide", () => {
    const missing = pages
      .filter((p) => !readFileSync(p.file, "utf8").includes('href="/guide"'))
      .map((p) => p.route);
    expect(missing).toEqual([]);
  });
});

describe("every French page links back to the French hub", () => {
  const pages = childPages("fr");

  it("found them, and the hub agrees how many there are", () => {
    expect(pages.length).toBeGreaterThan(8);
    const listed = new Set(FR_PAGES.map((p) => p.href));
    expect(pages.filter((p) => !listed.has(p.route)).map((p) => p.route)).toEqual([]);
  });

  it("every one renders a link up to /fr", () => {
    const missing = pages
      .filter((p) => !readFileSync(p.file, "utf8").includes('href="/fr"'))
      .map((p) => p.route);
    expect(missing).toEqual([]);
  });

  it("asks in French, because these pages are French for everybody", () => {
    // Not the visitor's chosen language: /fr/plages-rodrigues is French
    // whatever the switcher says, which is why PageLanguage.tsx exists.
    for (const p of pages) {
      expect(readFileSync(p.file, "utf8"), p.route).toContain("Tous nos guides");
    }
  });
});

describe("the hubs do not link to themselves", () => {
  it("neither hub page carries a backlink", () => {
    // The first attempt put this in a layout, which wraps the hub as well as
    // its children. usePathname() is empty while a page is statically
    // generated, so /guide shipped a link to /guide in its own static HTML and
    // then removed it on hydration — a wrong link and a mismatch at once.
    for (const hub of ["guide", "fr"]) {
      const src = readFileSync(join(ROOT, "app", hub, "page.tsx"), "utf8");
      expect(src, hub).not.toContain("HubBacklink");
    }
  });

  it("the component is server-rendered, so a crawler without JS follows it", () => {
    const src = readFileSync(join(ROOT, "components", "nav", "HubBacklink.tsx"), "utf8");
    // Asserted on the directive and the IMPORT, never on the words: the file's
    // own comment explains why usePathname was the wrong tool, and a test that
    // greps prose fails on its own explanation.
    expect(src.trimStart().startsWith('"use client"')).toBe(false);
    expect(src).not.toContain('from "next/navigation"');
  });
});
