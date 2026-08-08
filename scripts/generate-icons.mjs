// Generate every icon asset from ONE square source image.
//
//   node scripts/generate-icons.mjs path/to/logo-mark.png
//
// Writes:
//   public/icon-192.png            PWA / <link rel=icon>      purpose "any"
//   public/icon-512.png            PWA / <link rel=icon>      purpose "any"
//   public/icon-192-maskable.png   Android adaptive icon      purpose "maskable"
//   public/icon-512-maskable.png   Android adaptive icon      purpose "maskable"
//   public/apple-icon.png          iOS home screen (180×180)
//   app/favicon.ico                browser tab + Google results (16/32/48)
//
// ── WHY MASKABLE ICONS ARE SEPARATE FILES ───────────────────────────────────
// app/manifest.ts previously declared the SAME two files as both "any" and
// "maskable". That is the bug behind the clipped wordmark on the home screen:
// Android takes a maskable icon and crops it to whatever shape the launcher
// uses — usually a circle — keeping only the central "safe zone" of 80% of the
// width. Artwork that reaches the edges loses its edges, and a wordmark running
// edge to edge loses its last letters.
//
// Declaring one file as both purposes is asking for two incompatible things:
// "any" wants the artwork to fill the square, "maskable" wants it inset with a
// bleed of background colour around it. So this generates both: a tight version,
// and a padded one whose artwork sits inside the safe circle.
//
// SAFE_ZONE_SCALE 0.8 is the value the spec guarantees: a launcher may crop to
// a circle of 80% of the icon's width, so everything that must survive has to
// fit inside that.

import sharp from "sharp";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SAFE_ZONE_SCALE = 0.8;

const src = process.argv[2];
if (!src) {
  console.error("Usage: node scripts/generate-icons.mjs <source-square-image>");
  process.exit(1);
}

// fileURLToPath, NOT url.pathname. A file:// pathname is percent-ENCODED, so any
// space in a parent folder name arrives as "%20" — this repo lives under
// "…/Bureau/Roule Rodrigues/…", and the naive version silently wrote a whole
// stray "Roule%20Rodrigues" directory tree instead of touching the real one.
// Every asset appeared to generate successfully while nothing changed.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = (p) => resolve(root, p);

/**
 * Background colour to bleed the maskable padding with, sampled from a real
 * corner patch at FULL resolution.
 *
 * Do not be tempted to downscale the whole image to 3×3 and read a corner — it
 * looks equivalent and is not. That average includes the central artwork, so for
 * this logo it produced rgb(233,231,218) against a true background of
 * rgb(254,246,233): different enough to leave a visible rectangle where the
 * padding met the art. Measured, then fixed.
 */
async function edgeColour(input) {
  const meta = await sharp(input).metadata();
  const patch = Math.max(4, Math.round(meta.width * 0.02));
  const { data, info } = await sharp(input)
    .extract({ left: 0, top: 0, width: patch, height: patch })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let r = 0;
  let g = 0;
  let b = 0;
  const px = info.width * info.height;
  for (let i = 0; i < data.length; i += 3) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
  }
  const c = { r: Math.round(r / px), g: Math.round(g / px), b: Math.round(b / px), alpha: 1 };
  console.log(`   source ${meta.width}×${meta.height}, padding colour rgb(${c.r},${c.g},${c.b})`);
  return c;
}

async function square(input, size) {
  return sharp(input).resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } });
}

/** Artwork inset into the maskable safe zone, on a bled background. */
async function maskable(input, size, bg) {
  const inner = Math.round(size * SAFE_ZONE_SCALE);
  const art = await sharp(input).resize(inner, inner, { fit: "contain", background: bg }).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: bg } })
    .composite([{ input: art, gravity: "centre" }])
    .png();
}

/**
 * Pack PNGs into a single .ico.
 *
 * sharp cannot write ICO, and this format is small enough to build by hand:
 * a 6-byte directory header, one 16-byte entry per image, then the payloads.
 * PNG-inside-ICO is supported by every browser still in use and by Google's
 * favicon crawler, which is the consumer that actually matters here — it probes
 * /favicon.ico before it will read a <link> tag.
 */
async function buildIco(input, sizes) {
  const pngs = [];
  for (const size of sizes) {
    // ensureAlpha + palette:false are REQUIRED, not tidiness.
    //
    // Next.js decodes app/favicon.ico during the build and rejects anything that
    // is not RGBA: "Format error decoding Ico: The PNG is not in RGBA format!"
    // and the whole build fails. sharp drops the alpha channel when a source is
    // fully opaque, and may emit a palette PNG for a flat illustration — both
    // produce a valid .ico that every browser accepts and that Next refuses.
    const buf = await (await square(input, size))
      .ensureAlpha()
      .png({ palette: false, compressionLevel: 9 })
      .toBuffer();
    pngs.push({ size, buf });
  }
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type 1 = icon
  header.writeUInt16LE(pngs.length, 4);

  let offset = 6 + pngs.length * 16;
  const entries = [];
  for (const { size, buf } of pngs) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0); // 0 means 256
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2); // palette size
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // colour planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(buf.length, 8);
    e.writeUInt32LE(offset, 12);
    entries.push(e);
    offset += buf.length;
  }
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.buf)]);
}

const { width, height } = await sharp(src).metadata();
if (width !== height) {
  console.warn(`⚠  Source is ${width}×${height}, not square. Icons will be letterboxed — crop it first.`);
}
if (width < 512) {
  console.warn(`⚠  Source is only ${width}px wide. 512px minimum, 1024px preferred, or icons will look soft.`);
}

const bg = await edgeColour(src);

await mkdir(out("public"), { recursive: true });

await (await square(src, 192)).png().toFile(out("public/icon-192.png"));
await (await square(src, 512)).png().toFile(out("public/icon-512.png"));
await (await square(src, 180)).png().toFile(out("public/apple-icon.png"));
console.log("✓ icon-192.png, icon-512.png, apple-icon.png");

await (await maskable(src, 192, bg)).toFile(out("public/icon-192-maskable.png"));
await (await maskable(src, 512, bg)).toFile(out("public/icon-512-maskable.png"));
console.log(`✓ maskable variants (artwork inset to ${SAFE_ZONE_SCALE * 100}% safe zone)`);

await writeFile(out("app/favicon.ico"), await buildIco(src, [16, 32, 48]));
console.log("✓ favicon.ico (16/32/48)");

console.log("\nNext: bump the service-worker cache in public/sw.js so returning visitors");
console.log("get the new icons, then commit and push.");
