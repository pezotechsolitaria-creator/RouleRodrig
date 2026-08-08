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

export type PickupCode = {
  code: string | null;
  issuedAt?: string | null;
  expiresAt?: string | null;
  redeemedAt?: string | null;
};
