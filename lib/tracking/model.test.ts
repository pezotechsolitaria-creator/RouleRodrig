import { describe, it, expect } from "vitest";
import {
  haversineKm, bearingDeg, shortestTurn, shouldAcceptFix, freshness,
  lastSeenLabel, approxEta, formatEta, formatDistance, isOnRodrigues,
  activeTarget, TRACKING_CUSTOMER_STATUS, TRACKING_ADMIN_STATUS, shouldRefit, isFramableSize, filterFix, publishIntervalMs,
  type Fix,
} from "./model";

// Real Rodrigues coordinates, from lib/rides/places.ts — the same gazetteer the
// booking form uses, so these tests exercise distances the platform really sees.
const PORT_MATHURIN = { lat: -19.6836, lng: 63.4186 };
const AIRPORT = { lat: -19.7577, lng: 63.3610 };
const MONT_LUBIN = { lat: -19.7139, lng: 63.4126 };

const fix = (over: Partial<Fix> = {}): Fix => ({
  lat: PORT_MATHURIN.lat, lng: PORT_MATHURIN.lng,
  heading: null, speedKmh: null, accuracyM: 12, at: 1_000_000, ...over,
});

describe("distance", () => {
  it("measures the airport run at roughly 10 km as the crow flies", () => {
    const km = haversineKm(PORT_MATHURIN.lat, PORT_MATHURIN.lng, AIRPORT.lat, AIRPORT.lng);
    // The real road is ~16 km; 1.35 road_factor over ~10 km lands there, which
    // is the whole justification for that constant.
    expect(km).toBeGreaterThan(9);
    expect(km).toBeLessThan(11);
  });

  it("is zero for a point against itself", () => {
    expect(haversineKm(-19.7, 63.4, -19.7, 63.4)).toBe(0);
  });

  it("agrees with the SQL haversine_km to within a millimetre", () => {
    // haversine_km() in dispatch_geography.sql uses R=6371 and the same formula.
    // Locking these values is what stops a distance SHOWN to a customer and a
    // distance USED TO RANK a driver from drifting apart.
    //
    // Both constants were READ OUT OF THE LIVE DATABASE, not derived here:
    //   select haversine_km(-19.6836, 63.4186, -19.7139, 63.4126);  -> 3.42725727642228
    //   select haversine_km(-19.6836, 63.4186, -19.7577, 63.3610);  -> 10.2098515339176
    // A test whose expectation came from the same reasoning as the code proves
    // nothing; these came from the other implementation.
    expect(
      haversineKm(PORT_MATHURIN.lat, PORT_MATHURIN.lng, MONT_LUBIN.lat, MONT_LUBIN.lng),
    ).toBeCloseTo(3.42725727642228, 9);
    expect(
      haversineKm(PORT_MATHURIN.lat, PORT_MATHURIN.lng, AIRPORT.lat, AIRPORT.lng),
    ).toBeCloseTo(10.2098515339176, 9);
  });
});

describe("bearing", () => {
  it("points north for a move due north", () => {
    expect(bearingDeg(-19.7, 63.4, -19.6, 63.4)).toBeCloseTo(0, 1);
  });
  it("points east for a move due east", () => {
    expect(bearingDeg(-19.7, 63.4, -19.7, 63.5)).toBeCloseTo(90, 0);
  });
  it("is always 0-360", () => {
    const b = bearingDeg(-19.7, 63.4, -19.8, 63.3);
    expect(b).toBeGreaterThanOrEqual(0);
    expect(b).toBeLessThan(360);
  });
});

describe("shortestTurn — the thing that stops an icon spinning the wrong way", () => {
  it("turns 20 degrees, not 340, from 350 to 10", () => {
    expect(shortestTurn(350, 10)).toBe(20);
  });
  it("turns -20 from 10 to 350", () => {
    expect(shortestTurn(10, 350)).toBe(-20);
  });
  it("handles the 180 boundary without flipping sign unpredictably", () => {
    expect(Math.abs(shortestTurn(0, 180))).toBe(180);
  });
  it("is zero for no change", () => {
    expect(shortestTurn(42, 42)).toBe(0);
  });
});

describe("shouldAcceptFix — which GPS samples are lies", () => {
  it("accepts the first fix", () => {
    expect(shouldAcceptFix(null, fix())).toBe(true);
  });

  it("rejects a fix that arrived out of order", () => {
    const prev = fix({ at: 2_000_000 });
    expect(shouldAcceptFix(prev, fix({ at: 1_999_000 }))).toBe(false);
  });

  it("rejects a fix with the same timestamp", () => {
    expect(shouldAcceptFix(fix(), fix())).toBe(false);
  });

  it("rejects a uselessly imprecise fix", () => {
    expect(shouldAcceptFix(null, fix({ accuracyM: 5000 }))).toBe(false);
  });

  it("accepts a merely poor fix — imprecise still beats nothing for dispatch", () => {
    expect(shouldAcceptFix(null, fix({ accuracyM: 400 }))).toBe(true);
  });

  it("rejects the classic teleport: Port Mathurin to the airport in 4 seconds", () => {
    const prev = fix({ at: 1_000_000 });
    const wild = fix({ ...AIRPORT, at: 1_004_000 });
    // ~10 km in 4 s is 9,000 km/h. Animating this draws a journey across the
    // lagoon and back.
    expect(shouldAcceptFix(prev, wild)).toBe(false);
  });

  it("accepts a realistic 60 km/h leg", () => {
    const prev = fix({ at: 1_000_000 });
    // ~67 m north in 4 s = 60 km/h.
    const next = fix({ lat: PORT_MATHURIN.lat + 0.0006, at: 1_004_000 });
    expect(shouldAcceptFix(prev, next)).toBe(true);
  });

  it("accepts a stationary driver whose fix jitters by a few metres", () => {
    const prev = fix({ at: 1_000_000 });
    // 2 m of noise over 1 s would imply 7 km/h — fine — but the point is that
    // sub-30 m movement skips the speed test entirely rather than depending on
    // the interval.
    const next = fix({ lat: PORT_MATHURIN.lat + 0.00002, at: 1_000_200 });
    expect(shouldAcceptFix(prev, next)).toBe(true);
  });

  it("rejects nonsense coordinates", () => {
    expect(shouldAcceptFix(null, fix({ lat: 999 }))).toBe(false);
    expect(shouldAcceptFix(null, fix({ lat: Number.NaN }))).toBe(false);
  });
});

describe("isOnRodrigues", () => {
  it("accepts real island places", () => {
    expect(isOnRodrigues(PORT_MATHURIN.lat, PORT_MATHURIN.lng)).toBe(true);
    expect(isOnRodrigues(AIRPORT.lat, AIRPORT.lng)).toBe(true);
  });
  it("rejects mainland Mauritius, which is the realistic mistake", () => {
    expect(isOnRodrigues(-20.348, 57.552)).toBe(false);
  });
  it("rejects a null-island / VPN fix", () => {
    expect(isOnRodrigues(0, 0)).toBe(false);
  });
});

describe("freshness and its wording", () => {
  it("is live under 45 seconds", () => {
    expect(freshness(10, 600)).toBe("live");
  });
  it("is delayed between 45 s and the stale dial", () => {
    expect(freshness(120, 600)).toBe("delayed");
  });
  it("is stale past the dial", () => {
    expect(freshness(900, 600)).toBe("stale");
  });
  it("is unknown when there is no age at all", () => {
    expect(freshness(null, 600)).toBe("unknown");
    expect(freshness(undefined, 600)).toBe("unknown");
  });
  it("honours a dial the owner has changed", () => {
    // stale_location_minutes is one row in dispatch_settings; every screen must
    // follow it rather than hard-coding ten minutes.
    expect(freshness(200, 120)).toBe("stale");
  });

  it("never shows a raw timestamp", () => {
    expect(lastSeenLabel(null)).toBe("Location unavailable");
    expect(lastSeenLabel(10)).toBe("Live");
    expect(lastSeenLabel(120)).toBe("Last seen 2 min ago");
    expect(lastSeenLabel(3600)).toBe("Last seen 1 h ago");
    expect(lastSeenLabel(4800)).toBe("Last seen 1 h 20 min ago");
  });
});

describe("approxEta", () => {
  it("uses the dispatch dials rather than constants of its own", () => {
    const eta = approxEta(
      PORT_MATHURIN.lat, PORT_MATHURIN.lng, AIRPORT.lat, AIRPORT.lng,
      1.35, 35,
    );
    // ~10 km × 1.35 = ~13.5 km at 35 km/h ≈ 23 min. The real drive is ~25.
    expect(eta.minutes).toBeGreaterThan(18);
    expect(eta.minutes).toBeLessThan(30);
    expect(eta.source).toBe("approx");
  });

  it("changes when the owner changes the dials", () => {
    const slow = approxEta(PORT_MATHURIN.lat, PORT_MATHURIN.lng, AIRPORT.lat, AIRPORT.lng, 1.35, 20);
    const fast = approxEta(PORT_MATHURIN.lat, PORT_MATHURIN.lng, AIRPORT.lat, AIRPORT.lng, 1.35, 60);
    expect(slow.minutes).toBeGreaterThan(fast.minutes);
  });

  it("never returns zero minutes for a nearby driver", () => {
    const eta = approxEta(-19.7, 63.4, -19.7001, 63.4001, 1.35, 35);
    expect(eta.minutes).toBeGreaterThanOrEqual(1);
  });

  it("guards against an absurd speed dial rather than dividing by zero", () => {
    const eta = approxEta(PORT_MATHURIN.lat, PORT_MATHURIN.lng, AIRPORT.lat, AIRPORT.lng, 1.35, 0);
    expect(Number.isFinite(eta.minutes)).toBe(true);
  });
});

describe("formatting", () => {
  it("formats an ETA a person can read", () => {
    expect(formatEta(null)).toBe("—");
    expect(formatEta(0.4)).toBe("Under a minute");
    expect(formatEta(12)).toBe("12 min");
    expect(formatEta(65)).toBe("1 h 05");
  });

  it("shows metres under a kilometre and rounds them honestly", () => {
    expect(formatDistance(null)).toBe("—");
    expect(formatDistance(0.42)).toBe("400 m");
    expect(formatDistance(4.23)).toBe("4.2 km");
    // Never "0 m" — a driver at the door is 50 m, not nowhere.
    expect(formatDistance(0.001)).toBe("50 m");
  });
});

describe("activeTarget — the ETA must not point at the wrong end of the trip", () => {
  const pickup = { lat: PORT_MATHURIN.lat, lng: PORT_MATHURIN.lng };
  const dropoff = { lat: AIRPORT.lat, lng: AIRPORT.lng };

  it("aims at the pickup before the passenger is aboard", () => {
    expect(activeTarget("en_route_pickup", pickup, dropoff)).toEqual(pickup);
    expect(activeTarget("at_pickup", pickup, dropoff)).toEqual(pickup);
  });

  it("aims at the destination once the trip has started", () => {
    expect(activeTarget("on_trip", pickup, dropoff)).toEqual(dropoff);
  });

  it("returns null rather than guessing when there are no coordinates", () => {
    expect(activeTarget("on_trip", pickup, { lat: null, lng: null })).toBeNull();
  });
});

describe("what each audience is told", () => {
  it("never leaks platform vocabulary to a customer", () => {
    // The same rule lib/rides/model.ts follows: a customer must never read a
    // word about our plumbing.
    const forbidden = ["dispatch", "en_route", "radius", "stage", "pending", "broadcast", "channel"];
    for (const [, text] of Object.entries(TRACKING_CUSTOMER_STATUS)) {
      for (const bad of forbidden) {
        expect(text.toLowerCase()).not.toContain(bad);
      }
    }
  });

  it("covers every status on both sides", () => {
    const keys = Object.keys(TRACKING_CUSTOMER_STATUS).sort();
    expect(Object.keys(TRACKING_ADMIN_STATUS).sort()).toEqual(keys);
    expect(keys).toEqual(["at_pickup", "en_route_pickup", "ended", "on_trip", "pending"]);
  });
});

describe("shouldRefit — the map must re-frame when its box changes", () => {
  const base = { hasFitted: true, fittedAt: "446x318", userPanned: false };

  it("frames when it never has", () => {
    expect(shouldRefit({ ...base, hasFitted: false, fittedAt: "" }, "446x318")).toBe(true);
  });

  it("does nothing when the box is unchanged", () => {
    expect(shouldRefit(base, "446x318")).toBe(false);
  });

  it("RE-FRAMES when the box it framed against is not the box we now have", () => {
    // The measured bug: framing computed against a container that was still
    // settling, leaving the destination off the bottom of the map.
    expect(shouldRefit(base, "446x520")).toBe(true);
    expect(shouldRefit(base, "390x318")).toBe(true);
  });

  it("never fights a user who has panned — not even to correct itself", () => {
    // A pan is a decision. Both of these WOULD re-frame otherwise.
    expect(shouldRefit({ ...base, userPanned: true }, "446x520")).toBe(false);
    expect(shouldRefit({ ...base, userPanned: true, hasFitted: false }, "446x520")).toBe(false);
  });

  it("ignores an empty measurement rather than acting on it", () => {
    expect(shouldRefit(base, "")).toBe(false);
  });
});

describe("isFramableSize", () => {
  it("accepts a real container", () => {
    expect(isFramableSize(446, 318)).toBe(true);
  });
  it("rejects a container that has not been laid out", () => {
    // Framing against this is what produced zoom 13/14/15 for identical inputs.
    expect(isFramableSize(0, 0)).toBe(false);
    expect(isFramableSize(446, 0)).toBe(false);
    expect(isFramableSize(20, 20)).toBe(false);
  });
  it("rejects nonsense", () => {
    expect(isFramableSize(Number.NaN, 318)).toBe(false);
  });
});

describe("filterFix — the GPS quality pipeline", () => {
  const base = (over: Partial<Fix> = {}): Fix => ({
    lat: PORT_MATHURIN.lat, lng: PORT_MATHURIN.lng,
    heading: null, speedKmh: 30, accuracyM: 8, at: 1_000_000, ...over,
  });

  it("accepts the first usable fix", () => {
    const d = filterFix(null, base());
    expect(d.accept).toBe(true);
    if (d.accept) expect(d.reason).toBe("first");
  });

  it("REFUSES a fix too imprecise to place on a road", () => {
    // A wifi/cell fallback. Drawn as a confident dot it puts the driver on the
    // wrong road entirely.
    expect(filterFix(null, base({ accuracyM: 120 })).accept).toBe(false);
    expect(filterFix(null, base({ accuracyM: 51 })).accept).toBe(false);
    expect(filterFix(null, base({ accuracyM: 50 })).accept).toBe(true);
  });

  it("REFUSES drift: a stationary phone wandering a few metres", () => {
    const prev = base({ at: 1_000_000 });
    // ~4 m north, reported speed 0. This is satellites coming and going, not a
    // car moving, and it is the most visible failure of the three.
    const drifted = base({ lat: PORT_MATHURIN.lat + 0.000036, speedKmh: 0, at: 1_005_000 });
    const d = filterFix(prev, drifted);
    expect(d.accept).toBe(false);
    if (!d.accept) expect(d.reason).toBe("drift");
  });

  it("accepts a stationary phone that has genuinely pulled forward", () => {
    const prev = base({ at: 1_000_000 });
    // ~11 m — past the drift radius, so a car edging forward still registers.
    expect(filterFix(prev, base({ lat: PORT_MATHURIN.lat + 0.0001, speedKmh: 0, at: 1_005_000 })).accept)
      .toBe(true);
  });

  it("REFUSES the teleport — Port Mathurin to the airport in 4 seconds", () => {
    const prev = base({ at: 1_000_000 });
    const d = filterFix(prev, base({ ...AIRPORT, at: 1_004_000 }));
    expect(d.accept).toBe(false);
    if (!d.accept) expect(d.reason).toBe("impossible");
  });

  it("REFUSES an out-of-order callback rather than walking the marker back", () => {
    const prev = base({ at: 2_000_000 });
    const d = filterFix(prev, base({ at: 1_999_000 }));
    expect(d.accept).toBe(false);
    if (!d.accept) expect(d.reason).toBe("stale");
  });

  it("REFUSES nonsense coordinates", () => {
    expect(filterFix(null, base({ lat: 999 })).accept).toBe(false);
    expect(filterFix(null, base({ lat: Number.NaN })).accept).toBe(false);
  });

  it("SMOOTHS an accepted fix toward the reading without reaching it", () => {
    const prev = base({ at: 1_000_000 });
    const next = base({ lat: PORT_MATHURIN.lat + 0.0006, at: 1_004_000 });  // ~67 m, 60 km/h
    const d = filterFix(prev, next);
    expect(d.accept).toBe(true);
    if (!d.accept) return;
    // Strictly between the two — that is what smoothing IS. An implementation
    // that returns `next` unchanged is a no-op filter (this caught exactly that).
    expect(d.fix.lat).toBeGreaterThan(prev.lat);
    expect(d.fix.lat).toBeLessThan(next.lat);
    // And it must lean toward the new reading, not sit in the middle.
    expect(d.fix.lat).toBeGreaterThan((prev.lat + next.lat) / 2);
  });

  it("converges on a steady position instead of lagging forever", () => {
    let cur = base({ at: 1_000_000 });
    const target = PORT_MATHURIN.lat + 0.0006;
    for (let i = 1; i <= 12; i++) {
      const d = filterFix(cur, base({ lat: target, at: 1_000_000 + i * 4000 }));
      if (d.accept) cur = d.fix;
    }
    expect(cur.lat).toBeCloseTo(target, 6);
  });
});

describe("publishIntervalMs — spend messages where somebody is watching", () => {
  it("is fastest on the open road", () => {
    expect(publishIntervalMs(60)).toBe(3000);
  });
  it("eases off in town", () => {
    expect(publishIntervalMs(15)).toBe(5000);
  });
  it("drops to a heartbeat when stopped", () => {
    // A rank full of idling taxis is exactly how 2,000,000 free realtime
    // messages a month get spent on nothing happening.
    expect(publishIntervalMs(0)).toBe(15000);
    expect(publishIntervalMs(null)).toBe(15000);
  });
});
