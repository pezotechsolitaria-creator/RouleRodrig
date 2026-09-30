import { buildPickupQr } from "@/lib/orders/pickup-qr";

// The eSIM QR is drawn by the SAME encoder as the pickup QR — already pinned
// by a round-trip decode test (lib/orders/pickup-qr.test.ts), quiet zone and
// all. Only the payload differs: here it is the LPA string.

/** A standalone SVG: black modules on white, with the spec's quiet zone. */
export function qrSvg(payload: string, px = 480): string {
  const g = buildPickupQr(payload);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${g.span} ${g.span}" shape-rendering="crispEdges">` +
    `<rect width="${g.span}" height="${g.span}" fill="#fff"/>` +
    `<path transform="translate(${g.quiet} ${g.quiet})" d="${g.path}" fill="#000"/></svg>`
  );
}

/** PNG, base64 — for the email attachment (remote images are often blocked). */
export async function qrPngBase64(payload: string): Promise<string | null> {
  try {
    const sharp = (await import("sharp")).default;
    const png = await sharp(Buffer.from(qrSvg(payload))).png().toBuffer();
    return png.toString("base64");
  } catch (e) {
    console.error("[esim] QR png render failed", e);
    return null;
  }
}
