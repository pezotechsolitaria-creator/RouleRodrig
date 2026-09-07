import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { rememberPlace } from "./delivery/remembered";
import { RODRIGUES_BOUNDS, RODRIGUES_CENTRE } from "./tracking/tiles";

// ── THE COORDINATE THAT USED TO BE LOST ─────────────────────────────────────
//
// PlacePicker's comment states the size of the problem: "35 names against 182
// localities — this branch is not an edge case here, it is a large minority of
// the island." Everybody in that majority-of-the-remainder typed their address
// as free text, and the job left with pickup_lat and pickup_lng null. Dispatch
// then had no origin and quote_ride() refused with need_locations, so the price
// became "on request" — permanently, for a large part of Rodrigues.
//
// Nothing in the database or the API had to change: delivery_requests and
// ride_requests have carried nullable lat/lng beside the required text label
// since M104, and DeliverForm already sent `pickup?.lat ?? undefined`. The only
// missing piece was a way for somebody to PRODUCE a coordinate for a place with
// no entry in the gazetteer.
//
// What these tests defend is the shape of that answer: it is offered as an
// ADDITION to naming and typing, never as a replacement, because the flow it
// lives in is sized for people who have never used a map app.

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("a pinned place is a place, not a fix", () => {
  it("is remembered, unlike a one-off GPS reading", () => {
    // remembered.ts drops "gps" on purpose: where somebody stood on Tuesday is
    // not somewhere they send things. A pinned house is exactly that, so it has
    // to survive — otherwise the second order costs the same work as the first.
    const store = fakeStore();
    const pin = {
      id: "pin",
      name: "Chez Marie, blue gate",
      area: "",
      lat: -19.72,
      lng: 63.42,
    };
    const after = rememberPlace(pin, store);
    expect(after.map((p) => p.name)).toContain("Chez Marie, blue gate");
    expect(after[0].lat).toBe(-19.72);
    expect(after[0].lng).toBe(63.42);
  });

  it("still drops a live GPS fix", () => {
    const store = fakeStore();
    const kept = rememberPlace(
      { id: "gps", name: "My current location", area: "", lat: -19.7, lng: 63.4 },
      store,
    );
    expect(kept).toHaveLength(0);
  });

  it("does not let one pinned place overwrite another", () => {
    // The id is shared by every pin, so keying on it would collapse them all
    // into one row. remembered.ts keys on the name; this proves the pin id did
    // not quietly break that.
    const store = fakeStore();
    rememberPlace({ id: "pin", name: "Chez Marie", area: "", lat: -19.72, lng: 63.42 }, store);
    const two = rememberPlace(
      { id: "pin", name: "Chez Paul", area: "", lat: -19.68, lng: 63.39 },
      store,
    );
    expect(two.map((p) => p.name)).toEqual(["Chez Paul", "Chez Marie"]);
  });
});

describe("the pin cannot land somewhere nobody can drive to", () => {
  it("bounds the island around its own centre", () => {
    const [lat, lng] = RODRIGUES_CENTRE;
    expect(lat).toBeGreaterThan(RODRIGUES_BOUNDS.minLat);
    expect(lat).toBeLessThan(RODRIGUES_BOUNDS.maxLat);
    expect(lng).toBeGreaterThan(RODRIGUES_BOUNDS.minLng);
    expect(lng).toBeLessThan(RODRIGUES_BOUNDS.maxLng);
  });

  it("keeps the box tight enough to exclude Mauritius", () => {
    // Mauritius is ~560 km west at roughly 57.5E. A box that reached it would
    // accept a pickup no Rodriguan driver can service.
    expect(RODRIGUES_BOUNDS.minLng).toBeGreaterThan(60);
  });

  it("clamps the frame rather than trusting the finger", () => {
    const src = read("components/PinOnMap.tsx");
    expect(src).toContain("maxBounds");
    expect(src).toContain("RODRIGUES_BOUNDS");
  });
});

describe("the map is an addition, never a replacement", () => {
  it("keeps the written address, and keeps it required", () => {
    const src = read("components/PinOnMap.tsx");
    // A driver navigates by words. Confirm stays disabled without them.
    expect(src).toContain("canConfirm");
    expect(src).toMatch(/name\.trim\(\)\.length > 0/);
  });

  it("carries the typed words into the sheet so nobody types twice", () => {
    const picker = read("components/PlacePicker.tsx");
    expect(picker).toMatch(/initialName=\{q\.trim\(\)/);
  });

  it("still offers the plain typed answer beside it", () => {
    // The old path must not have been replaced by the new one.
    const picker = read("components/PlacePicker.tsx");
    expect(picker).toContain("copy.useTyped(q.trim())");
    expect(picker).toContain('id: "custom"');
  });

  it("offers the map below the names, not above them", () => {
    // For the forty places with names, the list is faster and works offline.
    // Order on screen is the recommendation, so it is worth pinning down.
    const picker = read("components/PlacePicker.tsx");
    expect(picker.indexOf("copy.useMyLocation")).toBeLessThan(
      picker.indexOf("copy.pin.open"),
    );
  });
});

describe("Leaflet stays out of the booking bundle", () => {
  it("loads the sheet only when it is opened", () => {
    const picker = read("components/PlacePicker.tsx");
    expect(picker).toMatch(/dynamic\(\(\) => import\("@\/components\/PinOnMap"\)/);
    expect(picker).toContain("ssr: false");
  });

  it("takes its tiles from the shared seam", () => {
    const src = read("components/PinOnMap.tsx");
    expect(src).toMatch(/from "@\/lib\/tracking\/tiles"/);
    expect(src).not.toContain("{z}/{x}/{y}");
  });

  it("stops the map before removing it", () => {
    // Unmounting a Leaflet map mid-animation throws inside Leaflet's own
    // cleanup ("reading 'baseVal'"), and this component unmounts on the confirm
    // tap — the moment a frame is most likely still moving.
    const src = read("components/PinOnMap.tsx");
    expect(src).toMatch(/\.stop\(\);/);
  });
});

/** An in-memory Storage stand-in — the tests must not touch a real browser. */
function fakeStore() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}
