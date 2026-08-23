// Generate the permanent, print-ready QR codes for the site.
//
//   node scripts/generate-qr.mjs
//
// Writes:
//   public/qr/roule-rodrigues-qr.svg           clean black & white, pure vector
//   public/qr/roule-rodrigues-qr.png           clean, 2048×2048
//   public/qr/roule-rodrigues-qr-branded.svg   logo in the centre
//   public/qr/roule-rodrigues-qr-branded.png   branded, 2048×2048
//
// ── WHY THESE ARE FILES IN THE REPO, NOT SOMETHING THE BROWSER DRAWS ────────
//
// A QR on a sticker outlives the code that made it. Generating it at request
// time would mean a printer's PDF depends on the site being up, on this
// script still existing, and on nobody changing a default — and a reprint two
// years from now would silently differ from the batch on the door. So the
// artwork is committed, and this script exists to REGENERATE it deliberately,
// not to serve it.
//
// It is also why the URL is baked in rather than routed through a redirect.
// A dynamic QR is somebody else's uptime printed on your signage.
//
// ── THE URL ─────────────────────────────────────────────────────────────────
//
// roulerodrig.com, not the .vercel.app alias: middleware.ts lists
// roule-rodrig.vercel.app in RETIRED_HOSTS and redirects away from it. A code
// pointing there would work only for as long as that redirect does, and a
// sticker cannot be edited afterwards.

import qrcode from "qrcode-generator";
import sharp from "sharp";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "qr");

/** What the code resolves to. Baked into the artwork itself. */
export const QR_TARGET = "https://roulerodrig.com/";

/**
 * Modules of white margin on every side.
 *
 * The spec's minimum is 4 and this is not decoration: without it a decoder
 * cannot reliably locate the finder patterns against whatever the code is
 * printed on. On paper, next to other ink, it is the difference between a scan
 * that works from any angle and one that works only sometimes.
 */
export const QUIET_ZONE = 4;

/**
 * Error correction H (~30% recoverable).
 *
 * Required for the branded version — the logo destroys real modules and H is
 * what buys them back. The clean version uses it too, deliberately: a printed
 * code gets scuffed, rained on and stuck to a curved surface, and the extra
 * redundancy costs only a slightly denser grid.
 */
export const EC_LEVEL = "H";

/** Logo width as a fraction of the code's width, excluding the quiet zone. */
export const LOGO_SCALE = 0.25;

/** Raster output size. 2048 is ~170mm at 300dpi — a poster, not a business card. */
const PNG_SIZE = 2048;

/**
 * The module matrix as a single SVG path, in module coordinates.
 *
 * One path rather than thousands of <rect> elements: it is the same geometry,
 * a fraction of the file size, and it opens in Illustrator as one object a
 * printer can recolour or scale without touching 900 shapes.
 */
function modulesToPath(qr, count) {
  const parts = [];
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col)) {
        parts.push(`M${col + QUIET_ZONE} ${row + QUIET_ZONE}h1v1h-1z`);
      }
    }
  }
  return parts.join("");
}

function buildMatrix(text) {
  // typeNumber 0 = the smallest version that fits the payload.
  const qr = qrcode(0, EC_LEVEL);
  qr.addData(text);
  qr.make();
  const count = qr.getModuleCount();
  return { qr, count, span: count + QUIET_ZONE * 2 };
}

/** Clean black-and-white SVG. Pure vector, no raster anywhere in it. */
function cleanSvg({ qr, count, span }) {
  const path = modulesToPath(qr, count);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${span} ${span}" width="${span}" height="${span}" shape-rendering="crispEdges" role="img" aria-label="QR code for ${QR_TARGET}">
  <title>Roulé Rodrigues — ${QR_TARGET}</title>
  <rect width="${span}" height="${span}" fill="#ffffff"/>
  <path d="${path}" fill="#000000"/>
</svg>
`;
}

/**
 * Branded SVG: the same code, with the app icon in the middle.
 *
 * The modules under the logo are painted out with a white plate first. A
 * decoder reading a clean white block recovers it through error correction; one
 * reading half a module under a photograph guesses, and guessing is how a code
 * scans on one phone and not another.
 *
 * The logo is a raster (public/icon-512.png) embedded as a data URI, so the
 * file stays self-contained — this one SVG is the whole artwork and a printer
 * needs nothing else. It is therefore not purely vector, which is exactly why
 * the clean version above exists and is the one to send for small print.
 */
function brandedSvg({ qr, count, span }, logoBase64) {
  const path = modulesToPath(qr, count);
  const logo = count * LOGO_SCALE;
  const pos = (span - logo) / 2;
  // A little white breathing room so the icon's own green edge never touches a
  // black module — that contact is what makes an edge ambiguous to a decoder.
  const plate = logo * 1.16;
  const platePos = (span - plate) / 2;
  const radius = plate * 0.18;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${span} ${span}" width="${span}" height="${span}" role="img" aria-label="QR code for ${QR_TARGET}">
  <title>Roulé Rodrigues — ${QR_TARGET}</title>
  <rect width="${span}" height="${span}" fill="#ffffff"/>
  <path d="${path}" fill="#000000" shape-rendering="crispEdges"/>
  <rect x="${platePos.toFixed(3)}" y="${platePos.toFixed(3)}" width="${plate.toFixed(3)}" height="${plate.toFixed(3)}" rx="${radius.toFixed(3)}" fill="#ffffff"/>
  <image x="${pos.toFixed(3)}" y="${pos.toFixed(3)}" width="${logo.toFixed(3)}" height="${logo.toFixed(3)}" href="data:image/png;base64,${logoBase64}" preserveAspectRatio="xMidYMid meet"/>
</svg>
`;
}

async function main() {
  await mkdir(outDir, { recursive: true });

  const matrix = buildMatrix(QR_TARGET);
  const logoBase64 = (await readFile(join(root, "public", "icon-512.png"))).toString("base64");

  const files = [
    ["roule-rodrigues-qr.svg", cleanSvg(matrix)],
    ["roule-rodrigues-qr-branded.svg", brandedSvg(matrix, logoBase64)],
  ];

  for (const [name, svg] of files) {
    await writeFile(join(outDir, name), svg, "utf8");
    // density is what makes sharp render the vector AT size rather than
    // rasterising small and scaling up a blurry result.
    const png = await sharp(Buffer.from(svg), { density: 600 })
      .resize(PNG_SIZE, PNG_SIZE, { fit: "contain", background: "#ffffff" })
      .png({ compressionLevel: 9 })
      .toBuffer();
    await writeFile(join(outDir, name.replace(/\.svg$/, ".png")), png);
    console.log(`  ${name}  +  ${name.replace(/\.svg$/, ".png")}`);
  }

  console.log(`\nTarget       ${QR_TARGET}`);
  console.log(`Version      ${matrix.count}×${matrix.count} modules, EC ${EC_LEVEL}`);
  console.log(`Quiet zone   ${QUIET_ZONE} modules`);
  console.log(`PNG          ${PNG_SIZE}×${PNG_SIZE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
