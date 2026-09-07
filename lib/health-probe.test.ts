import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ── ASKING FOR A PROBE THAT DOES NOT EXIST IS NOT A TYPO ────────────────────
//
// /api/health takes ?probe=live for a liveness check that touches nothing, and
// treats EVERYTHING ELSE as the readiness check, which runs about six Supabase
// round-trips. That default is right for an uptime monitor hitting /api/health
// with no query at all.
//
// It is a trap for a caller that invents a probe name. BuildWatcher asked for
// ?probe=build for months. There is no such probe, so every public page load —
// plus every return to the tab, plus a fifteen-minute timer — ran a full
// dependency check to read one 8-character build id that the cheap response
// already carries. It failed silently, because a readiness response contains a
// superset of what the caller wanted.

const ROUTE = readFileSync(join(process.cwd(), "app/api/health/route.ts"), "utf8");

/** The probe values the route actually implements as a distinct cheap path. */
function implementedProbes(): string[] {
  return Array.from(ROUTE.matchAll(/probe === "([a-z]+)"/g)).map((m) => m[1]);
}

describe("every caller asks for a probe the route implements", () => {
  it("knows which probes exist", () => {
    expect(implementedProbes()).toContain("live");
  });

  it("BuildWatcher uses the cheap one, and does not invent a name", () => {
    const src = readFileSync(join(process.cwd(), "components/BuildWatcher.tsx"), "utf8");
    const asked = Array.from(src.matchAll(/\/api\/health\?probe=([a-z]+)/g)).map((m) => m[1]);

    expect(asked.length, "BuildWatcher no longer calls /api/health").toBeGreaterThan(0);
    for (const probe of asked) {
      expect(
        implementedProbes(),
        `BuildWatcher asks for ?probe=${probe}, which /api/health does not implement — ` +
          `so it silently runs the full readiness check on every page load`,
      ).toContain(probe);
    }
  });

  it("the liveness branch touches no database", () => {
    const live = ROUTE.slice(ROUTE.indexOf('probe === "live"'));
    const body = live.slice(0, live.indexOf("const started"));
    expect(body).not.toMatch(/supabase|\.from\(|createClient/i);
  });
});
