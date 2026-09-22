import type { EmbeddedImage } from "@/lib/receipt-pdf";

// ── A LOGO THE DOCUMENT CAN CARRY ───────────────────────────────────────────
//
// Two problems, one module.
//
// SIZE. A logo uploaded from a phone is a 3-megapixel photo. Stored as a data
// URL it is megabytes of base64, copied onto every document that business ever
// issues and sent over the wire on every save. So the browser downscales and
// re-encodes before anything leaves it.
//
// FORMAT. The PDF embeds the image with /DCTDecode, which means the JPEG bytes
// are handed to the reader untouched and nothing here has to understand the
// format. A PNG would need /FlateDecode and a colour-space decision, so the
// re-encode below always produces JPEG — which conveniently also flattens
// transparency onto white, the way a printed document wants it.

/** Longest edge, in pixels. 320 is four times the 30pt the page draws it at. */
const MAX_EDGE = 320;
const QUALITY = 0.82;

/**
 * File → a small JPEG data URL, in the browser.
 *
 * Rejects rather than mangles: if the file is not an image the canvas will
 * fail to draw it, and a broken logo silently embedded in a customer document
 * is worse than a message saying it did not work.
 */
export async function fileToLogoDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("That is not an image.");
  }

  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser cannot resize the image.");

    // White underneath: a transparent PNG becomes black in a JPEG otherwise,
    // and a black square where a logo should be is a memorable kind of wrong.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);

    return canvas.toDataURL("image/jpeg", QUALITY);
  } finally {
    bitmap.close();
  }
}

/**
 * The width and height a JPEG declares about itself.
 *
 * The PDF image dictionary needs the intrinsic pixel size, and the only honest
 * source is the file. Walks the segment markers to the frame header (SOF0,
 * SOF1, SOF2 …) and reads the two 16-bit numbers in it.
 *
 * Returns null on anything it does not recognise, so a caller falls back to
 * the built-in logo rather than embedding a dictionary that lies about its
 * own image — which is how a reader ends up refusing the whole file.
 */
export function jpegSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null; // not SOI

  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = bytes[i + 1];

    // Standalone markers carry no length.
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    if (len < 2) return null;

    // Any SOFn except the four that are not frame headers.
    const isFrame =
      marker >= 0xc0 && marker <= 0xcf &&
      marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

    if (isFrame) {
      const height = (bytes[i + 5] << 8) | bytes[i + 6];
      const width = (bytes[i + 7] << 8) | bytes[i + 8];
      return width > 0 && height > 0 ? { width, height } : null;
    }
    i += 2 + len;
  }
  return null;
}

/** base64 → bytes, without Buffer, so this works in the browser too. */
function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * A stored data URL → what the PDF assembler wants, or null.
 *
 * Null means "use the built-in logo": a document with the wrong mark on it is
 * a smaller problem than a document no reader will open.
 */
export function dataUrlToEmbedded(dataUrl: string | null): EmbeddedImage | null {
  if (!dataUrl) return null;
  const prefix = "data:image/jpeg;base64,";
  if (!dataUrl.startsWith(prefix)) return null;
  const base64 = dataUrl.slice(prefix.length);
  try {
    const size = jpegSize(b64ToBytes(base64));
    return size ? { base64, width: size.width, height: size.height } : null;
  } catch {
    return null;
  }
}
