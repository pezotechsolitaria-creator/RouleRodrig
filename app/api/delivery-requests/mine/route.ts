import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/delivery-requests/mine — a signed-in customer's own Deliver Anything
// requests.
//
// The counterpart to the device-local list in lib/delivery/my-requests.ts. That
// one is a localStorage hint and cannot cross devices; this is the authoritative
// answer for anybody with an account, and it is the reason signing in is worth
// anything on this surface.
//
// Runs on the CUSTOMER'S OWN SESSION. my_delivery_requests() filters on
// auth.uid() internally and returns [] when there is none, so there is no
// identity for this route to get wrong and no service-role key involved.
//
// A guest gets an empty list rather than a 401: the caller is a component that
// renders nothing when the list is empty, and an error status there would mean
// every signed-out visitor to /deliver logs a failed request.

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ requests: [] });

  const { data, error } = await supabase.rpc("my_delivery_requests");
  if (error) {
    console.error("my_delivery_requests failed", error);
    // The list is an aid, not the page. A failure here must not stop somebody
    // posting a new request, so it degrades to "nothing to show".
    return NextResponse.json({ requests: [] });
  }
  return NextResponse.json({ requests: data ?? [] });
}
