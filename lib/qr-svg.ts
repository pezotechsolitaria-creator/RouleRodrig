import { buildPickupQr } from "./orders/pickup-qr";

// ── A referral QR you can actually save ──────────────────────────────────────
//
// The partner and admin screens rendered their referral QR with an <img> from
// api.qrserver.com and offered a link labelled "Open / download QR". It could
// not download: the `download` attribute is ignored on a cross-origin URL, so
// the browser navigated to the image instead and left the user to work it out.
//
// It also meant every referral link was handed to a third-party service just to
// draw a square, and the result was a fixed-size PNG — for something whose
// stated purpose is "print the QR for your reception".
//
// This builds the code locally with the encoder already in the bundle, as an
// SVG. Vector, so it prints sharp at any size; same-origin, so it downloads.

/**
 * A standalone SVG document for `payload`.
 *
 * `width`/`height` are set in pixels so the file has a sensible default size
 * when opened or dropped into a document, while the viewBox keeps it infinitely
 * scalable for print.
 */
export function qrSvgDocument(payload: string, sizePx = 1024): string {
  // Reuses the pickup encoder deliberately — one QR implementation in the repo,
  // one set of round-trip tests proving it decodes. The quiet zone matters here
  // too: this code gets printed and photographed across a reception desk.
  const { path, span, quiet } = buildPickupQr(payload);

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${sizePx}" height="${sizePx}" ` +
    `viewBox="0 0 ${span} ${span}" shape-rendering="crispEdges" ` +
    `role="img" aria-label="Roule Rodrigues referral QR code">\n` +
    `  <rect width="${span}" height="${span}" fill="#ffffff"/>\n` +
    `  <g transform="translate(${quiet} ${quiet})" fill="#000000"><path d="${path}"/></g>\n` +
    `</svg>\n`
  );
}

/** Filename that says what it is once it is sitting in a downloads folder. */
export function qrFilename(label: string): string {
  const safe = label.replace(/[^A-Za-z0-9-]/g, "").slice(0, 40);
  return `roule-rodrigues-qr${safe ? `-${safe}` : ""}.svg`;
}
