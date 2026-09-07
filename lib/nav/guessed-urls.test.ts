import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MW = readFileSync("middleware.ts", "utf8");

// ── The URLs nobody links but everybody types ───────────────────────────────
//
// /contact is the most guessed URL on any website and /stays is the obvious
// short form of /browse/stays. Neither was ever linked from this site, so no
// reachability test could have caught them — a link check can only check links
// — and both returned the not-found screen while the real page sat one segment
// away.

describe("guessed URLs land on real pages", () => {
  const entries = [...MW.matchAll(/'(\/[^']*)':\s*'([^']+)'/g)]
    .map((m) => ({ from: m[1], to: m[2] }))
    .filter((e) => MW.slice(MW.indexOf("const GUESSED"), MW.indexOf("const guessed")).includes(e.from));

  it("finds the map at all (tripwire)", () => {
    expect(entries.length).toBeGreaterThan(1);
  });

  /**
   * Does app/ hold a page for this path? Walks the segments, allowing a
   * [param] directory to stand in for a concrete one — /browse/stays is served
   * by app/browse/[category]/page.tsx and there is no "stays" folder to find.
   * Checking for a literal directory reported a working redirect as broken.
   */
  const resolves = (path: string): boolean => {
    const segs = path.split("/").filter(Boolean);
    let dirs = ["app"];
    for (const seg of segs) {
      const next: string[] = [];
      for (const d of dirs) {
        if (existsSync(join(d, seg))) next.push(join(d, seg));
        if (!existsSync(d)) continue;
        for (const child of readdirSync(d)) {
          // [slug], [...all] and route groups (x) all match without consuming.
          if (/^\[.+\]$/.test(child)) next.push(join(d, child));
          else if (/^\(.+\)$/.test(child) && existsSync(join(d, child, seg))) {
            next.push(join(d, child, seg));
          }
        }
      }
      if (next.length === 0) return false;
      dirs = next;
    }
    return dirs.some((d) => existsSync(join(d, "page.tsx")));
  };

  it("sends every guess somewhere that exists", () => {
    // A redirect to a 404 is worse than the 404 it replaced: it looks handled.
    const dead = entries.filter(({ to }) => {
      const path = to.split("#")[0].replace(/\/+$/, "");
      if (path === "") return false; // "/" — the homepage, always there
      return !resolves(path);
    });
    expect(dead.map((d) => `${d.from} -> ${d.to}`)).toEqual([]);
  });

  it("is a fixed list, never a fuzzy match", () => {
    // A "send them to the nearest page" rule turns typos into confident wrong
    // answers. A 404 that admits it is better than a page that lies.
    const block = MW.slice(MW.indexOf("const GUESSED"), MW.indexOf("const guessed"));
    expect(block).toMatch(/Record<string, string>/);
    expect(block).not.toMatch(/startsWith|includes|levenshtein|fuzzy/i);
  });

  it("redirects temporarily, so a destination can still move", () => {
    const at = MW.indexOf("const guessed");
    expect(MW.slice(at, at + 400)).toMatch(/307/);
  });
});
