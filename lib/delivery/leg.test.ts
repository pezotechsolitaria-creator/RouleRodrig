import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { BEFORE_COLLECTION, legFor } from "./leg";
import { isPoint, navigateUrl, routeUrl } from "../maps/nav";

describe("which end of the job the driver is at", () => {
  it("sends them to the shop until they have the package", () => {
    for (const s of BEFORE_COLLECTION) expect(legFor(s)).toBe("pickup");
  });

  it("sends them to the customer from the moment they do", () => {
    for (const s of ["picked_up", "out_for_delivery", "arrived", "delivered"]) {
      expect(legFor(s)).toBe("dropoff");
    }
  });

  it("guesses dropoff for a status it does not know", () => {
    // The safe end to be wrong about: an unrecognised status is almost
    // certainly a late one, and sending a driver who already has the package
    // back to the shop is the worse mistake.
    expect(legFor("some_status_added_later")).toBe("dropoff");
  });
});

describe("the boundary is defined once", () => {
  it("DriverDashboard no longer writes the boundary out by hand", () => {
    // It had this array inline TWICE. A third inline copy — the one deciding
    // where Navigate points — is exactly how the three drift apart.
    //
    // Matched as an array that ENDS at arrived_at_pickup, not merely one that
    // contains it: `STEPS` in the same file legitimately lists all six
    // statuses in order to draw the progress bar, and a looser pattern flagged
    // that instead.
    const src = readFileSync("app/driver/DriverDashboard.tsx", "utf8");
    expect(src).toContain("legFor");
    expect(src).not.toMatch(/"arrived_at_pickup",?\s*\]/);
  });
});

describe("a link that actually navigates", () => {
  it("starts turn-by-turn instead of dropping a pin", () => {
    // The driver console shipped /maps/search/, which lands on a marker the
    // driver must then tap through twice to get guidance.
    const url = navigateUrl(-19.7, 63.42);
    expect(url).toContain("dir_action=navigate");
    expect(url).not.toContain("/search");
    expect(url).toContain("destination=-19.7,63.42");
  });

  it("shows a whole route without hijacking the screen", () => {
    const url = routeUrl({ lat: -19.68, lng: 63.4 }, { lat: -19.75, lng: 63.45 });
    expect(url).toContain("origin=-19.68,63.4");
    expect(url).toContain("destination=-19.75,63.45");
    // They are sitting still deciding what to bid, not driving.
    expect(url).not.toContain("dir_action=navigate");
  });
});

describe("half a coordinate is not a place", () => {
  it("rejects nulls, either side", () => {
    expect(isPoint(-19.7, null)).toBe(false);
    expect(isPoint(null, 63.4)).toBe(false);
    expect(isPoint(undefined, undefined)).toBe(false);
  });

  it("rejects 0,0", () => {
    // The Gulf of Guinea. On an island at -19.7, 63.4 this is always a missing
    // value that survived a `?? 0`, never a destination.
    expect(isPoint(0, 0)).toBe(false);
  });

  it("accepts a real Rodrigues pin", () => {
    expect(isPoint(-19.6833, 63.4167)).toBe(true);
  });
});
