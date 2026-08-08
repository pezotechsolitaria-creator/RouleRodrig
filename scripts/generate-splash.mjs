// Generate the iOS launch images (apple-touch-startup-image) from ONE logo.
//
//   node scripts/generate-splash.mjs path/to/logo.png
//
// These are what an iPhone shows while the installed PWA boots. iOS will not
// scale a launch image: it picks the file whose media query matches the device
// exactly, so every supported screen needs its own file at its own pixel size.
//
// ── THE SPEC IS MEASURED, NOT INVENTED ──────────────────────────────────────
// Read off the existing apple-splash-1170-2532.png rather than guessed, so a
// regenerated set is indistinguishable from the hand-made originals:
//
//   background   rgb(10,10,10) — matches manifest.ts background_color (#0a0a0a),
//                which is what iOS paints around the image if anything mismatches
//   logo         36.0% of the canvas WIDTH, square
//   position     centred on both axes, exactly
//
// SIZES must stay in step with IOS_SPLASH in app/layout.tsx. A file listed there
// but missing here (or vice versa) means that device silently falls back to a
// white flash on launch — the exact ugliness these images exist to prevent.

import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BG = { r: 10, g: 10, b: 10, alpha: 1 };
const LOGO_WIDTH_RATIO = 0.36;

// [width, height] — device pixels, portrait.
const SIZES = [
  [1290, 2796], // iPhone 14/15/16 Pro Max
  [1284, 2778], // iPhone 12/13/14 Pro Max
  [1179, 2556], // iPhone 14/15/16 Pro
  [1242, 2688], // iPhone XS Max / 11 Pro Max
  [1170, 2532], // iPhone 12/13/14
  [1125, 2436], // iPhone X/XS/11 Pro
  [1080, 2340], // various Android-width iPhones / SE-class
  [828, 1792], // iPhone XR / 11
  [750, 1334], // iPhone 6/7/8/SE2
];

const src = process.argv[2];
if (!src) {
  console.error("Usage: node scripts/generate-splash.mjs <source-logo-image>");
  process.exit(1);
}

// fileURLToPath, not url.pathname — the latter is percent-encoded and the space
// in this repo's path silently redirects every write into a stray directory.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "public/splash");
await mkdir(outDir, { recursive: true });

for (const [w, h] of SIZES) {
  const logoSize = Math.round(w * LOGO_WIDTH_RATIO);
  const logo = await sharp(src)
    .resize(logoSize, logoSize, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const file = resolve(outDir, `apple-splash-${w}-${h}.png`);
  await sharp({ create: { width: w, height: h, channels: 4, background: BG } })
    .composite([{ input: logo, gravity: "centre" }])
    .png({ compressionLevel: 9 })
    .toFile(file);

  console.log(`✓ apple-splash-${w}-${h}.png   logo ${logoSize}px`);
}

console.log(`\n${SIZES.length} launch images written to public/splash/`);
console.log("Keep SIZES in step with IOS_SPLASH in app/layout.tsx.");
