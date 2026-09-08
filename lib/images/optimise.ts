import "server-only";
import sharp from "sharp";

// ── MAKING A PHONE PHOTO FIT ON A PHONE ─────────────────────────────────────
//
// The public `uploads` bucket held 393 objects averaging 612 kB, the largest
// 4 MB, and nothing anywhere resized them: a photo taken on a phone was stored
// at full camera resolution and served to every visitor at that size. On the
// Supabase free plan both egress quotas are 5 GB a month and Storage CDN hits
// spend the cached one, so file size is the whole game.
//
// 2000px on the longest edge is the largest any of these images is ever
// displayed — a full-bleed hero on a desktop at 2x — and WebP at quality 82 is
// where the eye stops noticing on photographic content. Together they take a
// 573 kB camera JPEG to roughly 100 kB without a visible difference at the
// sizes this site actually renders.
//
// EXIF IS STRIPPED, and that is a privacy fix as much as a size one: photos
// taken on a phone carry GPS coordinates, and this bucket is PUBLIC. Every
// image uploaded before today still carries whatever its camera wrote.
//
// WHAT IS DELIBERATELY NOT RESIZED: the private buckets. A bank transfer
// receipt, an ID document and a payment proof are evidence — they are read by a
// human deciding whether money moved, they are fetched a handful of times ever,
// and compressing them to save bytes nobody spends would be trading legibility
// for nothing.

/**
 * The longest edge we will store, and the quality we store it at.
 *
 * Chosen by measurement, not by feel. Re-encoding three real objects from the
 * live bucket at 2000/1600/1400px and q82/q78:
 *
 *   3,122 kB camera JPEG (4032x3024) -> 511 kB at 2000/q82, 345 kB at 1600/q82
 *     676 kB JPEG        (1170x650)  ->  58 kB at every setting (already small)
 *   3,721 kB PNG         (1086x1448) -> 616 kB at 2000, 586 kB at 1400
 *
 * Past 1600 the curve flattens and the bytes do not. 1600px is still wider than
 * any slot this site renders, next/image derives its smaller variants from it,
 * and the people actually loading these pages are on mobile data on Rodrigues.
 */
const MAX_EDGE = 1600;
const QUALITY = 80;

export type OptimisedImage = {
  body: Buffer;
  contentType: string;
  ext: string;
  originalBytes: number;
  bytes: number;
};

/**
 * Re-encode an uploaded image for the web, or hand back the original unchanged.
 *
 * Never returns something WORSE than what it was given: if the re-encode comes
 * out bigger — which happens with small, already-optimised images, and with
 * flat graphics where PNG beats WebP — the original is kept. The one exception
 * is HEIC, which is converted whatever the size, because no browser on this
 * island can display it and the file is useless as it stands.
 */
export async function optimiseForWeb(
  input: ArrayBuffer | Buffer,
  detectedType: string,
): Promise<OptimisedImage> {
  const original = Buffer.isBuffer(input) ? input : Buffer.from(input);
  const isHeic = detectedType === "image/heic";

  const fallback: OptimisedImage = {
    body: original,
    contentType: detectedType,
    ext: EXT[detectedType] ?? "jpg",
    originalBytes: original.byteLength,
    bytes: original.byteLength,
  };

  try {
    const encoded = await sharp(original, { failOn: "none" })
      // Phone photos are stored sideways with an EXIF orientation flag. Once
      // the metadata is stripped that flag goes with it, so the rotation has to
      // be baked into the pixels first or every portrait photo lands on its side.
      .rotate()
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: QUALITY })
      .toBuffer();

    // A bigger file is not an optimisation. Keep the original unless it is a
    // format browsers cannot render at all.
    if (!isHeic && encoded.byteLength >= original.byteLength) return fallback;

    return {
      body: encoded,
      contentType: "image/webp",
      ext: "webp",
      originalBytes: original.byteLength,
      bytes: encoded.byteLength,
    };
  } catch (err) {
    // A corrupt or exotic file should not cost the owner an upload. Store what
    // we were given — the size limit and the magic-byte check already ran.
    if (isHeic) throw err instanceof Error ? err : new Error("Could not read that image.");
    console.error("image optimise failed, storing original", err);
    return fallback;
  }
}

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
};

// ── EVIDENCE THE DRIVER CAN ACTUALLY OPEN ───────────────────────────────────
//
// The private delivery buckets are deliberately NOT resized — the reasoning is
// at the top of this file, and it stands: a transfer receipt and an ID document
// are read by a human deciding whether money moved, and trading legibility for
// bytes nobody spends is a bad deal.
//
// But there is a difference between a big file and an UNREADABLE one. An iPhone
// on "High Efficiency" shoots HEIC, and an iPhone HEIC is commonly 1–2 MB — so
// it passes the size cap, passes the client shrinker untouched (nothing to
// shrink), and is stored as .heic with contentType image/heic.
//
// Then the driver taps "View receipt" or "View ID", which is a window.open() on
// the signed storage URL. No browser except Safari can render HEIC. On the
// Android phone standing at the customer's door that is a download prompt or a
// blank tab — the driver cannot see the document the whole gate exists to show
// them, on a cash job they cannot start without it.
//
// So: convert the format, keep every pixel. No resize, quality 88, and the EXIF
// rotation baked in before the metadata goes — which also strips the GPS tag a
// phone writes into a photo of somebody's identity card.
//
// AVIF is deliberately NOT converted. Every current browser displays it, and
// re-encoding it would cost quality for nothing.

const EVIDENCE_QUALITY = 88;

export type ViewableUpload = {
  /** What to hand to storage — the original File when nothing was needed. */
  body: File | Buffer;
  contentType: string;
  ext: string;
  converted: boolean;
};

export async function makeViewable(
  file: File,
  detectedType: string,
): Promise<ViewableUpload> {
  const passThrough: ViewableUpload = {
    body: file,
    contentType: detectedType,
    ext: EVIDENCE_EXT[detectedType] ?? "jpg",
    converted: false,
  };

  // Everything except HEIC is already something a phone can open.
  if (detectedType !== "image/heic") return passThrough;

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const jpeg = await sharp(buf, { failOn: "none" })
      // Before the metadata is dropped, or a portrait photo lands on its side.
      .rotate()
      .jpeg({ quality: EVIDENCE_QUALITY })
      .toBuffer();
    return {
      body: jpeg,
      contentType: "image/jpeg",
      ext: "jpg",
      converted: true,
    };
  } catch (err) {
    // Storing the original beats losing the customer's receipt. It leaves the
    // driver unable to view that one file, so it is logged loudly rather than
    // swallowed — sharp reports heif input support in this build, so reaching
    // here means something changed.
    console.error("HEIC conversion failed, storing original", err);
    return passThrough;
  }
}

const EVIDENCE_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/heic": "heic",
  "application/pdf": "pdf",
};
