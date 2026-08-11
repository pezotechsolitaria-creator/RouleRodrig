import { describe, it, expect } from "vitest";
import { qrSvgDocument, qrFilename } from "./qr-svg";
import { buildPickupQr, QR_QUIET_ZONE } from "./orders/pickup-qr";

const LINK = "https://roulerodrig.com/?ref=PARTNER123";

describe("qrSvgDocument", () => {
  it("is a standalone SVG document", () => {
    const svg = qrSvgDocument(LINK);

    expect(svg.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg.trimEnd().endsWith("</svg>")).toBe(true);
  });

  it("draws the same modules the shared encoder produces", () => {
    // Guards against this file drifting into a second QR implementation.
    const { path, span } = buildPickupQr(LINK);
    const svg = qrSvgDocument(LINK);

    expect(svg).toContain(`viewBox="0 0 ${span} ${span}"`);
    expect(svg).toContain(`d="${path}"`);
  });

  it("keeps the quiet zone, which is what makes it scannable off paper", () => {
    const svg = qrSvgDocument(LINK);
    expect(svg).toContain(`translate(${QR_QUIET_ZONE} ${QR_QUIET_ZONE})`);
  });

  it("paints an opaque white background so a dark UI cannot bleed through", () => {
    const svg = qrSvgDocument(LINK);
    expect(svg).toMatch(/<rect width="\d+" height="\d+" fill="#ffffff"\/>/);
  });

  it("honours a requested pixel size without touching the viewBox", () => {
    const { span } = buildPickupQr(LINK);
    const svg = qrSvgDocument(LINK, 512);

    expect(svg).toContain('width="512" height="512"');
    expect(svg).toContain(`viewBox="0 0 ${span} ${span}"`);
  });

  it("encodes different links differently", () => {
    expect(qrSvgDocument("https://roulerodrig.com/?ref=A")).not.toBe(
      qrSvgDocument("https://roulerodrig.com/?ref=B"),
    );
  });
});

describe("qrFilename", () => {
  it("labels the file so it is recognisable in a downloads folder", () => {
    expect(qrFilename("PARTNER123")).toBe("roule-rodrigues-qr-PARTNER123.svg");
  });

  it("strips anything unsafe for a filename", () => {
    expect(qrFilename("../etc/passwd")).toBe("roule-rodrigues-qr-etcpasswd.svg");
  });

  it("still produces a usable name with no label", () => {
    expect(qrFilename("")).toBe("roule-rodrigues-qr.svg");
  });
});
