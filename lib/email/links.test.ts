import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// ── A LINK IN AN EMAIL CANNOT BE FIXED AFTER IT IS SENT ─────────────────────
//
// lib/email.ts pointed the "we couldn't get you that one" email at
// /browse/scooterS. The plural is a 404. That email exists to catch a customer
// whose booking has just failed, and "See what else is available" was its ONLY
// recovery link — so the one message the platform sends to somebody it has
// already disappointed ended at a dead end, on production, for months.
//
// A page can be fixed the moment somebody notices. An email is in an inbox
// forever. So every internal link every template builds is checked here
// against the routes that actually exist on disk.

const ROOT = process.cwd();
const APP = join(ROOT, "app");

/** Every route the App Router actually serves, as a matchable pattern. */
function routes(dir = APP, prefix = "", out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (!statSync(full).isDirectory()) {
      if (/^(page|route)\.(tsx|ts)$/.test(entry)) out.push(prefix || "/");
      continue;
    }
    // (groups) do not appear in the URL; @slots and _private are not routes.
    if (entry.startsWith("_")) continue;
    if (entry.startsWith("(") && entry.endsWith(")")) {
      routes(full, prefix, out);
      continue;
    }
    routes(full, `${prefix}/${entry}`, out);
  }
  return out;
}

const ROUTES = routes();

/** Does a concrete path match a route, allowing for [dynamic] segments? */
function serves(path: string): boolean {
  const want = path.split("/").filter(Boolean);
  return ROUTES.some((r) => {
    const have = r.split("/").filter(Boolean);
    if (have.length !== want.length) {
      // A catch-all [...slug] swallows the rest.
      const star = have.findIndex((s) => s.startsWith("[..."));
      if (star < 0 || want.length < star) return false;
      return have.slice(0, star).every((s, i) => s.startsWith("[") || s === want[i]);
    }
    return have.every((s, i) => s.startsWith("[") || s === want[i]);
  });
}

/** Internal paths every email template builds. */
function emailLinks(): { file: string; path: string }[] {
  const files = ["lib/email.ts", "lib/notifications/order-placed.ts", "lib/notifications/order-events.ts"];
  const found: { file: string; path: string }[] = [];
  for (const f of files) {
    let src: string;
    try {
      src = readFileSync(join(ROOT, f), "utf8");
    } catch {
      continue;
    }
    // `${SITE_URL}/x/y` and the hard-coded https://roulerodrig.com/x/y form.
    const patterns = [
      /\$\{SITE_URL\}(\/[A-Za-z0-9\-_/]*)/g,
      /https:\/\/roulerodrig\.com(\/[A-Za-z0-9\-_/]*)/g,
    ];
    for (const re of patterns) {
      for (const m of src.matchAll(re)) {
        const path = m[1].replace(/\/$/, "");
        if (path) found.push({ file: f, path });
      }
    }
  }
  return found;
}

describe("every link an email sends leads somewhere", () => {
  it("found the routes and the links at all", () => {
    // Tripwires: an empty list on either side makes the real test vacuous,
    // which is how a walker with a wrong root reports success.
    expect(ROUTES.length).toBeGreaterThan(100);
    expect(ROUTES).toContain("/browse/[category]");
    expect(emailLinks().length).toBeGreaterThan(5);
  });

  it("no template points at a route that does not exist", () => {
    const dead = emailLinks()
      .filter(({ path }) => !serves(path))
      .map(({ file, path }) => `${file} -> ${path}`);
    expect([...new Set(dead)]).toEqual([]);
  });

  it("the scooter browse path is singular, because the plural 404s", () => {
    // Named explicitly so a regression reports the actual mistake rather than
    // "some path does not resolve".
    const src = readFileSync(join(ROOT, "lib", "email.ts"), "utf8");
    expect(src).not.toContain("/browse/scooters");
    expect(serves("/browse/scooter")).toBe(true);
  });
});

describe("the route matcher itself", () => {
  it("accepts a real static route and a real dynamic one", () => {
    expect(serves("/faq")).toBe(true);
    expect(serves("/browse/scooter")).toBe(true);
    expect(serves("/browse/scooter/avenis-125cc")).toBe(true);
  });

  it("rejects a path with no route shape at all", () => {
    expect(serves("/no-such-page-anywhere")).toBe(false);
    // There is no app/browse/page.tsx — /browse/[category] needs its segment,
    // so a bare /browse is a 404 and the matcher says so.
    expect(serves("/browse")).toBe(false);
  });

  it("knows what it CANNOT catch, which is why the check below exists", () => {
    // /browse/scooters matches /browse/[category] structurally — the router
    // serves it and the PAGE then calls notFound(). A shape check can never
    // see that, so a bad dynamic VALUE needs its own test.
    expect(serves("/browse/scooters")).toBe(true);
  });
});

// ── THE HALF A SHAPE CHECK CANNOT SEE ───────────────────────────────────────
//
// /browse/scooters matched /browse/[category] perfectly well. The router
// served it, the page looked the category up, found nothing and called
// notFound() — so the link was structurally valid and still a 404. The only
// way to catch that is to check the VALUE against the categories the page
// actually handles.
describe("a dynamic segment in an email is a value the page handles", () => {
  const BROWSE_PAGE = readFileSync(
    join(ROOT, "app", "browse", "[category]", "page.tsx"), "utf8",
  );

  /** The keys of the page's META map — the categories it will render. */
  const handled = (() => {
    const at = BROWSE_PAGE.indexOf("const META");
    const open = BROWSE_PAGE.indexOf("{", BROWSE_PAGE.indexOf("=", at));
    let depth = 0, end = open;
    for (let i = open; i < BROWSE_PAGE.length; i++) {
      if (BROWSE_PAGE[i] === "{") depth++;
      else if (BROWSE_PAGE[i] === "}" && --depth === 0) { end = i; break; }
    }
    const body = BROWSE_PAGE.slice(open, end);
    return new Set(
      [...body.matchAll(/^\s{2}([a-z][a-z-]*):\s*\{/gm)].map((m) => m[1]),
    );
  })();

  it("reads the categories the page declares", () => {
    expect(handled.size).toBeGreaterThan(2);
    expect(handled.has("scooter")).toBe(true);
    expect(handled.has("car")).toBe(true);
    // The exact mistake that shipped.
    expect(handled.has("scooters")).toBe(false);
  });

  it("every /browse link in an email names one of them", () => {
    const bad = emailLinks()
      .map(({ file, path }) => ({ file, path, m: /^\/browse\/([^/]+)/.exec(path) }))
      .filter(({ m }) => m && !handled.has(m[1]))
      .map(({ file, path }) => `${file} -> ${path}`);
    expect([...new Set(bad)]).toEqual([]);
  });
});
