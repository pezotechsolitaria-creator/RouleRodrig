import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ── ZERO BOOKINGS MUST MEAN ZERO BOOKINGS ───────────────────────────────────
//
// Sentry, /admin/content: `TypeError: Load failed` — Safari's wording for a
// fetch that never completed, from a phone that lost signal mid-request.
//
// The dashboard's load() was `try { ... } finally { ... }` with NO catch. One
// rejected fetch in the Promise.all skipped every setState, while `finally`
// still cleared the spinner. The owner was left looking at zero bookings, zero
// enquiries and zero revenue — rendered in the normal cards, indistinguishable
// from a genuinely quiet day.
//
// This is the same failure the kitchen board had, and it is the one a service
// screen must never have: losing the server cannot look like the answer.

const SRC = readFileSync(join(process.cwd(), "app/admin/AdminDashboard.tsx"), "utf8");

/** The dashboard's own load(), not the twenty other try blocks in this file. */
function loadFn(): string {
  const start = SRC.indexOf("async function load() {");
  expect(start, "load() has been renamed or removed").toBeGreaterThan(-1);
  return SRC.slice(start, start + 1800);
}

describe("the admin dashboard tells you when it could not load", () => {
  it("catches a rejected fetch instead of only running finally", () => {
    const fn = loadFn();
    expect(fn).toMatch(/\}\s*catch\s*\(/);
    expect(fn).toContain("setLoadError(true)");
  });

  it("clears the error once a load succeeds", () => {
    expect(loadFn()).toContain("setLoadError(false)");
  });

  it("renders an alert rather than a wall of zeros", () => {
    expect(SRC).toMatch(/\) : loadError \? \(/);
    expect(SRC).toContain('role="alert"');
    expect(SRC).toContain("Couldn&apos;t load today&apos;s numbers");
  });

  it("says it is a connection problem, not a quiet day", () => {
    // The wording is the fix. A generic "something went wrong" would leave the
    // owner wondering whether the zeros were real.
    expect(SRC).toContain("not a quiet day");
  });

  it("offers a retry that calls the same loader", () => {
    const panel = SRC.slice(SRC.indexOf("Couldn&apos;t load today&apos;s numbers"));
    expect(panel.slice(0, 900)).toMatch(/onClick=\{load\}/);
  });

  it("does not leave the mount effect's promise unhandled", () => {
    expect(SRC).toMatch(/useEffect\(\(\) => \{\s*void load\(\);/);
  });
});
