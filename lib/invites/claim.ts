import type { SupabaseClient } from "@supabase/supabase-js";

// ── Taking ownership of an account somebody else created for you ────────────
//
// Four kinds of invitation now exist — event organiser, kitchen cook, merchant
// and delivery partner — and every one works the same way: a row carries an
// email address and no owner, and the first person to sign in with that exact
// CONFIRMED address becomes the owner. No token travels in the link, so there
// is nothing to leak, forward or replay.
//
// ── WHY THEY ARE CLAIMED TOGETHER ──────────────────────────────────────────
// Because claiming them separately is how the organiser claim quietly broke.
// `claim_organizer_invite` was called from exactly one place: the password
// branch of /login. Every other way into a session — confirming a brand-new
// account, Google OAuth, a magic link — lands in /auth/callback instead, which
// never called it. An organiser who did what the invitation email told them to
// do (create an account with this address) therefore did NOT get their access,
// because creating the account routes through the callback.
//
// That is the same defect the callback's own comment describes for
// claim_guest_orders, one function call further down the same file. Adding a
// fifth invitation type without fixing it would have made a known bug worse, so
// all of them are claimed here and this is called from BOTH paths.
//
// Every call is idempotent and safe for anybody: each function reads auth.uid()
// itself, matches only a CONFIRMED address, and returns claimed:false when
// there is nothing addressed to that person. For a normal customer all four are
// no-ops.

export type ClaimedRoles = {
  organizer: boolean;
  merchant: boolean;
  driver: boolean;
};

/** Where this person should land, given what they just claimed. */
export function homeForClaims(claims: ClaimedRoles): string | null {
  if (claims.merchant) return "/merchant";
  if (claims.driver) return "/driver";
  if (claims.organizer) return "/organizer";
  return null;
}

/**
 * Claim everything addressed to the signed-in user.
 *
 * Never throws and never blocks a sign-in: a claim that fails is retried on the
 * next sign-in, whereas an exception here would lock somebody out of their own
 * account over a background link-up.
 */
export async function claimInvites(supabase: SupabaseClient): Promise<ClaimedRoles> {
  const claimed: ClaimedRoles = { organizer: false, merchant: false, driver: false };

  const one = async (fn: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase.rpc(fn);
      if (error) {
        console.error(`${fn} failed`, error);
        return false;
      }
      return !!(data as { claimed?: boolean } | null)?.claimed;
    } catch (err) {
      console.error(`${fn} threw`, err);
      return false;
    }
  };

  // Kitchen staff claim by assignment rather than returning a role, and the
  // kitchen app already calls it on entry; running it here as well simply means
  // a cook is linked at sign-in instead of on their first visit.
  const [organizer, merchant, driver] = await Promise.all([
    one("claim_organizer_invite"),
    one("claim_merchant_invite"),
    one("claim_driver_invite"),
    (async () => {
      try {
        await supabase.rpc("claim_kitchen_invites");
      } catch (err) {
        console.error("claim_kitchen_invites failed", err);
      }
    })(),
  ]);

  claimed.organizer = organizer;
  claimed.merchant = merchant;
  claimed.driver = driver;
  return claimed;
}
