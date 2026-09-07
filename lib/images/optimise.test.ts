import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { optimiseForWeb } from "./optimise";

// A real behavioural test, not a source scan: this is the one piece of egress
// work that is pure logic, so it can be executed rather than asserted about.

/** A photograph-like image: gradients and noise, the way a camera file is. */
async function photo(width: number, height: number): Promise<Buffer> {
  const px = Buffer.alloc(width * height * 3);
  for (let i = 0; i < px.length; i += 3) {
    const p = i / 3;
    px[i] = (p % width) & 0xff;
    px[i + 1] = ((p / width) | 0) & 0xff;
    px[i + 2] = (p * 2654435761) & 0xff;
  }
  return sharp(px, { raw: { width, height, channels: 3 } }).jpeg({ quality: 95 }).toBuffer();
}

describe("a camera photo is made to fit on a phone", () => {
  it("caps the longest edge at 1600 and re-encodes to WebP", async () => {
    const original = await photo(3000, 2000);
    const out = await optimiseForWeb(original, "image/jpeg");

    expect(out.contentType).toBe("image/webp");
    expect(out.ext).toBe("webp");

    const meta = await sharp(out.body).metadata();
    expect(meta.width).toBe(1600);
    expect(meta.height).toBe(1067);
    expect(out.bytes).toBeLessThan(out.originalBytes);
  });

  it("does not enlarge an image that is already small", async () => {
    const original = await photo(400, 300);
    const out = await optimiseForWeb(original, "image/jpeg");
    const meta = await sharp(out.body).metadata();
    expect(meta.width).toBe(400);
    expect(meta.height).toBe(300);
  });

  it("strips EXIF, because this bucket is public and phones write GPS into it", async () => {
    const withExif = await sharp(await photo(2000, 1500))
      .withMetadata({ exif: { IFD0: { Copyright: "Roule Rodrigues", Software: "test" } } })
      .toBuffer();
    expect((await sharp(withExif).metadata()).exif).toBeTruthy();

    const out = await optimiseForWeb(withExif, "image/jpeg");
    expect((await sharp(out.body).metadata()).exif).toBeFalsy();
  });

  it("never returns something bigger than it was given", async () => {
    // A tiny flat graphic: WebP loses to PNG here, and storing the bigger file
    // would be an "optimisation" that costs egress rather than saving it.
    const flat = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 255, g: 0, b: 0 } },
    })
      .png()
      .toBuffer();

    const out = await optimiseForWeb(flat, "image/png");
    expect(out.bytes).toBeLessThanOrEqual(out.originalBytes);
    if (out.bytes === out.originalBytes) {
      // Kept as-is, so the stored type must still describe what is stored.
      expect(out.contentType).toBe("image/png");
      expect(out.ext).toBe("png");
    }
  });

  it("reports both sizes so a caller can log what it saved", async () => {
    const original = await photo(2400, 1600);
    const out = await optimiseForWeb(original, "image/jpeg");
    expect(out.originalBytes).toBe(original.byteLength);
    expect(out.bytes).toBe(out.body.byteLength);
  });
});
