// Pickup codes — the eight characters a customer shows at the counter.
//
// The database stores and compares them normalised (upper case, no separator);
// humans read them in two groups of four. Both sides of that are here so the
// customer screen, the guest screen and the merchant's redeem box cannot
// disagree about what a code looks like.

const CODE_LENGTH = 8;

/** Strip anything a keyboard or a paste might add, and upper-case. */
export function normalizePickupCode(raw: string): string {
  return raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, CODE_LENGTH);
}

/** `A7K2-9MTX` — grouped for reading aloud, which is how it is usually used. */
export function formatPickupCode(code: string): string {
  const n = normalizePickupCode(code);
  return n.length > 4 ? `${n.slice(0, 4)}-${n.slice(4)}` : n;
}

export function isCompletePickupCode(raw: string): boolean {
  return normalizePickupCode(raw).length === CODE_LENGTH;
}

/** Where a scanned pickup QR sends the merchant. */
export const PICKUP_SCAN_PATH = "/merchant/pickup";

/**
 * The URL a pickup QR encodes.
 *
 * The code rides in the FRAGMENT, not the query string, and that is the whole
 * design. A fragment is never transmitted to the server, so the code stays out
 * of Vercel's request logs, out of any proxy in front of us, and out of the
 * Referer header — while `?c=CODE` would be written to a log line for every
 * scan. The merchant page reads it from `location.hash` in the browser and
 * POSTs it, which is the only place it needs to exist.
 *
 * Encoding a URL rather than the bare code is what makes this work without an
 * in-app scanner: iPhone and Android camera apps both offer to open a URL they
 * see, so the merchant's own camera does the decoding and we ship no scanning
 * code, request no camera permission, and depend on no BarcodeDetector support.
 */
export function pickupScanUrl(code: string, origin: string): string {
  return `${origin.replace(/\/$/, "")}${PICKUP_SCAN_PATH}#${normalizePickupCode(code)}`;
}

export type PickupCode = {
  code: string | null;
  issuedAt?: string | null;
  expiresAt?: string | null;
  redeemedAt?: string | null;
};
