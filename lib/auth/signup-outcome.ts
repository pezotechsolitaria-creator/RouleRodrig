// ── WHAT SUPABASE'S signUp() ACTUALLY TOLD YOU ──────────────────────────────
//
// Signing up with an address that ALREADY has an account is not an error.
// GoTrue answers 200 with no session, no error, and sends no email — on
// purpose, because replying "that address is taken" to an anonymous visitor is
// an account-enumeration oracle. Both login pages read that as "confirmation
// sent" and showed "check your email" for an email that would never arrive.
//
// From the production auth log, 2 September:
//
//   19:04:02  user_repeated_signup  status 200   <- no email sent, screen said
//   19:16:28  user_repeated_signup  status 200      "check your inbox"
//   19:04:44  invalid_credentials   status 400   <- then the password guessing
//   19:09:50  invalid_credentials   status 400
//
// The one signal that distinguishes the case is `identities`: a genuinely new
// user comes back with one, a repeated signup comes back with an EMPTY array.
// It is the documented way to detect this, and it is easy to get wrong in the
// direction that matters — treating "undefined" as "already registered" would
// tell every new customer to go and sign in to an account they do not have.
// So the empty array is required explicitly, and anything unexpected falls
// through to the safe answer.
//
// Kept out of the pages and tested, because the two of them must agree and
// because the failure is invisible: nothing errors, the user simply waits
// forever for a message nobody sent.

export type SignUpOutcome =
  /** Confirmation is off — they are signed in already. */
  | "session"
  /** The address already has an account. No email was sent; do not promise one. */
  | "already-registered"
  /** A real new signup: a confirmation email is on its way. */
  | "check-email";

type SignUpish = {
  session?: unknown;
  user?: { identities?: unknown[] | null } | null;
} | null;

export function signUpOutcome(data: SignUpish): SignUpOutcome {
  if (data?.session) return "session";
  const identities = data?.user?.identities;
  // Explicitly an empty ARRAY. `undefined` means the field was not returned,
  // which is not evidence of anything.
  if (Array.isArray(identities) && identities.length === 0) {
    return "already-registered";
  }
  return "check-email";
}
