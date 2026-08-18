import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Map as LeafletMap, Marker } from "leaflet";
import { createSmoothMarker } from "./smooth-marker";

// ── WHY THIS IS A UNIT TEST AND NOT A SCREENSHOT ────────────────────────────
//
// The animator's whole job is what happens BETWEEN two GPS fixes, which is
// invisible in a still image. It is also unobservable in this project's headless
// browser: that pane runs hidden, requestAnimationFrame never fires there, and a
// measurement would show the marker "teleporting" for a reason that has nothing
// to do with the code. (Measured: rafFiredCount 0, document.hidden true.)
//
// So rAF is driven by hand here. Every frame is deterministic, and the two
// judgement calls the module makes — snap on an impossible jump, retarget from
// where the marker actually IS — are asserted rather than eyeballed.

type Pt = { lat: number; lng: number };

function harness() {
  let pos: Pt = { lat: -19.6836, lng: 63.4186 };
  const path: Pt[] = [{ ...pos }];
  const panned: Pt[] = [];

  const marker = {
    getLatLng: () => ({ ...pos }),
    setLatLng: (ll: [number, number]) => {
      pos = { lat: ll[0], lng: ll[1] };
      path.push({ ...pos });
    },
    getElement: () => null,
  } as unknown as Marker;

  const map = {
    panTo: (ll: [number, number]) => { panned.push({ lat: ll[0], lng: ll[1] }); },
  } as unknown as LeafletMap;

  return { map, marker, path, panned, current: () => pos };
}

/** Drive the rAF queue by hand, advancing the clock a frame at a time. */
let now = 0;
let queue: FrameRequestCallback[] = [];

function runFrames(count: number, msPerFrame = 16) {
  for (let i = 0; i < count; i++) {
    now += msPerFrame;
    const due = queue;
    queue = [];
    for (const cb of due) cb(now);
  }
}

beforeEach(() => {
  now = 0;
  queue = [];
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    queue.push(cb);
    return queue.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => { queue = []; });
  vi.stubGlobal("performance", { now: () => now });
});

afterEach(() => { vi.unstubAllGlobals(); });

describe("createSmoothMarker — movement between fixes", () => {
  it("walks through intermediate positions instead of teleporting", () => {
    const h = harness();
    const sm = createSmoothMarker(h.map, h.marker, { durationMs: 1000 });

    // ~150 m north — a plausible 4 seconds of driving, so it must be animated.
    sm.moveTo(-19.6822, 63.4186);
    // 80 frames x 16 ms = 1280 ms, comfortably past the 1000 ms duration. Run
    // fewer and the easing is simply unfinished, which is a bug in the test.
    runFrames(80);

    // The whole point: many distinct positions, not two.
    expect(h.path.length).toBeGreaterThan(15);
    const lats = h.path.map((p) => p.lat);
    expect(new Set(lats).size).toBeGreaterThan(15);

    // It ends exactly on the target, not near it.
    expect(h.current().lat).toBeCloseTo(-19.6822, 10);
    sm.destroy();
  });

  it("moves monotonically toward the target — never overshoots or rebounds", () => {
    const h = harness();
    const sm = createSmoothMarker(h.map, h.marker, { durationMs: 1000 });
    sm.moveTo(-19.6822, 63.4186);
    runFrames(80);

    const lats = h.path.map((p) => p.lat);
    for (let i = 1; i < lats.length; i++) {
      expect(lats[i]).toBeGreaterThanOrEqual(lats[i - 1] - 1e-12);
    }
    // easeOutQuad: it decelerates, so the first frame covers more ground than
    // the last. A linear walk that stops dead reads as mechanical.
    const first = lats[1] - lats[0];
    const last = lats[lats.length - 1] - lats[lats.length - 2];
    expect(first).toBeGreaterThan(last);
    sm.destroy();
  });

  it("SNAPS rather than animating a fix that is too far to be real", () => {
    const h = harness();
    const sm = createSmoothMarker(h.map, h.marker, { durationMs: 1000 });

    // Port Mathurin → the airport, ~10 km, in one update. The driver did not
    // drive that in four seconds; the phone regained signal. Animating it would
    // draw a fictional journey across the lagoon.
    sm.moveTo(-19.7577, 63.361);
    const afterSnap = { ...h.current() };
    expect(afterSnap.lat).toBeCloseTo(-19.7577, 10);

    const framesBefore = h.path.length;
    runFrames(40);
    // Nothing was queued: the snap is not the start of an animation.
    expect(h.path.length).toBe(framesBefore);
    sm.destroy();
  });

  it("retargets from where the marker IS, so a mid-flight fix does not rewind it", () => {
    const h = harness();
    const sm = createSmoothMarker(h.map, h.marker, { durationMs: 1000 });

    sm.moveTo(-19.6822, 63.4186);
    runFrames(20);                       // ~halfway
    const midway = h.current().lat;
    expect(midway).toBeGreaterThan(-19.6836);
    expect(midway).toBeLessThan(-19.6822);

    // A new fix arrives before the last leg finished.
    sm.moveTo(-19.6810, 63.4186);
    runFrames(2);
    // It must continue from `midway`, not jump back to where the last leg began.
    expect(h.current().lat).toBeGreaterThanOrEqual(midway - 1e-9);
    runFrames(80);
    expect(h.current().lat).toBeCloseTo(-19.6810, 10);
    sm.destroy();
  });

  it("stops writing once destroyed", () => {
    const h = harness();
    const sm = createSmoothMarker(h.map, h.marker, { durationMs: 1000 });
    sm.moveTo(-19.6822, 63.4186);
    runFrames(5);
    const n = h.path.length;
    sm.destroy();
    runFrames(40);
    expect(h.path.length).toBe(n);
  });
});

describe("createSmoothMarker — facing", () => {
  it("takes the short way round at north instead of spinning 340 degrees", () => {
    const seen: number[] = [];
    const h = harness();
    const sm = createSmoothMarker(h.map, h.marker, {
      durationMs: 500, onBearing: (d) => seen.push(d),
    });

    sm.snapTo(-19.6836, 63.4186, 350);
    sm.snapTo(-19.6836, 63.4186, 10);

    expect(seen[0]).toBe(350);
    // 350 + 20 = 370 -> normalised to 10. The value the CSS transform receives
    // must represent a 20-degree turn, which is what stops the visible spin.
    expect(seen[1]).toBe(10);
    sm.destroy();
  });

  it("derives a bearing from movement when the device reports none", () => {
    const seen: number[] = [];
    const h = harness();
    const sm = createSmoothMarker(h.map, h.marker, {
      durationMs: 500, onBearing: (d) => seen.push(d),
    });

    sm.moveTo(-19.6822, 63.4186, null);   // due north, ~150 m
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[seen.length - 1]).toBeCloseTo(0, 0);
    sm.destroy();
  });

  it("ignores jitter: a stationary phone must not spin the icon", () => {
    const seen: number[] = [];
    const h = harness();
    const sm = createSmoothMarker(h.map, h.marker, {
      durationMs: 500, onBearing: (d) => seen.push(d),
    });

    // ~2 m of accuracy noise. Below MIN_BEARING_MOVE_KM, so no new bearing.
    sm.moveTo(-19.68362, 63.41861, null);
    expect(seen.length).toBe(0);
    sm.destroy();
  });

  it("prefers the device heading over the derived one — it is a compass reading", () => {
    const seen: number[] = [];
    const h = harness();
    const sm = createSmoothMarker(h.map, h.marker, {
      durationMs: 500, onBearing: (d) => seen.push(d),
    });
    // Moving north, but the device says it is facing east. The device wins.
    sm.moveTo(-19.6822, 63.4186, 90);
    expect(seen[seen.length - 1]).toBe(90);
    sm.destroy();
  });
});

describe("createSmoothMarker — following", () => {
  it("pans the map only while follow is on", () => {
    const h = harness();
    const sm = createSmoothMarker(h.map, h.marker, { durationMs: 500, follow: true });
    sm.moveTo(-19.6822, 63.4186);
    runFrames(10);
    expect(h.panned.length).toBeGreaterThan(0);

    const n = h.panned.length;
    sm.setFollow(false);            // the user panned — never fight a thumb
    sm.moveTo(-19.6810, 63.4186);
    runFrames(40);
    expect(h.panned.length).toBe(n);
    sm.destroy();
  });
});
