import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// ── ONE PAGE, ONE SET OF READS ──────────────────────────────────────────────
//
// getFleetView() fires four privileged Supabase queries. A Next page that needs
// it in BOTH generateMetadata and its body calls it twice, and nothing deduped
// them — so /browse/[category], /experiences/[type] and three of the French
// pages were each doing EIGHT reads to render one page.
//
// Measured, not assumed: with a probe inside the function, one request logged
// two calls; wrapped in cache(), one request logs one. The control was run by
// swapping cache() for an identity wrapper and watching it go back to two.
//
// React's cache() is request-scoped, which is the right scope — two calls while
// rendering one page share an answer, the next visitor still gets fresh
// sold-out state.

const SRC = readFileSync(join(process.cwd(), "lib/site-data.ts"), "utf8");

describe("getFleetView is deduped per request", () => {
  it("is wrapped in React's cache()", () => {
    expect(SRC).toMatch(/import \{ cache \} from "react"/);
    expect(SRC).toMatch(/export const getFleetView = cache\(async \(\) => \{/);
  });

  it("is not a bare async function again", () => {
    // The regression this guards: someone "tidies" it back to a plain export
    // and silently doubles the query count on five public pages.
    expect(SRC).not.toMatch(/export async function getFleetView/);
  });

  it("left no debugging probe behind", () => {
    expect(SRC).not.toContain("FLEETVIEW-PROBE");
    expect(SRC).not.toMatch(/\(\(f\) => f\)\(/);
  });
});

describe("the pages that ask twice", () => {
  function pagesCallingTwice(): string[] {
    const out: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (name === "node_modules" || name === ".next" || name.startsWith(".")) continue;
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (name === "page.tsx") {
          const src = readFileSync(full, "utf8");
          const calls = (src.match(/await getFleetView\(\)/g) ?? []).length;
          if (calls > 1) out.push(full.replace(process.cwd(), ""));
        }
      }
    };
    walk(join(process.cwd(), "app"));
    return out;
  }

  it("still exist, so the cache is still earning its keep", () => {
    // Not a failure condition — this documents WHY the wrapper is there. If
    // this ever returns nothing, the cache() is harmless but no longer load
    // bearing, and the comment above should be revisited rather than trusted.
    const twice = pagesCallingTwice();
    expect(twice.length).toBeGreaterThan(0);
  });
});
