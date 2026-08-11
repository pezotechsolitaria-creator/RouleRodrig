import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/file-signature";
import { guard } from "@/lib/rate-limit";

// The customer's view of their own delivery, including the PIN the driver will
// ask for at the door. Authorisation lives entirely in the RPC (M61): a
// signed-in owner, or a guest proving it with the order's own email. This route
// decides nothing — it forwards a session and a claim.
export async function GET(req: NextRequest) {
  // The email branch is a guessable credential in principle, so it gets the
  // same treatment as the rest of the guest surface rather than being left open.
  const limited = guard(req, "order-delivery", 30, 60_000);
  if (limited) return limited;

  const url = new URL(req.url);
  const orderId = url.searchParams.get("orderId") ?? "";
  const email = url.searchParams.get("email");
  if (!isUuid(orderId)) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("delivery_view_for_customer", {
    p_order_id: orderId,
    p_email: email,
  });

  if (error) {
    console.error("delivery_view_for_customer failed", error);
    return NextResponse.json({ error: "Could not load delivery." }, { status: 500 });
  }
  // Null covers both "no delivery on this order" and "you may not see it" — the
  // caller cannot tell the two apart, which is the point.
  if (!data) return NextResponse.json({ delivery: null });

  return NextResponse.json({ delivery: data });
}
