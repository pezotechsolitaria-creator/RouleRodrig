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
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Default to the customer area. `/merchant` was the old default, which meant
  // a customer flow that lost its `next` silently ended up in the merchant app.
  const next = safeNext(searchParams.get("next"), "/orders");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
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
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  const failTarget = next.startsWith("/merchant") ? "/merchant/login" : "/login";
  return NextResponse.redirect(
    `${origin}${failTarget}?error=auth&next=${encodeURIComponent(next)}`,
  );
}
