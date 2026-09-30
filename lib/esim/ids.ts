import { createHmac, randomBytes, randomUUID, timingSafeEqual, createHash } from "node:crypto";

// ── Identifiers for an eSIM order ────────────────────────────────────────────
//
// THREE, and they do different jobs:
//
//   id     — UUID, generated HERE (never by the database) so the same value
//            can be handed to PayPal as reference_id and to the wholesaler as
//            transactionId BEFORE anything is written. That is what makes the
//            whole purchase idempotent: a retried provisioning call carries
//            the same transactionId and the wholesaler returns the order it
//            already created instead of charging us for a second eSIM.
//   ref    — "ES-" + six hex, for humans: the email subject, the support
//            WhatsApp, the lookup form. Worth nothing on its own.
//   key    — the credential in the install-page link (?k=…). An HMAC of the
//            order id and a per-order random salt, under a server secret. It
//            is never stored: it can be recomputed whenever a link is needed
//            (the email, the lookup form, the admin's "copy customer link"),
//            and rotating the salt revokes every link to that order at once.

export function newOrderId(): string {
  return randomUUID();
}

export function refFor(orderId: string): string {
  return `ES-${orderId.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

/** Normalise what a customer types: "es abc123", "ES-abc123 " → "ES-ABC123". */
export function normaliseRef(input: string): string | null {
  const m = /^\s*(?:ES)?[\s-]*([0-9A-F]{6})\s*$/i.exec(input ?? "");
  return m ? `ES-${m[1].toUpperCase()}` : null;
}

/** The per-order salt, stored as `access_token_hash` (64 hex chars). */
export function newOrderSalt(): string {
  return createHash("sha256").update(randomBytes(32)).digest("hex");
}

/** The secret the link keys are signed with. A dedicated one if set; else
 *  the admin session secret, which every deployment of this site has. */
export function linkSecret(): string {
  const s =
    process.env.ESIM_LINK_SECRET ||
    process.env.SESSION_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.ADMIN_PASSWORD ||
    "";
  if (!s) throw new Error("No secret available to sign eSIM links (set ESIM_LINK_SECRET)");
  return s;
}

export function orderLinkKey(orderId: string, salt: string, secret = linkSecret()): string {
  return createHmac("sha256", secret).update(`esim-link:${orderId}:${salt}`).digest("base64url").slice(0, 32);
}

/** Constant-time check of a presented key. */
export function linkKeyMatches(
  key: string | null | undefined,
  orderId: string,
  salt: string,
  secret = linkSecret(),
): boolean {
  if (!key || key.length !== 32) return false;
  const a = Buffer.from(orderLinkKey(orderId, salt, secret));
  const b = Buffer.from(key);
  return a.length === b.length && timingSafeEqual(a, b);
}
