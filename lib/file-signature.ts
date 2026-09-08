// `file.type` on a multipart upload is whatever Content-Type the CLIENT
// declared for that part — trivially spoofed with a raw multipart POST
// (e.g. `curl -F "file=@payload.html;type=image/png"`). Trusting it, either
// for validation or for the Content-Type we hand back to storage, lets an
// attacker upload arbitrary HTML/JS labeled as an image and get it served
// with that Content-Type from our storage domain. detectFileType() reads the
// actual file signature (magic bytes) instead — the one thing a client can't
// lie about without the bytes actually being that format.

export type DetectedType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "application/pdf"
  | "image/heic"
  /** ── AVIF IS A PHOTO ─────────────────────────────────────────────────
   *  Newer Android cameras and share sheets hand out AVIF, and this sniffer
   *  did not know the brand — so detectFileType returned null and the upload
   *  was refused with "That file is not a photo." for a photo just taken.
   *
   *  It failed only on SMALL files: a large AVIF was re-encoded to JPEG by
   *  the client shrinker before it ever got here, so anyone testing with a
   *  big photo would never see it.
   *
   *  Kept distinct from image/heic because the two need opposite treatment:
   *  every current browser DISPLAYS avif and none displays heic. */
  | "image/avif"
  | null;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export async function detectFileType(file: File): Promise<DetectedType> {
  // 64 bytes, not 16: the compatible-brand list lives past offset 16 and is
  // what distinguishes an AVIF carrying a generic major brand from a HEIC.
  const bytes = new Uint8Array(await file.slice(0, 64).arrayBuffer());

  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return "application/pdf"; // %PDF

  // WEBP: "RIFF" .... "WEBP"
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return "image/webp";

  // ── HEIC and AVIF: both ISO base media files ──────────────────────────
  // "ftyp" box at offset 4, major brand at 8, minor version at 12, then a list
  // of COMPATIBLE BRANDS from 16 to the end of the box.
  //
  // Reading only the major brand is what missed AVIF. It is also not enough on
  // its own: plenty of AVIF files carry the generic major brand "mif1" and
  // declare "avif" only among the compatible brands, and the same is true of
  // HEIC. So both lists are read, and the compatible brands decide when the
  // major brand is the ambiguous generic one.
  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    const at = (i: number) =>
      String.fromCharCode(bytes[i], bytes[i + 1], bytes[i + 2], bytes[i + 3]);

    // Box size is a big-endian uint32 at offset 0. Clamp it to what we read,
    // and to a sane floor, so a corrupt size cannot spin or read past the end.
    const declared = (bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3];
    const end = Math.min(bytes.length, declared > 16 ? declared : 16);

    const brands = [at(8)];
    for (let i = 16; i + 4 <= end; i += 4) brands.push(at(i));

    const AVIF = ["avif", "avis"];
    const HEIC = ["heic", "heix", "hevc", "hevx", "hevm", "hevs", "msf1", "heif"];

    // AVIF first: a file declaring both is one a browser can render, and
    // treating it as HEIC would send it for a conversion it does not need.
    if (brands.some((b) => AVIF.includes(b))) return "image/avif";
    if (brands.some((b) => HEIC.includes(b))) return "image/heic";
    // "mif1"/"mif2" alone say only "some HEIF". Nothing further to go on, so
    // it is treated as HEIC — the branch that converts, which is the safe end
    // to be wrong on: a converted AVIF still displays, an unconverted HEIC
    // does not.
    if (brands.some((b) => b === "mif1" || b === "mif2")) return "image/heic";
  }

  return null;
}
