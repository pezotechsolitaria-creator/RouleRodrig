import { describe, it, expect } from "vitest";
import { liveMapHref, readMapFocus, hasFocus } from "./live-focus";

// ── THE LINK AND THE PAGE HAVE TO AGREE ─────────────────────────────────────
//
// Two halves written in different files: a dispatch row builds a URL, and a
// server component reads it back. Nothing at runtime tells you when they stop
// agreeing — a renamed parameter just means the map opens unfocused, which
// looks like a map that works. So the contract is tested by round-tripping it
// rather than by asserting the string shape on each side separately.

/** Build a link, read it back the way the page does. */
function roundTrip(input: Parameters<typeof liveMapHref>[0]) {
  const href = liveMapHref(input);
  if (href === null) return null;
  const q = new URLSearchParams(href.slice(href.indexOf("?") + 1));
  return readMapFocus(Object.fromEntries(q.entries()));
}

const PICKUP = { lat: -19.7343743540304, lng: 63.4663899164507 };
const DROPOFF = { lat: -19.6875, lng: 63.4211 };

describe("a job handed from the desk to the live map", () => {
  it("arrives with both ends and both names", () => {
    const f = roundTrip({
      lat: PICKUP.lat, lng: PICKUP.lng, label: "Ma position actuelle",
      toLat: DROPOFF.lat, toLng: DROPOFF.lng, toLabel: "Roche Bon Dieu",
    });
    expect(f).toEqual({
      pickup: { ...PICKUP, label: "Ma position actuelle" },
      dropoff: { ...DROPOFF, label: "Roche Bon Dieu" },
    });
  });

  it("keeps full coordinate precision", () => {
    // Rounding to 4 decimals moves a pin ~11 m, which on a road that is one
    // lane wide is the difference between the right gate and the neighbour's.
    const f = roundTrip({ lat: PICKUP.lat, lng: PICKUP.lng, label: "x" });
    expect(f?.pickup?.lat).toBe(PICKUP.lat);
    expect(f?.pickup?.lng).toBe(PICKUP.lng);
  });

  it("survives a label full of URL punctuation", () => {
    // Real labels contain & and #: "Chez Marie & Fils, Bat. #3".
    const nasty = "Chez Marie & Fils, Bat. #3 — 100% sûr";
    const f = roundTrip({ lat: PICKUP.lat, lng: PICKUP.lng, label: nasty });
    expect(f?.pickup?.label).toBe(nasty);
  });

  it("carries one end when that is all the job has", () => {
    // A private day hire has no destination (M98).
    const f = roundTrip({ lat: PICKUP.lat, lng: PICKUP.lng, label: "Port Mathurin" });
    expect(f?.pickup?.label).toBe("Port Mathurin");
    expect(f?.dropoff).toBeNull();
  });

  it("carries the drop-off alone when the pickup is only words", () => {
    const f = roundTrip({
      lat: null, lng: null, label: "somewhere in Baie Topaze",
      toLat: DROPOFF.lat, toLng: DROPOFF.lng, toLabel: "Roche Bon Dieu",
    });
    expect(f?.pickup).toBeNull();
    expect(f?.dropoff?.lat).toBe(DROPOFF.lat);
  });
});

describe("what it refuses to draw", () => {
  it("returns no link at all when neither end has a pin", () => {
    // The caller falls back to plain text; a link to an empty map is worse
    // than no link, because the operator clicks it and learns nothing.
    expect(liveMapHref({ lat: null, lng: null, label: "Chez Rose" })).toBeNull();
  });

  it("drops 0,0", () => {
    // The Gulf of Guinea is always a missing value that survived a `?? 0`.
    expect(liveMapHref({ lat: 0, lng: 0 })).toBeNull();
  });

  it("drops a fix from outside Rodrigues", () => {
    // Mauritius mainland. The fleet is not there, so framing the map on it
    // would show a job and an empty sea. PlaceLink sends these to Google.
    expect(liveMapHref({ lat: -20.16, lng: 57.5 })).toBeNull();
  });

  it("does not throw on a hand-edited URL", () => {
    // A truncated or mangled query means the map opens as it always did.
    for (const bad of ["", "abc", "-19.7", ",", "-19.7,", "NaN,NaN", "-19.7,63.4,99"]) {
      expect(() => readMapFocus({ at: bad })).not.toThrow();
    }
    expect(readMapFocus({ at: "abc" }).pickup).toBeNull();
    expect(readMapFocus(undefined)).toEqual({ pickup: null, dropoff: null });
  });

  it("takes the first value when a parameter is repeated", () => {
    // Next hands an array for ?at=a&at=b. Reading it as a string would give
    // "a,b" and parse into nonsense.
    const f = readMapFocus({ at: [`${PICKUP.lat},${PICKUP.lng}`, "0,0"] });
    expect(f.pickup?.lat).toBe(PICKUP.lat);
  });

  it("clamps a runaway label instead of building an enormous URL", () => {
    const href = liveMapHref({ lat: PICKUP.lat, lng: PICKUP.lng, label: "x".repeat(500) });
    expect(readMapFocus(
      Object.fromEntries(new URLSearchParams(href!.slice(href!.indexOf("?") + 1)).entries()),
    ).pickup?.label).toHaveLength(80);
  });
});

describe("hasFocus decides whether the map draws at all", () => {
  it("is false for an ordinary visit", () => {
    expect(hasFocus(readMapFocus({}))).toBe(false);
    expect(hasFocus(null)).toBe(false);
  });

  it("is true when a job came with the link", () => {
    expect(hasFocus(readMapFocus({ at: `${PICKUP.lat},${PICKUP.lng}` }))).toBe(true);
    // Drop-off only still counts: there is something to show.
    expect(hasFocus(readMapFocus({ to: `${DROPOFF.lat},${DROPOFF.lng}` }))).toBe(true);
  });
});
