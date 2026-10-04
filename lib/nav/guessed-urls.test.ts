import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";
import { GUIDE_PAGES } from "@/lib/nav/hubs";

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

// ── WHAT THE MIDDLEWARE ACTUALLY ANSWERS (architecture review 2026-09-30) ───
//
// The tests above read the map; these ask the real middleware() and read the
// response, so a redirect that is in the map but never reached — shadowed by
// an earlier rule, or a trailing slash — fails here.

async function ask(path: string) {
  const req = new NextRequest(`https://roulerodrig.com${path}`, {
    headers: { host: "roulerodrig.com" },
  });
  const res = await middleware(req);
  const location = res.headers.get("location");
  return {
    status: res.status,
    to: location ? new URL(location).pathname + new URL(location).hash : null,
  };
}

describe("/local-guide is the guide at /guide", () => {
  it("sends /local-guide to the guide hub, 307", async () => {
    expect(await ask("/local-guide")).toEqual({ status: 307, to: "/guide" });
    expect(await ask("/local-guide/")).toEqual({ status: 307, to: "/guide" });
  });

  it("sends /local-guide/<page> to that guide page when the guide has it", async () => {
    // Every page the guide has, not a sample: GUIDE_PAGES is the complete list.
    for (const g of GUIDE_PAGES) {
      const page = g.href.replace(/^\/guide/, "");
      expect(await ask(`/local-guide${page}`), g.href).toEqual({ status: 307, to: g.href });
      expect(await ask(`/local-guide${page}/`), `${g.href}/`).toEqual({ status: 307, to: g.href });
    }
  });

  it("sends a /local-guide/<page> the guide does not have to the hub, never a made-up URL", async () => {
    for (const path of ["/local-guide/port-mathurin", "/local-guide/beaches/anse-ally", "/local-guide/x"]) {
      expect(await ask(path), path).toEqual({ status: 307, to: "/guide" });
    }
  });

  it("leaves the real guide URLs alone", async () => {
    // /guide/* is indexed and hreflang-paired: nothing here may move it.
    for (const path of ["/guide", "/guide/beaches"]) {
      const res = await ask(path);
      expect(res.to, path).toBeNull();
      expect(res.status, path).toBe(200);
    }
  });
});

describe("/rentals is the Rentals branch of the marketplace", () => {
  it("sends /rentals to /marketplace#rentals, 307", async () => {
    // The anchor is asserted on the rendered page in
    // app/marketplace/marketplace-tree.test.ts.
    expect(await ask("/rentals")).toEqual({ status: 307, to: "/marketplace#rentals" });
  });
});
