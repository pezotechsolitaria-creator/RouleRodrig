import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { execSync } from "node:child_process";

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
  "/authentic":
    "Authentic IS the homepage (lib/worlds.ts -> WORLD_PAGE). This URL shipped for an hour as a second main page, and is kept alive as a redirect to / for anything already shared. Same reasoning as /v2.",
  "/auth/reset-password": "Opened from a password-reset EMAIL. There is nowhere in the app it could be linked from.",
  "/merchant/pickup": "Where a SCANNED pickup QR lands. The same job is reachable by clicking via the code box on /merchant/orders.",
  "/r/[token]":
    "The taxi driver's screen, opened from a WhatsApp link sent to that driver. Taxi drivers have no accounts by decision, so the token IS the credential and there is nowhere in the app it could be linked from.",
  "/d":
    "The driver's way back in after losing their link: phone number plus a 6-character code the owner reads out. Deliberately unlinked — a public \"drivers sign in here\" entry invites strangers to guess codes, and every real driver arrives with the address said out loud or already on their home screen.",
  "/d/[token]":
    "The driver's permanent home, bookmarked from the same WhatsApp link. Identical reasoning to /r/[token] — the token IS the credential, the page is noindex, and linking it anywhere would publish somebody's identity.",
  "/c/[token]":
    "A courier's screen, opened from a link the SHOP sends them (M173). These people work for the restaurant, not for Roulé Rodrigues — no account, no application, nothing to sign into — so the token IS the credential, exactly as for /d/[token]. The page is noindex, and the only place it could be linked from is the merchant's own courier list, which shows the link to copy rather than following it.",
};

/**
 * Files git actually tracks.
 *
 * The rule is about the SHIPPED site, and this repo is often worked on by two
 * sessions at once — an untracked half-built page is somebody mid-thought, not
 * a broken promise to a visitor. Restricting to tracked files means work in
 * progress never turns the suite red for everyone else, while the check still
 * bites on the commit that adds the page, which is the moment that matters.
 */
let trackedCache: Set<string> | null = null;
function tracked(): Set<string> {
  if (trackedCache) return trackedCache;
  const out = execSync("git ls-files", { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  // git reports POSIX separators; normalise to this platform so these paths
  // can be compared with what walk() produces.
  const rows = out.split("\n").map((f) => f.trim()).filter(Boolean);
  trackedCache = new Set(rows.map((f) => f.split("/").join(sep)));
  return trackedCache;
}

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
  const files = tracked();
  return walk(ROUTE_ROOT)
    .filter((f) => f.endsWith("page.tsx") && files.has(f))
    .map(routeOf)
    .filter((r) => !r.startsWith("/api"));
}

/**
 * The private consoles. Everything under these is signed-in staff territory:
 * the owner's rule is that PUBLIC pages must never need a typed URL, and that
 * the admin dashboard is the deliberate exception — reachable only by someone
 * who already knows it is there.
 */
const PRIVATE_PREFIXES = ["/admin", "/merchant", "/kitchen", "/driver", "/organizer"];
const isPrivate = (r: string) => PRIVATE_PREFIXES.some((p) => r === p || r.startsWith(`${p}/`));

type LinkSite = { target: string; fromFile: string; fromPrivate: boolean; dynamic: boolean };

/**
 * Every clickable path, WITH the file it lives in.
 *
 * Where the link lives is the whole point. A public page linked only from
 * inside /admin has a link and is still unreachable to a visitor — which is
 * exactly the failure the owner is describing when he says a page should not
 * need someone to type a slash.
 */
function linkSites(): LinkSite[] {
  const out: LinkSite[] = [];
  // The last one captures only the STATIC PREFIX of an interpolated href, so
  // `href={`/browse/${category}`}` yields "/browse". That is a real link for
  // the reachability test — it proves /browse/[category] can be clicked to —
  // and NOT a destination anybody visits, which matters to the "every link
  // lands somewhere" test below: /browse itself is not a page, and reporting it
  // as a dead link would be a false alarm on four correct call sites.
  const patterns: { re: RegExp; dynamic: boolean }[] = [
    { re: /href\s*=\s*["'`](\/[^"'`?#${]*)/g, dynamic: false },          // <Link href="/x">
    { re: /href:\s*["'`](\/[^"'`?#${]*)/g, dynamic: false },             // { href: "/x" } nav tables
    { re: /(?:push|replace|redirect)\(\s*["'`](\/[^"'`?#${]*)/g, dynamic: false },
    { re: /href\s*=\s*\{?[`"'](\/[a-z0-9\-/]*)\$\{/gi, dynamic: true },  // href={`/shop/${slug}`}
  ];

  for (const dir of SCAN_DIRS) {
    for (const file of walk(dir)) {
      if (!/\.(tsx?|mjs)$/.test(file)) continue;
      // ── A TEST FILE IS NOT A PAGE ───────────────────────────────────
      // It ships to nobody, renders nothing and cannot put a link in front of
      // a visitor — but it quotes routes constantly, which is its job:
      // `expect(shell).toMatch(/href: "\/admin\/deliveries"/)`.
      //
      // Wrong in BOTH directions, which is why it is worth the line:
      //   · lib/services/admin-desk.test.ts was reported as a public page
      //     leaking the back door, and
      //   · an orphaned page would count as "reachable" because a test
      //     mentioned its path — hiding the exact fault this file exists for.
      //
      // (Two identical guards stood here after a rebase, each with its own
      // comment saying the same thing. One is enough.)
      if (/\.test\.tsx?$/.test(file)) continue;
      if (!tracked().has(file)) continue;
      const s = readFileSync(file, "utf8");
      const asRoute = file.startsWith(ROUTE_ROOT) ? norm(routeOf(file)) : null;
      // A file is "private" if it IS a private route, or lives in a private
      // folder (components/merchant/…, lib/admin/…).
      const fromPrivate =
        (asRoute !== null && isPrivate(asRoute)) ||
        // BOTH separators. This ran on Windows with only the forward slash and
        // classified components\admin\AdminShell.tsx as PUBLIC, reporting 74
        // internal admin links as leaks — a false alarm loud enough to bury a
        // real one.
        /[\\/](admin|merchant|kitchen|driver|organizer)[\\/]/.test(file);

      for (const { re, dynamic } of patterns) {
        for (const m of s.matchAll(re)) {
          // ── IS THIS THE WHOLE PATH, OR JUST ITS PREFIX? ────────────────
          // The first three patterns stop at `$`, so `href: `/browse/${cat}``
          // is captured as "/browse" by an expression that is not the
          // interpolation pattern at all. Deciding by which regex matched got
          // that wrong and reported two correct call sites as broken links.
          //
          // The source itself answers it: if a `${` sits immediately after
          // what was captured, the captured text is a prefix and not a
          // destination.
          const after = s.slice(m.index + m[0].length, m.index + m[0].length + 2);
          out.push({
            target: norm(m[1]),
            fromFile: file,
            fromPrivate,
            dynamic: dynamic || after.startsWith("${"),
          });
        }
      }
    }
  }
  return out;
}

/** Paths referenced in a way a person could actually click or be sent to. */
function clickableTargets(): Set<string> {
  return new Set(linkSites().map((l) => l.target));
}

// ── AND THE OTHER DIRECTION: EVERY LINK MUST LAND SOMEWHERE ────────────────
//
// The test below asserts that every page has a link. It says nothing about
// whether a link has a PAGE — and that is the direction a visitor actually
// experiences, as a 404.
//
// The two failures look nothing alike. An unlinked page is invisible: nobody
// complains, because nobody knew it was there. A link to a page that does not
// exist is the opposite — somebody clicks it, on purpose, and the site tells
// them they are lost. It also survives every other check in this repo: a
// wrong href type-checks, builds, renders and passes the crawl right up to the
// moment it is clicked.
//
// Routes with parameters are matched by SHAPE, so /shop/foo/bar satisfies
// /shop/[storeSlug]/[productSlug]. Whether that particular shop exists is a
// data question and belongs to the page, which is entitled to 404 an unknown
// slug. What is checked here is that the ROUTE exists at all.

/** Turn /shop/[a]/[b] into a matcher, honouring catch-alls. */
function routeMatcher(route: string): RegExp {
  const body = route
    .split("/")
    .map((seg) => {
      if (/^\[\[\.\.\..+\]\]$/.test(seg)) return "(?:/.*)?";   // [[...opt]]
      if (/^\[\.\.\..+\]$/.test(seg)) return "/.+";              // [...all]
      if (/^\[.+\]$/.test(seg)) return "/[^/]+";                 // [one]
      return seg === "" ? "" : "/" + seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("");
  return new RegExp(`^${body || "/"}$`);
}

describe("every link lands somewhere", () => {
  const routes = allRoutes();
  const matchers = routes.map(routeMatcher);

  /** Paths that are real URLs but not Next pages in this repo. */
  const NOT_A_PAGE: RegExp[] = [
    /^\/api\//,                      // route handlers, not pages
    /^\/_next\//,
    /\.(xml|txt|json|ico|png|jpe?g|svg|webp|pdf|webmanifest)$/i,
  ];

  it("has no link pointing at a route that does not exist", () => {
    const dead = new Map<string, Set<string>>();

    for (const site of linkSites()) {
      const target = norm(site.target.split("?")[0]);
      if (NOT_A_PAGE.some((re) => re.test(target))) continue;

      // An interpolated href yields only its static prefix, and the prefix is
      // not somewhere anybody goes: `href={`/browse/${category}`}` gives
      // "/browse", which is not a page and is not meant to be. Checking it as a
      // destination reported four correct call sites as broken. What IS worth
      // checking is that the prefix leads somewhere at all — a typo like
      // /browes/${x} still has no route beneath it.
      if (site.dynamic) {
        const prefix = target === "/" ? "/" : `${target}/`;
        if (routes.some((r) => r === target || r.startsWith(prefix))) continue;
      } else if (matchers.some((re) => re.test(target))) {
        continue;
      }

      if (!dead.has(target)) dead.set(target, new Set());
      dead.get(target)!.add(site.fromFile);
    }

    const report = [...dead.entries()]
      .map(([t, files]) => `${t}  <- ${[...files].join(", ")}`)
      .sort();

    expect(
      report,
      `These links go nowhere. Every one is a 404 waiting for somebody to click it:\n  ${report.join("\n  ")}`,
    ).toEqual([]);
  });

  it("finds routes and links at all (tripwire against matching nothing)", () => {
    // Without this the assertion above passes loudly when a refactor breaks the
    // scanners — zero links against zero routes is a green test that checks
    // nothing, which is the failure mode this whole file exists to prevent.
    expect(routes.length).toBeGreaterThan(40);
    expect(linkSites().length).toBeGreaterThan(80);
  });
});

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

  it("no PUBLIC page is reachable only from inside a staff console", () => {
    const sites = linkSites();
    const stranded: string[] = [];

    for (const route of routes) {
      const n = norm(route);
      if (isPrivate(n) || n in ALLOWED_WITHOUT_LINKS) continue;
      const into = sites.filter((l) => l.target === n);
      if (into.length === 0) continue; // the orphan test above owns this case
      // A link that exists only inside /admin does not help a visitor: they
      // would still have to type the path, which is the thing being banned.
      if (into.every((l) => l.fromPrivate)) {
        stranded.push(`${route} (only linked from ${[...new Set(into.map((l) => l.fromFile))].join(", ")})`);
      }
    }

    expect(
      stranded.sort(),
      `Public pages a visitor cannot click to; only linked from staff screens: ${stranded.join(" | ")}`,
    ).toEqual([]);
  });

  it("never links the admin dashboard from a public page", () => {
    // The owner's one deliberate exception: "all pages accessible... except for
    // admin dashboard of course." A public link to /admin advertises the back
    // door to every visitor and every crawler.
    const leaks = linkSites()
      .filter((l) => l.target.startsWith("/admin") && !l.fromPrivate)
      .map((l) => `${l.target} ← ${l.fromFile}`);

    expect(leaks.sort(), `Admin is linked from public files: ${leaks.join(" | ")}`).toEqual([]);
  });

  it("keeps the allowlist honest — every exception still exists", () => {
    const known = new Set(routes.map(norm));
    const stale = Object.keys(ALLOWED_WITHOUT_LINKS).filter((r) => !known.has(norm(r)));
    // An allowlist entry for a deleted page is dead weight that hides the next
    // real orphan behind a name nobody recognises.
    expect(stale, `Allowlisted pages that no longer exist: ${stale.join(", ")}`).toEqual([]);
  });
});
