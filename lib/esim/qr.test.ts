import { describe, expect, it, vi } from "vitest";
import jsQR from "jsqr";
import { buildPickupQr, QR_QUIET_ZONE } from "@/lib/orders/pickup-qr";

vi.mock("server-only", () => ({}));
const { qrSvg } = await import("./qr");

// The QR on the install page and in the email must decode to the EXACT
// activation string — a phone camera that reads anything else installs
// nothing, and the customer's only feedback is "invalid code".

const SCALE = 4;
function decode(payload: string): string | null {
  const qr = buildPickupQr(payload);
  const span = (qr.modules + QR_QUIET_ZONE * 2) * SCALE;
  const data = new Uint8ClampedArray(span * span * 4).fill(255);
  for (const m of qr.path.matchAll(/M(\d+) (\d+)h1v1h-1z/g)) {
    const c = Number(m[1]);
    const r = Number(m[2]);
    for (let dy = 0; dy < SCALE; dy++)
      for (let dx = 0; dx < SCALE; dx++) {
        const i = (((r + QR_QUIET_ZONE) * SCALE + dy) * span + (c + QR_QUIET_ZONE) * SCALE + dx) * 4;
        data[i] = data[i + 1] = data[i + 2] = 0;
      }
  }
  return jsQR(data, span, span)?.data ?? null;
}

describe("the eSIM QR", () => {
  it.each([
    "LPA:1$rsp-eu.redteamobile.com$A1B2C3D4E5F6G7H8",
    "LPA:1$smdp.io$K2-1ABCDEFG-HIJKLMN-OPQRSTU-VWXYZ12",
  ])("decodes back to the exact activation string %s", (lpa) => {
    expect(decode(lpa)).toBe(lpa);
  });

  it("renders as a self-contained white-backed SVG for the email attachment", () => {
    const svg = qrSvg("LPA:1$rsp.example.com$ABCD1234");
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('fill="#fff"');
    expect(svg).toContain('fill="#000"');
  });
});
