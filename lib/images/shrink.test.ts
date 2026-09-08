import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { shrinkImage } from "./shrink";

const read = (p: string) => readFileSync(p, "utf8");

// ── A PHOTO FROM A PHONE WAS TOO BIG TO SEND ────────────────────────────────
//
// Every upload here caps at 4 MB and nothing shrank anything. A 12 MP Android
// JPEG is 4–6 MB; a 48 MP sensor on full resolution goes past 10 MB. So the
// three upload points this product leans on hardest — the request photo that
// exists because 44% of over-60s in Rodrigues cannot read or write, the
// transfer receipt that releases a driver standing in a shop, and the ID that
// releases a cash job at the door — all refused the camera they were built for.
//
// These are unit tests where the logic is pure and source assertions where the
// behaviour lives in a browser API vitest has no DOM for.

const file = (bytes: number, name: string, type: string) =>
  new File([new Uint8Array(bytes)], name, { type });

describe("it never makes things worse", () => {
  it("passes a small photo straight through, unre-encoded", async () => {
    // No generation loss and no work on a slow phone.
    const small = file(200_000, "receipt.jpg", "image/jpeg");
    expect(await shrinkImage(small)).toBe(small);
  });

  it("never touches a PDF", async () => {
    // Some banks hand out a PDF receipt. A canvas would destroy it.
    const pdf = file(6_000_000, "transfer.pdf", "application/pdf");
    expect(await shrinkImage(pdf)).toBe(pdf);
    const byName = file(6_000_000, "TRANSFER.PDF", "");
    expect(await shrinkImage(byName)).toBe(byName);
  });

  it("returns the original when there is no DOM to draw with", async () => {
    // Server render, or this test. The upload proceeds exactly as before.
    const big = file(6_000_000, "photo.jpg", "image/jpeg");
    expect(await shrinkImage(big)).toBe(big);
  });

  it("never rejects, whatever it is handed", async () => {
    // Fail-open is the whole contract: shrinking is an improvement on the old
    // behaviour, never a new way to fail. The server's cap still stands behind
    // it.
    const junk = file(9_000_000, "", "application/octet-stream");
    await expect(shrinkImage(junk)).resolves.toBeDefined();
  });
});

describe("the source keeps the promises the callers rely on", () => {
  const src = read("lib/images/shrink.ts");

  it("aims well under the 4 MB cap, not at it", () => {
    // The multipart envelope adds to what actually goes over the wire.
    const m = src.match(/const TARGET_BYTES = ([0-9_]+);/);
    expect(m).not.toBeNull();
    expect(Number(m![1].replace(/_/g, ""))).toBeLessThan(4 * 1024 * 1024);
  });

  it("applies EXIF rotation", () => {
    // Without this a portrait photo from Android uploads sideways, which on an
    // ID document is the difference between readable and not.
    expect(src).toContain('imageOrientation: "from-image"');
  });

  it("renames a re-encoded HEIC to .jpg", () => {
    // The server maps extension from mime; a .heic full of JPEG bytes is a
    // file nothing will open.
    expect(src).toMatch(/\.jpg`/);
  });

  it("gives up rather than growing a file", () => {
    expect(src).toMatch(/if \(blob\.size >= file\.size\) return file;/);
  });

  it("has a decode fallback for browsers without createImageBitmap", () => {
    expect(src).toContain("new Image()");
  });
});

describe("every upload in the journey goes through it", () => {
  it("the request photo does", () => {
    const src = read("app/deliver/PhotoInput.tsx");
    expect(src).toContain("shrinkImage");
    expect(src).toMatch(/const file = await shrinkImage\(input\)/);
  });

  it("the receipt and the ID both do", () => {
    const src = read("app/deliver/[id]/RequestTracker.tsx");
    expect(src.match(/void shrinkImage\(f\)\.then/g) ?? []).toHaveLength(2);
  });

  it("the pickers no longer hide HEIC, which the server has always allowed", () => {
    // An iPhone on "High Efficiency" produces image/heic. Leaving it out of
    // accept= hid the photo from the picker on the device most people hold.
    const src = read("app/deliver/[id]/RequestTracker.tsx");
    expect(src.match(/image\/heic/g) ?? []).toHaveLength(2);
    for (const route of [
      "app/api/delivery-requests/photo/route.ts",
      "app/api/delivery-requests/[id]/payment-proof/route.ts",
      "app/api/delivery-requests/[id]/id-document/route.ts",
    ]) {
      expect(read(route)).toContain("image/heic");
    }
  });
});
