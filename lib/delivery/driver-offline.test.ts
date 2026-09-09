import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const src = readFileSync("app/driver/DriverDashboard.tsx", "utf8");

// ── "IT SAYS ERROR" ─────────────────────────────────────────────────────────
//
// A fetch that never connects rejects with a TypeError carrying the BROWSER's
// message, not ours:
//
//   Safari   "Load failed"
//   Chrome   "Failed to fetch"
//   Firefox  "NetworkError when attempting to fetch resource"
//
// That went straight to the driver's screen. Three different English strings,
// none of which tells somebody at a roadside on 3G that their tap never left
// the phone — and, crucially, none of which says whether the step happened.
//
// "Load failed" is not hypothetical here: it is a live Sentry issue on this
// project (ROULE-RODRIGUES-5), which is Safari's wording.
//
// The distinction that matters is that a request which never arrived is SAFE TO
// REPEAT. A driver who does not know that either gives up or taps again while
// afraid they have double-advanced the job.

describe("a driver on a bad signal is told something useful", () => {
  it("a network failure gets our words, not the browser's", () => {
    expect(src).toContain("OFFLINE_MESSAGE");
    expect(src).toMatch(/isNetworkFailure\(e\) \? OFFLINE_MESSAGE : messageFor\(e\)/);
  });

  it("the message says nothing changed, so it is safe to retry", () => {
    // The one fact that decides what they do next.
    const m = src.match(/const OFFLINE_MESSAGE =\s*\n?\s*"([^"]+)"/);
    expect(m).not.toBeNull();
    expect(m![1].toLowerCase()).toContain("nothing has changed");
  });

  it("it does not match on the browser's strings", () => {
    // There are three, they change, and some builds localise them.
    expect(src).not.toMatch(/=== "Load failed"/);
    expect(src).not.toMatch(/includes\("Failed to fetch"\)/);
  });

  it("it uses the signals that are actually reliable", () => {
    expect(src).toMatch(/navigator\.onLine === false/);
    expect(src).toMatch(/e instanceof TypeError/);
  });

  it("our own server messages still reach the driver", () => {
    // "That driver has their hands full", the PIN messages, the payment gate —
    // replacing those with a generic string would be a regression.
    expect(src).toMatch(/function messageFor/);
    expect(src).toMatch(/m && m\.length < 200 \? m :/);
  });
});
