import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { legTarget } from "./job-legs";

// ── "NAVIGATE ONLY OPENS THE DELIVERY DESTINATION" ──────────────────────────
//
// The owner, naming both halves of the problem in one sentence: a pickup
// reading "kot pive" with no address and no pin, and a Navigate button that
// went to Port Mathurin — the DROP-OFF — whatever stage the job was at.
//
// Half of that was fixed by pointing the single button at the leg the driver
// is actually on. The other half is that one button still decides for them.
// Both ends are now offered on every card, and a leg with no coordinates
// still gets a map link instead of dead text.

describe("legTarget", () => {
  it("starts turn-by-turn when the point is real", () => {
    const t = legTarget(-19.68, 63.42, "Port Mathurin");
    expect(t?.precise).toBe(true);
    expect(t?.href).toContain("dir_action=navigate");
    expect(t?.href).toContain("-19.68,63.42");
  });

  it("prefers coordinates over the place name", () => {
    // The name is often the vaguer of the two, and where both exist the pin is
    // what the driver came for.
    const t = legTarget(-19.68, 63.42, "kot pive");
    expect(t?.href).not.toContain("kot");
  });

  it("still gives a named place somewhere to tap", () => {
    // "kot pive" is a real Rodriguan direction with no coordinates behind it.
    // The card used to print it as text with no map at all.
    const t = legTarget(null, null, "kot pive");
    expect(t).not.toBeNull();
    expect(t?.precise).toBe(false);
    expect(decodeURIComponent(t!.href)).toContain("kot pive");
  });

  it("searches on the right island", () => {
    // "Port Mathurin" alone finds a street in three other countries first.
    const t = legTarget(null, null, "Port Mathurin");
    expect(decodeURIComponent(t!.href)).toContain("Rodrigues");
  });

  it("says when a result is approximate", () => {
    // A driver who trusts a name search as a pin ends up in the wrong village
    // and blames the app.
    expect(legTarget(null, null, "kot pive")?.label).toMatch(/no exact pin/i);
  });

  it("returns nothing when there is nothing to point at", () => {
    expect(legTarget(null, null, null)).toBeNull();
    expect(legTarget(null, null, "   ")).toBeNull();
  });

  it("refuses 0,0", () => {
    // The Gulf of Guinea. On an island at -19.7, 63.4 this is always a missing
    // value that survived a `?? 0`, never a destination — and it must fall
    // through to the name rather than routing a driver into the Atlantic.
    const t = legTarget(0, 0, "kot pive");
    expect(t?.precise).toBe(false);
  });
});

describe("the driver card offers both ends", () => {
  const SRC = readFileSync(
    join(process.cwd(), "app/driver/DriverDashboard.tsx"),
    "utf8",
  );
  // The comments quote the bug to explain it. Same trap as
  // lib/island-map-seam.test.ts.
  const code = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("renders a pickup target and a drop-off target, not one of them", () => {
    expect(code).toMatch(/legTarget\(a\.pickupLat, a\.pickupLng, a\.storeAddress\)/);
    expect(code).toMatch(/legTarget\(a\.dropoffLat, a\.dropoffLng, a\.dropoffNote\)/);
  });

  it("emphasises the leg the driver is on rather than hiding the other", () => {
    // `leg === which` picks the GOLD button. If this became a filter, the card
    // would be back to one destination chosen for the driver.
    expect(code).toMatch(/leg === which/);
    expect(code).not.toMatch(/\.filter\(\(\[which/);
  });

  it("no longer has a single navigate button keyed on the leg", () => {
    expect(code).not.toMatch(/leg === "pickup" \? "Navigate to pickup"/);
  });
});
