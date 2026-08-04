// `file.type` on a multipart upload is whatever Content-Type the CLIENT
// declared for that part — trivially spoofed with a raw multipart POST
// (e.g. `curl -F "file=@payload.html;type=image/png"`). Trusting it, either
// for validation or for the Content-Type we hand back to storage, lets an
// attacker upload arbitrary HTML/JS labeled as an image and get it served
// with that Content-Type from our storage domain. detectFileType() reads the
// actual file signature (magic bytes) instead — the one thing a client can't
// lie about without the bytes actually being that format.

export type DetectedType = "image/jpeg" | "image/png" | "image/webp" | "application/pdf" | "image/heic" | null;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export async function detectFileType(file: File): Promise<DetectedType> {
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());

  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return "application/pdf"; // %PDF

  // WEBP: "RIFF" .... "WEBP"
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return "image/webp";

  // HEIC/HEIF: ISO base media file, "ftyp" box at offset 4, brand at offset 8.
  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
    if (["heic", "heix", "hevc", "hevx", "mif1", "msf1", "heif"].includes(brand)) return "image/heic";
  }

  return null;
}
