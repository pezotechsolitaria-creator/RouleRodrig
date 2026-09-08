// ── A PHOTO FROM A PHONE IS TOO BIG TO SEND ─────────────────────────────────
//
// Every upload on this platform caps at 4 MB. A photo straight off a modern
// phone is routinely 3–10 MB: a 12 MP Android JPEG lands around 4–6 MB, and a
// 48 MP sensor on "full resolution" goes well past 10 MB.
//
// Nothing anywhere shrank them. So the flow that this product leans on hardest
// — the 2022 census records that 44% of Rodriguans over 60 cannot read or
// write, which is WHY there is a camera button beside the description — was the
// flow most likely to stop with an error, on the device everybody uses.
//
// It is also the worst possible moment for it. The receipt upload is what
// releases a driver who is standing at a shop; the ID upload is what releases a
// cash job at the door. "Too big" there means somebody is stuck in the street.
//
// ── WHY IN THE BROWSER AND NOT ON THE SERVER ──────────────────────────────
// Because the point is not only the cap. It is the UPLOAD: on Rodrigues 3G a
// 6 MB photo is a minute and a half of holding a phone still, and it fails
// halfway often enough that people stop trying. 1600px at q0.82 is a legible
// receipt in ~250 KB — about twenty times less to push through a bad signal.
//
// ── IT NEVER THROWS ───────────────────────────────────────────────────────
// Every failure path returns the ORIGINAL file. A browser too old for
// createImageBitmap, a HEIC the canvas cannot decode, a tainted canvas, an
// out-of-memory on a cheap phone — in all of them the upload proceeds exactly
// as it did before and the server decides. Shrinking is an improvement on the
// old behaviour, never a new way to fail.

/** Longest edge after shrinking. A receipt or an ID card is legible well below
 *  this; 1600 is chosen so a printed page still reads. */
const MAX_EDGE = 1600;

/** Aim well under the 4 MB cap, not at it — the multipart envelope and the
 *  base64 of a data URL both add to what actually goes over the wire. */
const TARGET_BYTES = 1_500_000;

/** Tried in order until one lands under TARGET_BYTES. The last is accepted
 *  whatever it weighs: a very noisy photo may not compress, and sending
 *  something slightly large beats refusing to send at all. */
const QUALITY_LADDER = [0.82, 0.7, 0.6, 0.5];

/** Anything already small enough is passed straight through — no re-encode, so
 *  no generation loss and no work on a slow phone. */
function alreadySmallEnough(file: File): boolean {
  return file.size <= TARGET_BYTES;
}

/** A PDF is a document, not an image. Some banks hand one out as the receipt,
 *  and putting it through a canvas would destroy it. */
function isPdf(file: File): boolean {
  return (
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf")
  );
}

/**
 * Decode to something the canvas can draw.
 *
 * createImageBitmap first, with `imageOrientation: "from-image"` — that is what
 * applies the EXIF rotation tag. Without it a photo taken in portrait on
 * Android uploads sideways, which on an ID document is the difference between
 * readable and not.
 *
 * The <img> fallback is for browsers without createImageBitmap, and for those
 * that have it but reject the options argument. Modern browsers ALSO honour
 * EXIF on <img> by default, so orientation survives either way.
 */
async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      try {
        return await createImageBitmap(file);
      } catch {
        // Fall through to the <img> path.
      }
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("decode failed"));
      img.src = url;
    });
  } finally {
    // Revoked after the promise settles either way; the decoded pixels are
    // already in memory by then.
    URL.revokeObjectURL(url);
  }
}

function sizeOf(img: ImageBitmap | HTMLImageElement): {
  w: number;
  h: number;
} {
  const w = "naturalWidth" in img ? img.naturalWidth : img.width;
  const h = "naturalHeight" in img ? img.naturalHeight : img.height;
  return { w, h };
}

function toBlob(
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/jpeg", quality),
  );
}

/**
 * Shrink a camera photo so it fits, and so it arrives.
 *
 * Returns the ORIGINAL file unchanged when it is already small enough, when it
 * is a PDF, or when anything at all goes wrong.
 */
export async function shrinkImage(file: File): Promise<File> {
  if (isPdf(file) || alreadySmallEnough(file)) return file;
  // No DOM: server render, or a test. Nothing to do and nothing to break.
  if (typeof document === "undefined") return file;

  try {
    const img = await decode(file);
    const { w, h } = sizeOf(img);
    if (!w || !h) return file;

    // Never scale UP. A big-but-small-dimensioned image (a screenshot of a
    // bank app, say) is re-encoded at its own size rather than blown up.
    const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));

    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    // A JPEG has no alpha channel, so anything transparent would come out
    // black. White is what a scanned document looks like.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img as CanvasImageSource, 0, 0, canvas.width, canvas.height);
    if ("close" in img && typeof img.close === "function") img.close();

    for (const q of QUALITY_LADDER) {
      const blob = await toBlob(canvas, q);
      if (!blob) return file;
      const last = q === QUALITY_LADDER[QUALITY_LADDER.length - 1];
      if (blob.size <= TARGET_BYTES || last) {
        // Re-encoding a HEIC produces a JPEG, so the NAME has to follow or the
        // server's extension mapping writes a .heic full of JPEG bytes.
        const name = file.name.replace(/\.[^.]+$/, "") || "photo";
        // Only worth it if it actually helped. A tiny PNG logo can grow.
        if (blob.size >= file.size) return file;
        return new File([blob], `${name}.jpg`, {
          type: "image/jpeg",
          lastModified: file.lastModified,
        });
      }
    }
    return file;
  } catch {
    // Old browser, undecodable HEIC, out of memory on a cheap phone. The
    // upload proceeds exactly as it did before this function existed.
    return file;
  }
}
