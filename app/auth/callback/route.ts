import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safe-next";

// Google OAuth and email magic-links both land here with a `code`. We exchange
// it for a session (cookies are set by the SSR client) and forward on.
//
// Two defects fixed here (M20):
//
//  1. OPEN REDIRECT — `next` was interpolated raw into `${origin}${next}`, so
//     `?next=@evil.com` produced https://roulerodrig.com@evil.com, which the
//     URL parser resolves to host evil.com, and `?next=.evil.com` produced the
//     attacker-registrable roulerodrig.com.evil.com. Both survived the OAuth
//     round trip because /login and GoogleSignInButton forwarded the parameter
//     verbatim. safeNext() now allows only same-site paths.
//
//  2. WRONG DESTINATION ON FAILURE — every failed exchange sent the visitor to
//     /merchant/login?error=auth, including customers who started at /login
//     (an expired confirmation link, a cancelled OAuth). They landed on a
//     merchant-branded "Create your shop account" page which never even read
//     the error parameter, so nothing was explained. The failure now returns
//     to the flow the visitor actually came from.
//  3. CROSS-DEVICE CONFIRMATION FAILED SILENTLY. `code` is a PKCE grant: the
//     code_verifier lives in the browser that STARTED the flow. Someone who
//     signs up on a laptop and opens the confirmation on their phone — which is
//     the normal case, because mail is read on phones — arrived with a code
//     that cannot be exchanged here and were told the link had expired.
//     `token_hash` carries no verifier and works from any device, so it is
//     tried first. Same defect class as the reset page, which failed 100% of
//     the time for the same reason.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  // Default to the customer area. `/merchant` was the old default, which meant
  // a customer flow that lost its `next` silently ended up in the merchant app.
  const next = safeNext(searchParams.get("next"), "/orders");

  if (code || tokenHash) {
    const supabase = await createClient();

    // Device-independent path first.
    const { error } = tokenHash
      ? await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          // Supabase sends signup | invite | magiclink | email_change | recovery.
          // Anything unrecognised is treated as a plain email confirmation
          // rather than rejected, so a new template cannot break sign-in.
          type: (["signup", "invite", "magiclink", "email_change", "recovery"].includes(type ?? "")
            ? type
            : "email") as "signup" | "invite" | "magiclink" | "email_change" | "recovery" | "email",
        })
      : await supabase.auth.exchangeCodeForSession(code!);

    if (!error) {
      // Adopt guest orders placed with this address (M21).
      //
      // M20 called claim_guest_orders() from ONE place: the password sign-in
      // handler in /login. Every other way into a session lands here instead —
      // confirming a brand-new account, and Google OAuth — so the two paths the
      // post-purchase prompt on /orders/track actually pushes people down
      // ("Create account or sign in") adopted nothing, and the customer arrived
      // at an /orders page reading "No orders found" seconds after buying.
      // That is precisely where the invitation's promise had to hold.
      //
      // Safe to run on the merchant flow too: it matches on the caller's own
      // CONFIRMED address and updates only orders that have no owner, so for
      // anyone with no guest history it is a no-op returning 0.
      try {
        await supabase.rpc("claim_guest_orders");
      } catch (err) {
        // Never fail a sign-in over this — the orders are still adoptable on
        // the next sign-in, and the account itself is valid either way.
        console.error("claim_guest_orders failed in auth callback", err);
      }

      // ── AND THE INVITATIONS, FOR THE SAME REASON (M108) ──────────────────
      // The paragraph above describes exactly what had ALSO happened to
      // invitations: claim_organizer_invite was called only from the password
      // branch of /login, so anybody who did what their invitation email told
      // them to do — "create your account with this address" — confirmed that
      // account, landed HERE, and was never linked to the thing they had been
      // invited to. Creating an account is the one path that cannot go through
      // the password branch, so the invited were the people it missed.
      //
      // Claimed before the redirect so the destination below can be theirs.
      let claims = { organizer: false, merchant: false, driver: false };
      try {
        const { claimInvites } = await import("@/lib/invites/claim");
        claims = await claimInvites(supabase);
      } catch (err) {
        console.error("invite claim failed in auth callback", err);
      }

      // An explicit `next` still wins — a link to a specific page was asked for
      // on purpose. Only the default destination is redirected.
      if (next === "/orders") {
        const { homeForClaims } = await import("@/lib/invites/claim");
        const home = homeForClaims(claims);
        if (home) return NextResponse.redirect(`${origin}${home}`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  const failTarget = next.startsWith("/merchant") ? "/merchant/login" : "/login";
  return NextResponse.redirect(
    `${origin}${failTarget}?error=auth&next=${encodeURIComponent(next)}`,
  );
}
