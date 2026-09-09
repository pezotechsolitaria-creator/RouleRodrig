import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ── THE SERVICE WORKER MUST NOT PIN DEV ASSETS ──────────────────────────────
//
// sw.js serves /_next/static/ cache-first. That is correct for a deployed
// build, where Next content-hashes the filenames: a changed file is a changed
// URL, so a cached copy can never be the wrong copy.
//
// It is WRONG in dev. Turbopack reuses chunk names — _03qkajq._.js keeps its
// name while its contents change on every edit — so cache-first pins the first
// copy the browser ever saw and nothing surfaces it.
//
// This cost hours twice in a single session, both times looking like a code
// bug rather than a cache:
//
//   * A CSS fix "did not apply". The server was serving `right: 12px`; the page
//     was running a cached stylesheet without it.
//   * The map "regressed" to pixelated 2016 EOX imagery. The served chunk had
//     the Mapbox URL; the cached chunk predated it. Measured at the time:
//     server 42,384 bytes with Mapbox, SW cache 41,811 bytes with the fallback,
//     same URL.
//
// The second one reached the owner as a bug report about a regression that did
// not exist in the product at all.

const SW = readFileSync(join(process.cwd(), "public/sw.js"), "utf8");

describe("cache-first is for deployed builds only", () => {
  it("guards the /_next/static/ branch on a dev-host check", () => {
    const branch = /if \(sameOrigin &&([^)]*)url\.pathname\.startsWith\("\/_next\/static\/"\)\)/.exec(SW);
    expect(branch, "the /_next/static/ cache-first branch moved or was rewritten").toBeTruthy();
    expect(branch![1]).toContain("!IS_DEV_HOST");
  });

  it("treats localhost, loopback and bare IPs as dev", () => {
    // A phone testing over the LAN hits an IP, and would otherwise pin chunks
    // exactly the same way.
    expect(SW).toMatch(/hostname === "localhost"/);
    expect(SW).toMatch(/hostname === "127\.0\.0\.1"/);
    expect(SW).toMatch(/\{1,3\}\\\.\)\{3\}/);
  });

  it("still caches hashed assets in production", () => {
    // The guard must NARROW the branch, not delete it: a deployed build should
    // keep serving its immutable chunks from cache.
    expect(SW).toMatch(/url\.pathname\.startsWith\("\/_next\/static\/"\)/);
    expect(SW).toContain("caches.open(CACHE)");
  });

  it("keeps navigations network-first, so fresh HTML matches current JS", () => {
    expect(SW).toMatch(/request\.mode === "navigate"/);
    const nav = SW.slice(SW.indexOf('request.mode === "navigate"'));
    expect(nav.slice(0, 400)).toMatch(/const fresh = await fetch\(request\)/);
  });
});
