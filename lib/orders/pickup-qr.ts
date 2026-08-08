import qrcode from "qrcode-generator";

// The pickup QR's geometry, kept out of lib/orders/pickup.ts on purpose.
//
// pickup.ts is imported by the merchant redeem box, three API routes and the
// order pages, none of which draw a QR — so the encoder lives here, in a module
// that only components/orders/PickupQr.tsx pulls in, and it does so with a
// dynamic import. Verified in the build: it ends up in its own 19.9 KB chunk
// that nothing else reaches, so a customer downloads it only when they actually
// have an order waiting to be collected.
//
// This is a pure function so the round-trip test (pickup-qr.test.ts) can decode
// what the component really draws, with an independent decoder, rather than
// re-implementing the drawing and proving nothing.

/**
 * Modules of white margin around the code.
 *
 * The spec's minimum is 4, and this is not a style choice. Without it the code
 * still looks perfect on screen and becomes unreliable in the one situation
 * that matters — a phone camera pointed at a DARK UI, where the code's edge
 * blends into the page and the decoder cannot find the finder patterns.
 */
export const QR_QUIET_ZONE = 4;

export type PickupQrGeometry = {
  /** A single SVG path of 1×1 module squares, in module coordinates. */
  path: string;
  /** Modules per side (33 for a version-4 code). */
  modules: number;
  /** viewBox side length, including the quiet zone on both edges. */
  span: number;
  quiet: number;
};

export function buildPickupQr(payload: string): PickupQrGeometry {
  // typeNumber 0 = smallest version that fits. Error correction "M" (~15%) is
  // right for a screen held across a counter: the failure mode is glare and a
  // shaky hand, not a torn label, and a higher level would only shrink the
  // modules for no real gain.
  const qr = qrcode(0, "M");
  qr.addData(payload);
  qr.make();

  // One <path> rather than N² <rect>: a version-4 code is 1,089 modules, and
  // that many DOM nodes is a visible hitch on the mid-range Android phones
  // this is aimed at.
  const modules = qr.getModuleCount();
  let path = "";
  for (let r = 0; r < modules; r++) {
    for (let c = 0; c < modules; c++) {
      if (qr.isDark(r, c)) path += `M${c} ${r}h1v1h-1z`;
    }
  }

  return { path, modules, span: modules + QR_QUIET_ZONE * 2, quiet: QR_QUIET_ZONE };
}
