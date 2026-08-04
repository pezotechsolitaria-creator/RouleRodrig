import { describe, expect, it } from "vitest";
import { detectFileType, isUuid } from "./file-signature";

function fileOf(bytes: number[], declaredType: string, name = "f"): File {
  return new File([new Uint8Array(bytes)], name, { type: declaredType });
}

describe("detectFileType (magic bytes, not the declared MIME type)", () => {
  it("recognizes a real PNG regardless of declared type", async () => {
    const png = fileOf([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "image/png");
    expect(await detectFileType(png)).toBe("image/png");
  });

  it("recognizes a real JPEG", async () => {
    const jpeg = fileOf([0xff, 0xd8, 0xff, 0xe0], "image/jpeg");
    expect(await detectFileType(jpeg)).toBe("image/jpeg");
  });

  it("recognizes a real WEBP", async () => {
    const webp = fileOf(
      [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50],
      "image/webp",
    );
    expect(await detectFileType(webp)).toBe("image/webp");
  });

  it("rejects HTML/script content declared as image/png (the spoofing attack from the review)", async () => {
    const html = "<script>alert(document.domain)</script>";
    const bytes = Array.from(new TextEncoder().encode(html));
    const spoofed = fileOf(bytes, "image/png", "payload.png");
    expect(await detectFileType(spoofed)).toBeNull();
  });

  it("rejects a PNG's declared type on content that doesn't match (cross-labeled)", async () => {
    // Real JPEG bytes, but the client claims it's a PNG — detection must go
    // by the bytes, so callers can catch the mismatch against file.type too.
    const jpegBytesLabeledPng = fileOf([0xff, 0xd8, 0xff, 0xe0], "image/png");
    expect(await detectFileType(jpegBytesLabeledPng)).toBe("image/jpeg");
  });

  it("returns null for an empty or truncated file", async () => {
    expect(await detectFileType(fileOf([], "image/png"))).toBeNull();
    expect(await detectFileType(fileOf([0x89, 0x50], "image/png"))).toBeNull();
  });
});

describe("isUuid", () => {
  it("accepts a well-formed UUID", () => {
    expect(isUuid("4205c5ea-4fa9-46cc-99aa-94a7750b5583")).toBe(true);
  });

  it("rejects path traversal and malformed input", () => {
    expect(isUuid("../../../etc/passwd")).toBe(false);
    expect(isUuid("' OR 1=1--")).toBe(false);
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid("")).toBe(false);
  });
});
