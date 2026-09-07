import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

// ── THE MAP AND THE LIST HAVE TO AGREE ──────────────────────────────────────
//
// Three defects lived in components/IslandMap.tsx at once, and all three are
// the same shape: something rendered once and then never again.
//
//   THE FILTER      Markers were drawn inside the map-CREATION effect, which
//                   was guarded by `if (mapInst.current) return` and depended
//                   on [language]. Choosing "Beaches" filtered the list beneath
//                   the map and left all 42 pins on the map itself. Measured
//                   after the fix: 42 → 20 → 11 → 42.
//
//   THE TILES       The component hardcoded its own OpenStreetMap URL, so the
//                   provider seam in lib/tracking/tiles.ts — whose stated rule
//                   is "no component imports a tile URL, and none should" —
//                   re-tiled the tracking maps and silently skipped this one.
//
//   THE PLACEHOLDER Two popups contained the LITERAL text
//                   "{t.common.liveLocationOnly}" inside a single-quoted
//                   JavaScript string. The translations existed in all three
//                   languages; nothing was reading them.
//
// These are structural failures, so this reads the source rather than mounting
// Leaflet. A jsdom test would need a real map, real tiles and real geolocation
// to catch what one regex catches here.

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const SRC = "components/IslandMap.tsx";

/** Drop `//` lines and `/* *\/` blocks so prose about a bug is not read as the bug. */
function withoutComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
}

describe("the island map draws through the shared seam", () => {
  it("takes its tiles from lib/tracking/tiles.ts", () => {
    const src = read(SRC);
    expect(src).toMatch(/from "@\/lib\/tracking\/tiles"/);
    expect(src).toContain("getBasemap");
  });

  it("hardcodes no tile URL of its own", () => {
    const src = read(SRC);
    // The exact string that used to be here, and the shape of any replacement.
    expect(src).not.toContain("tile.openstreetmap.org");
    expect(src).not.toContain("{z}/{x}/{y}");
  });

  it("offers both sheets, so satellite is reachable", () => {
    const src = read(SRC);
    expect(src).toContain("getBasemaps");
    expect(src).toContain("rr-basemap-switch");
    // Remembered under the same key as the tracking map: choosing satellite
    // once should not have to be chosen again on the other map.
    expect(src).toContain("BASEMAP_STORAGE_KEY");
  });
});

describe("the pins follow the filter", () => {
  it("rebuilds markers into a layer group rather than at map creation", () => {
    const src = read(SRC);
    expect(src).toContain("layerGroup");
    // clearLayers is what makes a filter change visible. Without it the group
    // only ever grows and every category stays on screen.
    expect(src).toContain("clearLayers");
  });

  it("keys the marker effect on which locations are shown", () => {
    const src = read(SRC);
    expect(src).toContain("locationKey");
    // The dependency array of the marker effect must carry that key. If the
    // effect goes back to depending on [language] alone, the filter silently
    // stops reaching the map — the original bug, exactly.
    expect(src).toMatch(/\[\s*epoch,\s*locationKey,\s*language\s*\]/);
  });

  it("does not key the marker effect on the array identity", () => {
    // MapSection rebuilds `locs.filter(...)` on every render. Depending on the
    // array itself would redraw all pins — closing any open popup — whenever
    // unrelated state changed.
    const src = read(SRC);
    expect(src).not.toMatch(/\[\s*epoch,\s*locations,/);
  });
});

describe("the island guide can hand you to a taxi", () => {
  // app/taxi/book/page.tsx has read ?to=&toLat=&toLng= since it was written —
  // dropoffFromQuery() even labels the result `id: "map"`, so it was built to be
  // arrived at FROM a map. Nothing linked to it. The two halves are in different
  // files, so nothing but this test notices if one of them is renamed.
  it("sends the parameters the booking page actually reads", () => {
    const page = read("app/taxi/book/page.tsx");
    for (const param of ["to", "toLat", "toLng", "service"]) {
      expect(page, `booking page stopped reading ${param}`).toMatch(
        new RegExp(`\\b${param}\\??:`),
      );
    }
    const src = read(SRC);
    expect(src).toContain("/taxi/book?service=taxi&to=");
    expect(src).toContain("toLat=");
    expect(src).toContain("toLng=");
  });

  it("escapes the place name it puts in the URL", () => {
    // "Trou d'Argent" and "Baie aux Huîtres" both carry characters that break a
    // query string unencoded.
    const src = read(SRC);
    expect(src).toMatch(/to=\$\{encodeURIComponent\(locName\)\}/);
  });

  it("uses the name in the reader's own language", () => {
    // locName is the localize()d value. Sending loc.name would book a French
    // visitor to a string they never saw on screen.
    const src = read(SRC);
    expect(src).not.toMatch(/to=\$\{encodeURIComponent\(loc\.name\)\}/);
  });

  it("stays in the app", () => {
    // The directions link is target="_blank" because Google Maps is elsewhere.
    // This one is not: opening a new tab would drop the session, the chosen
    // language and the back stack on the way into a booking.
    const src = read(SRC);
    const taxiLine = src
      .split("\n")
      .find((l) => l.includes("/taxi/book?service=taxi"));
    expect(taxiLine).toBeTruthy();
    expect(taxiLine).not.toContain('target="_blank"');
  });

  it("names the button in all three languages", () => {
    const src = read(SRC);
    const block = src.slice(src.indexOf("const TAXI_LABEL"));
    for (const lang of ["en:", "fr:", "cr:"]) {
      expect(block.slice(0, 250), lang).toContain(lang);
    }
  });
});

describe("the popups say words, not variable names", () => {
  it("interpolates the translations instead of printing their path", () => {
    const src = read(SRC);
    // `{t.common.x}` inside a quoted string renders literally. Interpolated as
    // `${t.common.x}` it renders the sentence. The difference is one character
    // and it shipped.
    //
    // Comments are stripped first: the fix comment in that file QUOTES the
    // broken pattern to explain it, and a scan that cannot tell prose from code
    // would fail on the very note describing the bug it is guarding.
    expect(withoutComments(src)).not.toMatch(/["'][^"'\n]*(?<!\$)\{t\.common\./);
    expect(src).toContain("${escapeHtml(t.common.liveLocationOnly)}");
    expect(src).toContain("${escapeHtml(t.common.youAreHere)}");
  });
});
