// ── "I NEVER GOT THE EMAIL" ─────────────────────────────────────────────────
//
// A confirmation link can be lost to a spam folder, a typo in the address, or
// a provider that simply drops it. Without a way to ask again the only route
// back is to sign up a second time — and a second signup on the same address
// returns 200, sends NOTHING, and says nothing (see signup-outcome.ts). So the
// customer asks for the email in the one way that guarantees no email.
//
// Supabase rate-limits resends and reports the wait inside a human sentence:
//
//   "For security purposes, you can only request this after 47 seconds."
//
// Rendering that raw is bad in two ways: it is the provider's voice rather than
// the site's, and in French or Kreol it is English. Pulling the NUMBER out lets
// the screen say it in its own words and, more importantly, lets the button
// disable itself for exactly that long instead of inviting a click that will
// fail again.

/**
 * Seconds Supabase says to wait, or null when the message is not a rate limit.
 *
 * Deliberately conservative: anything unrecognised returns null and the caller
 * shows a generic failure rather than inventing a countdown.
 */
export function retryAfterSeconds(message?: string | null): number | null {
  if (!message) return null;
  const m = /after (\d+)\s*seconds?/i.exec(message);
  if (!m) return null;
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Is this failure just the rate limiter, rather than something actually wrong? */
export function isRateLimited(message?: string | null): boolean {
  if (!message) return false;
  return (
    retryAfterSeconds(message) !== null ||
    /rate limit|too many requests|only request this/i.test(message)
  );
}
