import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, sep } from "node:path";

// ── Every page must be reachable by CLICKING ───────────────────────────────
//
// A standing rule from the owner, repeated many times and in these words:
// "all pages should be accessible to everyone and must not need people to
// extend their url."
//
// It has been broken repeatedly, and never on purpose. A page gets built, the
// link that would reach it is left for later, and the feature is invisible:
// /admin/subscriptions could only be opened by typing it; /admin/operations was
// reported missing when it existed; the Install-app button rendered nothing;
// door staff were invited to a screen with no route to it. Every one of those
// shipped green — a page with no inbound link type-checks and builds perfectly,
// because "unreachable" is a property of the whole app, not of any one file.
//
// So it is asserted here. A new page with no link fails this test on the commit
// that adds it, which is the only moment the fix is cheap.
//
// WHAT COUNTS AS REACHABLE: a clickable reference — href, redirect(),
// router.push/replace. Deliberately NOT any string that merely mentions the
// path: an hreflang entry in `metadata` and a sitemap row are how GOOGLE finds a
// page, not how a person clicks to it. That distinction is the entire point,
// and it is what caught the French guide cluster.

const ROUTE_ROOT = "app";
const SCAN_DIRS = ["app", "components", "lib"];

/**
 * Pages that genuinely have no in-app link, each with the reason it is fine.
 *
 * Keep this list SHORT and argued. "It is hard to link" is not a reason; every
 * entry here is a page whose entry point is something other than a click inside
 * the app.
 */
const ALLOWED_WITHOUT_LINKS: Record<string, string> = {
  "/v2": "Legacy preview URL kept alive for old bookmarks; it just redirects to /.",
  "/auth/reset-password": "Opened from a password-reset EMAIL. There is nowhere in the app it could be linked from.",
  "/merchant/pickup": "Where a SCANNED pickup QR lands. The same job is reachable by clicking via the code box on /merchant/orders.",
};

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/** app/foo/(group)/bar/page.tsx → /foo/bar */
function routeOf(file: string): string {
  let r = file.replace(new RegExp(`^${ROUTE_ROOT}`), "").replace(/[\\/]page\.tsx$/, "");
  r = r.split(sep).join("/").replace(/\/\([^)]*\)/g, "");
  return r === "" ? "/" : r;
}

const norm = (r: string) => r.replace(/\/+$/, "") || "/";

function allRoutes(): string[] {
  return walk(ROUTE_ROOT)
    .filter((f) => f.endsWith("page.tsx"))
    .map(routeOf)
    .filter((r) => !r.startsWith("/api"));
}

/** Paths referenced in a way a person could actually click or be sent to. */
function clickableTargets(): Set<string> {
  const found = new Set<string>();
  for (const dir of SCAN_DIRS) {
    for (const file of walk(dir)) {
      if (!/\.(tsx?|mjs)$/.test(file)) continue;
      const s = readFileSync(file, "utf8");
      const patterns = [
        /href\s*=\s*["'`](\/[^"'`?#${]*)/g,          // <Link href="/x">
        /href:\s*["'`](\/[^"'`?#${]*)/g,             // { href: "/x" } nav tables
        /(?:push|replace|redirect)\(\s*["'`](\/[^"'`?#${]*)/g,
        /href\s*=\s*\{?[`"'](\/[a-z0-9\-/]*)\$\{/gi, // href={`/shop/${slug}`}
      ];
      for (const re of patterns) {
        for (const m of s.matchAll(re)) found.add(norm(m[1]));
      }
    }
  }
  return found;
}

describe("every page is reachable by clicking", () => {
  const routes = allRoutes();
  const clickable = clickableTargets();

  it("finds the routes and the links (tripwire against matching nothing)", () => {
    // A checker that silently finds nothing passes forever. These floors are
    // far below the real numbers and only catch a broken extractor.
    expect(routes.length).toBeGreaterThan(50);
    expect(clickable.size).toBeGreaterThan(50);
  });

  it("has no page that can only be reached by typing a URL", () => {
    const orphans: string[] = [];

    for (const route of routes) {
      const n = norm(route);
      if (n in ALLOWED_WITHOUT_LINKS) continue;
      if (clickable.has(n)) continue;

      // A dynamic route is built at runtime from data, so it is reachable when
      // something links into its static parent — /shop/[slug] is reached from
      // a link whose prefix is /shop.
      if (n.includes("[")) {
        const parent = norm(n.replace(/\/\[[^\]]+\].*$/, ""));
        if (clickable.has(parent)) continue;
        if ([...clickable].some((l) => l === parent || l.startsWith(`${parent}/`))) continue;
      }

      orphans.push(route);
    }

    // Named, not counted: a failure should say which page to link and from where.
    expect(
      orphans.sort(),
      `These pages have no clickable route into them. Add a link, or add an argued entry to ALLOWED_WITHOUT_LINKS:\n  ${orphans.join("\n  ")}`,
    ).toEqual([]);
  });

  it("keeps the allowlist honest — every exception still exists", () => {
    const known = new Set(routes.map(norm));
    const stale = Object.keys(ALLOWED_WITHOUT_LINKS).filter((r) => !known.has(norm(r)));
    // An allowlist entry for a deleted page is dead weight that hides the next
    // real orphan behind a name nobody recognises.
    expect(stale, `Allowlisted pages that no longer exist: ${stale.join(", ")}`).toEqual([]);
  });
});
