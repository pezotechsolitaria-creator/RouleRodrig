// ── THE NUMBER A PHONE MESSAGES TO GET A CALLMEBOT KEY ──────────────────────
//
// Three screens printed this, and they did not agree: the driver's page and the
// notifications page said +34 644 51 95 23, the owner's phone setup said
// +34 644 84 71 89. CallMeBot's own instructions (callmebot.com/blog/
// free-api-whatsapp-messages, read 29 Sep 2026) list exactly one number, and
// it is neither: +34 611 021 695. A driver who messages a dead number never
// gets a key, and without one no ride offer can reach them on WhatsApp.
//
// One constant, so the next change is one edit. If CallMeBot moves again, check
// that page and change it here.

/** The CallMeBot bot, as a person would type it into their contacts. */
export const CALLMEBOT_NUMBER = "+34 611 021 695";

/** What they send it, word for word. */
export const CALLMEBOT_OPT_IN = "I allow callmebot to send me messages";

/**
 * The key out of whatever the owner pasted, or null when there is none.
 *
 * The driver's page says "Send the code you get back to Roulé Rodrigues", so
 * what arrives is as likely to be CallMeBot's whole reply as the bare code.
 * Stored as typed, that sentence would count as "WhatsApp ready" — the check
 * only asks for a non-empty key — while every offer to that driver failed.
 *
 * Accepted: a bare code (letters and digits, no spaces), or a sentence that
 * says "APIKEY is <code>" / "apikey: <code>", or failing both, the one run of
 * five or more digits in it. Anything else is refused, so the owner is asked
 * again instead of saving a key that can never work.
 */
export function extractCallMeBotKey(input: string | null | undefined): string | null {
  const s = (input ?? "").trim();
  if (!s) return null;
  if (/^[A-Za-z0-9]{4,40}$/.test(s)) return s;
  const labelled = s.match(/api\s*key\W*(?:is\W*)?([A-Za-z0-9]{4,40})\b/i);
  if (labelled) return labelled[1];
  const digits = s.match(/\d{5,12}/g);
  return digits && digits.length === 1 ? digits[0] : null;
}
