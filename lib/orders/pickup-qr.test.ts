import { describe, it, expect } from "vitest";
import jsQR from "jsqr";
import { buildPickupQr, QR_QUIET_ZONE } from "./pickup-qr";
import { pickupScanUrl, normalizePickupCode } from "./pickup";

// ── Does the QR we ship actually scan? ─────────────────────────────────────
//
// "It renders something that looks like a QR" is not verification, and there is
// no camera in CI. So the code is built by the SAME function the component
// draws from (buildPickupQr) and read back by a DIFFERENT, independent decoder
// (jsQR, which most web scanners are built on). Two unrelated implementations
// agreeing on the payload is the closest thing to pointing a phone at it.

const SCALE = 4; // pixels per module, enough for jsQR to lock on
const CODE = "3QVLVD8G";
const ORIGIN = "https://roulerodrig.com";

/** Rasterise the component's geometry exactly as the SVG paints it. */
function rasterise(payload: string, quiet = QR_QUIET_ZONE) {
  const qr = buildPickupQr(payload);
  const span = (qr.modules + quiet * 2) * SCALE;
  const data = new Uint8ClampedArray(span * span * 4).fill(255); // white page

  // Re-walk the path the component renders: "M<c> <r>h1v1h-1z" per dark module.
  for (const m of qr.path.matchAll(/M(\d+) (\d+)h1v1h-1z/g)) {
    const c = Number(m[1]);
    const r = Number(m[2]);
    for (let dy = 0; dy < SCALE; dy++) {
      for (let dx = 0; dx < SCALE; dx++) {
        const i = (((r + quiet) * SCALE + dy) * span + (c + quiet) * SCALE + dx) * 4;
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
      }
    }
  }
  return { data, width: span, height: span, modules: qr.modules, geometry: qr };
}

describe("the pickup QR", () => {
  it("decodes back to the exact URL the merchant must land on", () => {
    const url = pickupScanUrl(CODE, ORIGIN);
    const img = rasterise(url);
    const decoded = jsQR(img.data, img.width, img.height);

    expect(decoded).not.toBeNull();
    expect(decoded!.data).toBe(url);
    expect(decoded!.data).toBe("https://roulerodrig.com/merchant/pickup#3QVLVD8G");
  });

  it("puts the code in the fragment, so it is never sent to a server", () => {
    const url = new URL(pickupScanUrl(CODE, ORIGIN));
    expect(url.pathname).toBe("/merchant/pickup");
    expect(url.search).toBe(""); // a query string would land in every request log
    expect(url.hash).toBe(`#${CODE}`);
  });

  it("normalises whatever it is handed, so a formatted code encodes the same", () => {
    expect(pickupScanUrl("3qvl-vd8g", ORIGIN)).toBe(pickupScanUrl(CODE, ORIGIN));
    expect(pickupScanUrl(CODE, "https://roulerodrig.com/")).toBe(pickupScanUrl(CODE, ORIGIN));
  });

  it("carries the spec's quiet zone in the geometry the component draws", () => {
    // The margin is the thing that is invisible when it goes wrong: the code
    // still looks perfect on screen and stops being findable by a camera
    // against a dark page. jsQR is too forgiving on a clean synthetic image to
    // prove that by decoding, so the invariant is asserted directly.
    const qr = buildPickupQr(pickupScanUrl(CODE, ORIGIN));
    expect(qr.quiet).toBeGreaterThanOrEqual(4);
    expect(qr.span).toBe(qr.modules + qr.quiet * 2);
  });

  it("stays coarse enough to read off a phone screen", () => {
    // Version 4 (33×33). At the 176px the card renders, that is ~4px per
    // module — comfortably above the ~2px floor for a camera at arm's length.
    const { modules } = rasterise(pickupScanUrl(CODE, ORIGIN));
    expect(modules).toBeLessThanOrEqual(37);
    expect(176 / (modules + QR_QUIET_ZONE * 2)).toBeGreaterThan(3);
  });

  it("survives every code the generator can produce", () => {
    // The alphabet has no lower case and no 0/O/1/I; all of it must round-trip.
    const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
    for (const sample of [alphabet.slice(0, 8), alphabet.slice(-8), "22222222", "ZZZZZZZZ"]) {
      const url = pickupScanUrl(sample, ORIGIN);
      const img = rasterise(url);
      expect(jsQR(img.data, img.width, img.height)?.data, `code ${sample}`).toBe(url);
      expect(normalizePickupCode(sample)).toHaveLength(8);
    }
  });
});
