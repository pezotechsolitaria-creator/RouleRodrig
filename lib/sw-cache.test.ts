import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The service worker's cache name is written in two places that cannot import
// from each other: public/sw.js is served as a static file, so it can never
// reach into the app bundle, and /api/health mirrors the value so a deploy can
// be checked without opening devtools.
//
// That duplication has drifted twice — health said v96 while the worker was on
// v110, then v126 against v127 — each time because the rule was "remember to
// bump both". This test is that rule, enforced. It fails the moment the two
// disagree, which is the moment it is cheap to fix.
//
// It deliberately re-parses both files from disk rather than importing the
// route: importing would pull in Supabase and the email layer for a string
// comparison, and would stop being a test of what actually ships.

const ROOT = process.cwd();

function readCacheName(relPath: string, pattern: RegExp): string {
  const source = readFileSync(join(ROOT, relPath), "utf8");
  const match = source.match(pattern);
  if (!match) {
    throw new Error(
      `Could not find the cache name in ${relPath}. If it was renamed or reformatted, ` +
        `update this test — do not delete it, or the two copies drift again.`,
    );
  }
  return match[1];
}

describe("service worker cache version", () => {
  const worker = readCacheName("public/sw.js", /CACHE\s*=\s*"(rr-cache-v\d+)"/);
  const health = readCacheName(
    "app/api/health/route.ts",
    /SW_CACHE_VERSION\s*=\s*"(rr-cache-v\d+)"/,
  );

  it("is reported by /api/health exactly as the worker defines it", () => {
    expect(health, `public/sw.js is on ${worker} but /api/health reports ${health}. ` +
      "Bump both — a health endpoint that reports a stale build is worse than one that reports nothing.")
      .toBe(worker);
  });

  it("is a monotonic rr-cache-vN name, so a deploy can be ordered against another", () => {
    expect(worker).toMatch(/^rr-cache-v\d+$/);
    expect(Number(worker.replace("rr-cache-v", ""))).toBeGreaterThan(0);
  });
});
