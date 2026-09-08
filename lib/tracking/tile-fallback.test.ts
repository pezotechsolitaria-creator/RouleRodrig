import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

// ── A GREY MAP IS THE WORST FAILURE THIS APP HAS ────────────────────────────
//
// The site now points at a METERED tile provider. Leaflet's answer to a tile it
// cannot fetch is to draw nothing at all, so a spent quota, a rotated token or a
// URL restriction that stops matching a new domain all produce the same thing: a
// blank rectangle, in silence. On the tracking map — which polls the whole time
// a customer watches their delivery, and is therefore both the heaviest consumer
// of the quota and the worst place to lose it — that does not read as "our tile
// bill ran out". It reads as the driver having vanished.
//
// The free providers are still configured, still keyless, still free. These
// tests pin the rule for giving up on the paid one, because the failure it
// guards cannot be reproduced without actually exhausting a quota.

const ENV = [
  "NEXT_PUBLIC_MAP_TILE_URL",
  "NEXT_PUBLIC_MAP_TILE_ATTRIBUTION",
  "NEXT_PUBLIC_MAP_SATELLITE_URL",
  "NEXT_PUBLIC_MAP_SATELLITE_ATTRIBUTION",
] as const;

let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
  for (const k of ENV) delete process.env[k];
});
afterEach(() => {
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

/** Imported fresh each time: these read process.env when called. */
async function tiles() {
  return await import("./tiles");
}

describe("it only gives up on a provider we chose", () => {
  it("never falls back when the built-in is already in use", async () => {
    // With no override there is nowhere better to go. Swapping OSM for OSM
    // would redraw the map for nothing, on the connection least able to afford
    // it.
    const { shouldFallBack, isOverridden } = await tiles();
    expect(isOverridden("streets")).toBe(false);
    expect(isOverridden("satellite")).toBe(false);
    expect(shouldFallBack("streets", 99)).toBe(false);
    expect(shouldFallBack("satellite", 99)).toBe(false);
  });

  it("falls back once a configured provider has failed enough", async () => {
    process.env.NEXT_PUBLIC_MAP_TILE_URL = "https://api.example.com/{z}/{x}/{y}.png";
    process.env.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION = "© Example";
    const { shouldFallBack, TILE_ERROR_LIMIT } = await tiles();
    expect(shouldFallBack("streets", TILE_ERROR_LIMIT)).toBe(true);
    expect(shouldFallBack("streets", TILE_ERROR_LIMIT + 40)).toBe(true);
  });

  it("tolerates the ordinary handful of failed tiles", async () => {
    // One tile at the edge of coverage, or a dropped packet on a phone changing
    // cell, is not a provider outage. Demoting a working paid sheet on a bad ten
    // seconds would be worse than the thing being fixed.
    process.env.NEXT_PUBLIC_MAP_TILE_URL = "https://api.example.com/{z}/{x}/{y}.png";
    process.env.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION = "© Example";
    const { shouldFallBack, TILE_ERROR_LIMIT } = await tiles();
    for (let n = 0; n < TILE_ERROR_LIMIT; n++) {
      expect(shouldFallBack("streets", n), `gave up after ${n}`).toBe(false);
    }
  });

  it("judges the two sheets independently", async () => {
    // Overriding satellite alone must not make the street sheet fall back — it
    // is still the built-in and still fine.
    process.env.NEXT_PUBLIC_MAP_SATELLITE_URL = "https://api.example.com/{z}/{x}/{y}.jpg";
    process.env.NEXT_PUBLIC_MAP_SATELLITE_ATTRIBUTION = "© Example";
    const { shouldFallBack } = await tiles();
    expect(shouldFallBack("satellite", 99)).toBe(true);
    expect(shouldFallBack("streets", 99)).toBe(false);
  });

  it("treats a half-configured override as no override", async () => {
    // tiles.ts refuses a URL with no attribution — crediting the wrong people
    // breaks the licence of every OSM-derived source. That layer is therefore
    // still the built-in, and has nothing to fall back to.
    process.env.NEXT_PUBLIC_MAP_TILE_URL = "https://api.example.com/{z}/{x}/{y}.png";
    const { shouldFallBack, isOverridden } = await tiles();
    expect(isOverridden("streets")).toBe(false);
    expect(shouldFallBack("streets", 99)).toBe(false);
  });
});

describe("the sheet it falls back to is the free one", () => {
  it("ignores the override entirely", async () => {
    process.env.NEXT_PUBLIC_MAP_TILE_URL = "https://api.example.com/{z}/{x}/{y}.png";
    process.env.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION = "© Example";
    const { builtinBasemap } = await tiles();
    expect(builtinBasemap("streets").base.url).toContain("openstreetmap.org");
    expect(builtinBasemap("streets").base.url).not.toContain("api.example.com");
  });

  it("keeps its own attribution, so the credit corrects itself", async () => {
    // Falling back while still naming the provider that stopped drawing would
    // credit the wrong people — a licence problem, not a cosmetic one.
    const { builtinBasemap } = await tiles();
    expect(builtinBasemap("streets").base.attribution).toContain("OpenStreetMap");
    expect(builtinBasemap("satellite").base.attribution).toContain("Sentinel-2");
  });
});

describe("the swap actually happens", () => {
  // A fake Leaflet, because the real one needs a DOM, a network and a paid key
  // to reach the one branch that matters. What is being tested is the wiring:
  // does the listener fire, does it count, does it replace the layer, and does
  // it stop.
  function harness() {
    const events: Record<string, Array<() => void>> = {};
    const added: string[] = [];
    const removed: unknown[] = [];
    const layer = {
      on: (e: string, fn: () => void) => {
        (events[e] ||= []).push(fn);
      },
      off: (e: string, fn: () => void) => {
        events[e] = (events[e] || []).filter((f) => f !== fn);
      },
    };
    const map = { removeLayer: (l: unknown) => removed.push(l) };
    const L = {
      tileLayer: (url: string) => ({ url, addTo: () => added.push(url) }),
    };
    return {
      L, map, layer, added, removed,
      fail: (n: number) => {
        for (let i = 0; i < n; i++) (events.tileerror || []).forEach((f) => f());
      },
      listeners: () => (events.tileerror || []).length,
    };
  }

  it("replaces the layer once the limit is reached, and not before", async () => {
    process.env.NEXT_PUBLIC_MAP_TILE_URL = "https://api.example.com/{z}/{x}/{y}.png";
    process.env.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION = "© Example";
    const { guardTiles } = await import("./tile-fallback");
    const { TILE_ERROR_LIMIT } = await tiles();
    const h = harness();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    guardTiles({ L: h.L as any, map: h.map as any, layer: h.layer as any, id: "streets" });

    h.fail(TILE_ERROR_LIMIT - 1);
    expect(h.added, "gave up too early").toEqual([]);

    h.fail(1);
    expect(h.added).toHaveLength(1);
    expect(h.added[0]).toContain("openstreetmap.org");
    expect(h.removed).toHaveLength(1);
  });

  it("does not swap a second time however many more fail", async () => {
    process.env.NEXT_PUBLIC_MAP_TILE_URL = "https://api.example.com/{z}/{x}/{y}.png";
    process.env.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION = "© Example";
    const { guardTiles } = await import("./tile-fallback");
    const h = harness();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    guardTiles({ L: h.L as any, map: h.map as any, layer: h.layer as any, id: "streets" });
    h.fail(500);
    expect(h.added, "flapped between providers").toHaveLength(1);
  });

  it("tells the caller which layer replaced it", async () => {
    process.env.NEXT_PUBLIC_MAP_TILE_URL = "https://api.example.com/{z}/{x}/{y}.png";
    process.env.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION = "© Example";
    const { guardTiles } = await import("./tile-fallback");
    const h = harness();
    let handed: unknown = null;
    guardTiles({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      L: h.L as any, map: h.map as any, layer: h.layer as any, id: "streets",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onSwap: (next: any) => { handed = next; },
    });
    h.fail(50);
    // A caller holding a stale ref would remove the wrong layer on the next
    // basemap switch, leaving two sheets stacked.
    expect(handed).not.toBeNull();
  });

  it("detaches its listener when released", async () => {
    const { guardTiles } = await import("./tile-fallback");
    const h = harness();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const release = guardTiles({ L: h.L as any, map: h.map as any, layer: h.layer as any, id: "streets" });
    expect(h.listeners()).toBe(1);
    release();
    expect(h.listeners(), "leaked a listener per basemap switch").toBe(0);
  });
});

describe("every map is guarded, not just one", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

  it("covers all three maps that draw tiles", () => {
    // A guard on two of three would leave exactly one screen going grey, and it
    // would be discovered by a customer rather than by us.
    for (const f of [
      "components/IslandMap.tsx",
      "components/PinOnMap.tsx",
      "components/tracking/TrackingMap.tsx",
    ]) {
      expect(read(f), `${f} draws tiles with no fallback`).toContain("guardTiles");
    }
  });

  it("swaps in the replacement before removing the failed layer", () => {
    // The other order leaves a frame with no tile layer at all — a visible
    // flash of empty map, which is the exact thing being prevented.
    const src = read("lib/tracking/tile-fallback.ts");
    expect(src.indexOf("next.addTo(map)")).toBeLessThan(
      src.indexOf("map.removeLayer(layer)"),
    );
  });

  it("swaps once and does not flap back", () => {
    const src = read("lib/tracking/tile-fallback.ts");
    expect(src).toContain("let swapped = false");
    expect(src).toMatch(/if \(swapped \|\| !shouldFallBack/);
  });
});
