import { describe, it, expect } from "vitest";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import jsQR from "jsqr";
import { QR_TARGET, QR_ASSETS } from "./qr";

// ── THE PRINTED CODE MUST GO WHERE WE THINK IT GOES ─────────────────────────
//
// These are the files that get sent to a printer and stuck on a door. Once a
// sticker exists it cannot be edited, so the only moment to catch a wrong URL
// is before it is printed — and "I generated it with the right string" is not
// evidence. This DECODES the committed artwork with an independent decoder and
// reads back what a phone camera would.
//
// It matters most for the branded version: the logo destroys real modules, and
// whether error correction recovers them is a property of the finished image,
// not of the intent behind it.

const QR_DIR = join(__dirname, "..", "public", "qr");
// Read from lib/qr.ts, not restated here: the point of the test is that the
// ARTWORK agrees with what the app believes, so restating the URL would let
// both drift together and still pass.
const TARGET = QR_TARGET;

/** Decode a PNG the way a camera would — downscaled, not at print resolution. */
async function decode(file: string, size = 600): Promise<string | null> {
  const buf = readFileSync(join(QR_DIR, file));
  const { data, info } = await sharp(buf)
    .resize(size, size)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const result = jsQR(new Uint8ClampedArray(data), info.width, info.height);
  return result?.data ?? null;
}

const PNGS = ["roule-rodrigues-qr.png", "roule-rodrigues-qr-branded.png"];
const SVGS = ["roule-rodrigues-qr.svg", "roule-rodrigues-qr-branded.svg"];

describe("the committed QR codes resolve to the live site", () => {
  it.each(PNGS)("%s decodes to the canonical URL", async (file) => {
    expect(await decode(file)).toBe(TARGET);
  });

  it("does not point at the retired vercel.app host", async () => {
    // middleware.ts lists roule-rodrig.vercel.app in RETIRED_HOSTS. A code
    // pointing there works only for as long as that redirect does, and a
    // sticker cannot be edited afterwards.
    for (const file of PNGS) {
      expect(await decode(file)).not.toMatch(/vercel\.app/);
    }
  });

  it("still decodes small, the way a phone actually sees it", async () => {
    // 300px is a code on a business card at arm's length. If it survives that,
    // a poster is trivial. The branded one is the real test: it is missing
    // modules under the logo.
    for (const file of PNGS) {
      expect(await decode(file, 300), `${file} failed at 300px`).toBe(TARGET);
    }
  });
});

describe("the files are fit for a printer", () => {
  it.each(PNGS)("%s is at least 1024×1024", async (file) => {
    const meta = await sharp(readFileSync(join(QR_DIR, file))).metadata();
    expect(meta.width).toBeGreaterThanOrEqual(1024);
    expect(meta.height).toBeGreaterThanOrEqual(1024);
    expect(meta.width).toBe(meta.height);
  });

  it("the clean SVG is pure vector — no embedded raster", () => {
    // This is the one to send for small print. A printer scaling a vector to
    // any size gets crisp edges; an embedded photograph does not.
    const svg = readFileSync(join(QR_DIR, "roule-rodrigues-qr.svg"), "utf8");
    expect(svg).toMatch(/<path /);
    expect(svg).not.toMatch(/<image/);
    expect(svg).not.toMatch(/data:image/);
  });

  it("the branded SVG carries its logo inside it, so it needs no other file", () => {
    // Self-contained on purpose: a printer opening this gets the whole artwork,
    // not an SVG with a broken link where the bird should be.
    const svg = readFileSync(join(QR_DIR, "roule-rodrigues-qr-branded.svg"), "utf8");
    expect(svg).toMatch(/<image/);
    expect(svg).toMatch(/data:image\/png;base64,/);
    expect(svg).not.toMatch(/href="\/|href="\.\./);
  });

  it.each(SVGS)("%s declares a square viewBox with a quiet zone", (file) => {
    const svg = readFileSync(join(QR_DIR, file), "utf8");
    const m = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
    expect(m, `${file} has no square viewBox`).toBeTruthy();
    const [, w, h] = m!;
    expect(w).toBe(h);
    // 29 modules + 4 quiet on each side = 37. Anything smaller means the
    // margin was dropped, which is the classic reason a printed code will not
    // scan against a busy background.
    expect(Number(w)).toBeGreaterThanOrEqual(29 + 8);
  });

  it.each(SVGS)("%s is black on white, with no transparency to print grey", (file) => {
    const svg = readFileSync(join(QR_DIR, file), "utf8");
    expect(svg).toMatch(/fill="#ffffff"/);
    expect(svg).toMatch(/fill="#000000"/);
  });

  it("the paths the app serves are the files that exist", () => {
    // A component pointing at /qr/wrong-name.svg renders a broken image and no
    // error anywhere. These are the exact strings SiteQrCode uses.
    for (const pair of Object.values(QR_ASSETS)) {
      for (const rel of Object.values(pair)) {
        const name = rel.replace("/qr/", "");
        expect(statSync(join(QR_DIR, name)).size, `${rel} does not exist`).toBeGreaterThan(0);
      }
    }
  });

  it("every file is committed and non-trivial", () => {
    for (const f of [...PNGS, ...SVGS]) {
      expect(statSync(join(QR_DIR, f)).size, `${f} is suspiciously small`).toBeGreaterThan(2000);
    }
  });
});
