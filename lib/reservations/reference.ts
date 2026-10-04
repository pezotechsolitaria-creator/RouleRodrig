import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

// ── What a guest SAYS, and what a guest HOLDS ────────────────────────────────
//
// Two different things, on purpose.
//
// The REFERENCE (RR-8F42K) is for saying out loud on WhatsApp. Crockford
// base32 without I, L, O, U — no 1/I, 0/O or rude-word confusion — 5
// characters: 32^5 ≈ 33.5 million. It is not a secret and opens nothing: the
// public routes never resolve a reservation by reference alone.
//
// The ACCESS TOKEN is the secret in /booking/[token]: 32 random bytes,
// base64url (43 characters, 256 bits). Only its SHA-256 is stored. A leaked
// database cannot be turned back into working booking links, and the raw token
// is shown exactly once — in the create response, and in the links emailed.
//
// Server only (node:crypto).

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // no I L O U
export const REFERENCE_RE = /^RR-[0-9ABCDEFGHJKMNPQRSTVWXYZ]{5}$/;

export function generateReference(): string {
  let out = "";
  for (let i = 0; i < 5; i++) out += CROCKFORD[randomInt(CROCKFORD.length)];
  return `RR-${out}`;
}

/** Accepts what a guest might type: lower case, spaces, O for 0, I/L for 1. */
export function normalizeReference(input: string): string | null {
  const s = input
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/^RR-?/, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1")
    .replace(/U/g, "V");
  const ref = `RR-${s}`;
  return REFERENCE_RE.test(ref) ? ref : null;
}

export function generateAccessToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** A token is well-formed before it is ever hashed or looked up. */
export function isTokenShaped(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

/** Constant-time comparison of two hex hashes. */
export function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}
