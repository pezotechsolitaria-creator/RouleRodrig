import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// ── "THE ERROR IS THAT IT WAS NOT LOADING THE PAGES" ────────────────────────
//
// The owner, after watching me redesign a screen that was not the problem.
//
// Both navigation fallbacks in the service worker ended:
//
//     return (await cache.match(request)) || (await cache.match(SHELL)) || ...
//
// SHELL is "/". So ANY navigation whose fetch threw — a bad mobile connection,
// a cold serverless start, a route still compiling — was answered with the
// CACHED HOMEPAGE, under the URL the customer had actually asked for. Next
// then hydrated it as the homepage and corrected the location to "/".
//
// A customer opening their delivery link lands on the front page. From the
// outside that is "the app lost my delivery", and it needs a flaky connection,
// not an offline one — which on Rodrigues is Tuesday.
//
// I reproduced this myself while working, opening /deliver/<id> and landing on
// the homepage, and wrote it off as "a stale first load".
//
// A wrong page rendered confidently is worse than an honest error, because the
// person reading it cannot tell that it is wrong. That is the rule below.

const SW = readFileSync(join(process.cwd(), "public/sw.js"), "utf8");
// The fix comments quote the old code to explain it, so a naive scan matches
// its own explanation. Same trap as lib/island-map-seam.test.ts.
const code = SW.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("a failed navigation never returns another page's HTML", () => {
  it("has no unguarded shell fallback left", () => {
    // The exact shape of the bug, in both places it appeared.
    expect(code).not.toMatch(/\|\|\s*\(await cache\.match\(SHELL\)\)/);
    expect(code).not.toMatch(/\|\|\s*\(await caches\.match\(SHELL\)\)/);
  });

  it("only reaches for the shell on the shell's own URL", () => {
    // Every remaining SHELL read must sit inside a pathname === "/" guard.
    const uses = [...code.matchAll(/match\(SHELL\)/g)];
    expect(uses.length, "no shell fallback at all — did the guard go too far?")
      .toBeGreaterThan(0);
    for (const u of uses) {
      const before = code.slice(Math.max(0, u.index! - 260), u.index!);
      expect(before, "a shell fallback with no pathname guard").toMatch(
        /url\.pathname === "\/"/,
      );
    }
  });

  it("still serves the SAME page from cache when it has it", () => {
    // Stale but correct is the whole point of an offline cache. Removing this
    // would trade a wrong page for no page, which is not the fix.
    expect(code).toMatch(/const mine = await cache\.match\(request\)/);
  });

  it("answers with an offline page instead", () => {
    expect(code).toMatch(/return offlinePage\(url\)/);
    expect(code).toMatch(/function offlinePage\(url\)/);
  });
});

describe("the offline page", () => {
  it("keeps the URL the customer asked for", () => {
    // So the retry lands back on their delivery, not on the front page — the
    // exact mistake being fixed.
    expect(SW).toMatch(/href="\$\{url\.pathname\}\$\{url\.search\}"/);
  });

  it("is never stored as if it were the page", () => {
    expect(SW).toMatch(/"Cache-Control": "no-store"/);
    expect(SW).toMatch(/status: 503/);
  });

  it("needs nothing from the network to render", () => {
    // It is shown BECAUSE the network is not answering. A stylesheet or a font
    // request here would leave a blank screen.
    const fn = SW.slice(SW.indexOf("function offlinePage"), SW.indexOf("self.addEventListener(\"fetch\""));
    expect(fn).not.toMatch(/<script|<link|src=|@import/);
  });
});

describe("the fix can actually reach a device", () => {
  it("bumps the cache name", () => {
    // A service worker only replaces its cache when the NAME changes. Shipping
    // sw.js without this leaves every existing device on the old behaviour —
    // the file's own changelog records that lesson twice.
    //
    // Compared as a NUMBER. The pattern here was
    // /rr-cache-v(3[5-9][5-9]|[4-9]\d\d)/, which reads as "355 or above" and
    // is not: the last group is [5-9], so it matched v355-v359 and then failed
    // on v360 — the next bump after it was written. A version check that
    // breaks when the version goes up is worse than none, because it fails on
    // somebody else's unrelated commit.
    const m = SW.match(/const CACHE = "rr-cache-v(\d+)"/);
    expect(m, "sw.js has no cache version").not.toBeNull();
    expect(Number(m![1])).toBeGreaterThanOrEqual(355);
  });
});
