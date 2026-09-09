import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { shrinkImage } from "./shrink";
import { detectFileType } from "@/lib/file-signature";

const read = (p: string) => readFileSync(p, "utf8");

// ── TWO FORMATS THE PHONE PRODUCES AND THE APP REFUSED ──────────────────────
//
// AVIF: newer Android cameras and share sheets emit it. The signature sniffer
// did not know the brand, so detectFileType returned null and the upload was
// refused with "That file is not a photo." for a photo just taken. It failed
// ONLY on small files — a large AVIF is re-encoded to JPEG by the client
// shrinker before it ever reaches the server, so testing with a big photo would
// never show it.
//
// HEIC: what an iPhone on "High Efficiency" shoots, commonly 1–2 MB. Small
// enough to clear the cap and to skip the shrinker, so it was stored as .heic —
// which no browser but Safari renders. The driver's "View receipt" is a
// window.open on the signed URL, so on the Android phone at the door it is a
// blank tab.

/** A real ISO-BMFF header: [size][ftyp][major][minor][compatible brands...] */
function ftyp(major: string, compatible: string[] = []): File {
  const brands = [major, "\u0000\u0000\u0000\u0000", ...compatible];
  const size = 8 + brands.length * 4;
  const bytes = new Uint8Array(size + 16);
  bytes[0] = (size >> 24) & 0xff;
  bytes[1] = (size >> 16) & 0xff;
  bytes[2] = (size >> 8) & 0xff;
  bytes[3] = size & 0xff;
  "ftyp".split("").forEach((ch, i) => (bytes[4 + i] = ch.charCodeAt(0)));
  brands.forEach((b, bi) =>
    b.split("").forEach((ch, i) => (bytes[8 + bi * 4 + i] = ch.charCodeAt(0))),
  );
  return new File([bytes], "photo.bin", { type: "" });
}

describe("the sniffer knows what a phone produces", () => {
  it("recognises AVIF by its major brand", async () => {
    expect(await detectFileType(ftyp("avif"))).toBe("image/avif");
    expect(await detectFileType(ftyp("avis"))).toBe("image/avif");
  });

  it("recognises AVIF that hides behind the generic brand", async () => {
    // Plenty of AVIF files declare major brand "mif1" and put "avif" only in
    // the compatible list. Reading the major brand alone missed those.
    expect(await detectFileType(ftyp("mif1", ["mif1", "avif"]))).toBe("image/avif");
  });

  it("still recognises every HEIC brand", async () => {
    for (const b of ["heic", "heix", "hevc", "hevx", "msf1", "heif"]) {
      expect(await detectFileType(ftyp(b))).toBe("image/heic");
    }
  });

  it("treats a bare generic brand as HEIC, the safe end to be wrong on", async () => {
    // A converted AVIF still displays; an unconverted HEIC does not.
    expect(await detectFileType(ftyp("mif1"))).toBe("image/heic");
  });

  it("a corrupt box size cannot run off the end", async () => {
    const f = ftyp("avif");
    const bytes = new Uint8Array(await f.arrayBuffer());
    bytes[0] = 0xff; bytes[1] = 0xff; bytes[2] = 0xff; bytes[3] = 0xff;
    const bad = new File([bytes], "x.bin", { type: "" });
    await expect(detectFileType(bad)).resolves.toBe("image/avif");
  });

  it("does not mistake a JPEG or a PDF for either", async () => {
    const jpeg = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0])], "a.jpg");
    expect(await detectFileType(jpeg)).toBe("image/jpeg");
    const pdf = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0, 0, 0, 0])], "a.pdf");
    expect(await detectFileType(pdf)).toBe("application/pdf");
  });
});

describe("a small HEIC is converted, not waved through", () => {
  it("it no longer takes the already-small shortcut", () => {
    // The bug was that size was the ONLY reason to re-encode, so a 1.5 MB
    // iPhone HEIC — small and unopenable — was passed straight through.
    const src = read("lib/images/shrink.ts");
    expect(src).toMatch(/function needsConverting/);
    expect(src).toMatch(/alreadySmallEnough\(file\) && !needsConverting\(file\)/);
  });

  it("a conversion is kept even when it grows the file", () => {
    // A bigger JPEG the driver can open beats a smaller HEIC they cannot.
    const src = read("lib/images/shrink.ts");
    expect(src).toMatch(/blob\.size >= file\.size && !needsConverting\(file\)/);
  });

  it("AVIF is deliberately left alone", () => {
    // Every current browser renders it; re-encoding costs quality for nothing.
    const src = read("lib/images/shrink.ts");
    const fn = src.slice(src.indexOf("function needsConverting"));
    expect(fn.slice(0, 400)).not.toContain("avif");
  });

  it("and it still never throws", async () => {
    const heic = new File([new Uint8Array(100)], "IMG_0001.HEIC", { type: "image/heic" });
    await expect(shrinkImage(heic)).resolves.toBeDefined();
  });
});

describe("every upload route takes both formats", () => {
  const routes = [
    "app/api/delivery-requests/photo/route.ts",
    "app/api/delivery-requests/[id]/payment-proof/route.ts",
    "app/api/delivery-requests/[id]/id-document/route.ts",
  ];

  it("AVIF is allowed and gets its own extension", () => {
    for (const r of routes) {
      const src = read(r);
      expect(src, r).toContain('"image/avif"');
      expect(src, r).toMatch(/"image\/avif": "avif"/);
    }
  });

  it("HEIC is converted server-side as a backstop", () => {
    for (const r of routes) {
      const src = read(r);
      expect(src, r).toContain("makeViewable");
      // What is stored must be the CONVERTED bytes and type, not the original.
      expect(src, r).toMatch(/out\.body/);
      expect(src, r).toMatch(/contentType: out\.contentType/);
      expect(src, r).toMatch(/\$\{out\.ext\}/);
    }
  });

  it("the converter leaves evidence at full size", () => {
    // The private buckets are deliberately not resized — a receipt and an ID
    // are read by a human deciding whether money moved. Only the container
    // changes.
    const src = read("lib/images/optimise.ts");
    const fn = src.slice(src.indexOf("export async function makeViewable"));
    expect(fn).not.toContain(".resize(");
    expect(fn).toContain(".rotate()");
  });
});
