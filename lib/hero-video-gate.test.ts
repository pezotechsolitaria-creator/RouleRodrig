import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ── THE HERO THAT NEVER APPEARED ON THE OWNER'S PHONE (M141) ────────────────
//
// Reported twice: "the YouTube hero does not appear at all". It could not be
// reproduced on a desktop browser or in a mobile-emulated viewport, because the
// cause was the one thing neither of those has — a real island mobile
// connection.
//
// HeroVideo suppressed itself whenever navigator.connection.effectiveType read
// "2g" or "slow-2g". That value is not a fact about the connection: it is a
// rolling estimate of recent round-trip time, and on Rodrigues it dips into
// "2g" on a link that streams video perfectly well. So the check fired exactly
// in the market this site serves, and never on the wifi it was written on.
//
// `if (!allowed || !current) return null` means a failed gate renders NOTHING,
// so the symptom was a poster that stayed forever with no error anywhere.

const SRC = readFileSync(
  join(__dirname, "..", "components", "HeroVideo.tsx"),
  "utf8",
);
const code = SRC.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

describe("what may suppress the hero video", () => {
  it("no longer guesses from effectiveType", () => {
    // The whole bug. If this returns, the hero disappears on island data again.
    expect(code).not.toMatch(/effectiveType\s*\?\?/);
    expect(code).not.toMatch(/2g\$/);
    expect(code).not.toMatch(/\/\(\^\|-\)2g\$\//);
  });

  it("still honours Data Saver, which the visitor chose deliberately", () => {
    // Different in kind from a guess: they went into settings and asked the
    // browser to spend less of their data.
    expect(code).toMatch(/saveData/);
  });

  it("still honours prefers-reduced-motion", () => {
    // A full-bleed moving background is exactly what that setting exists to
    // suppress. Overriding it to win a hero animation would be wrong.
    expect(code).toMatch(/prefers-reduced-motion: reduce/);
  });

  it("says why when it declines to render, instead of vanishing silently", () => {
    // A hero that quietly decides not to exist is undiagnosable on somebody
    // else's phone — which is why this took two rounds to pin down.
    expect(code).toMatch(/video suppressed/);
  });

  it("keeps the reveal fallback that survives a player which never reports", () => {
    // The other half of this bug, fixed earlier: YouTube can answer the
    // handshake while sitting in CUED and never send PLAYING. Without an
    // absolute deadline the layer stays at opacity 0 over a playing video.
    expect(code).toMatch(/REVEAL_HOLD_MS \+ 2000/);
    expect(code).toMatch(/everPlayed/);
  });
});
