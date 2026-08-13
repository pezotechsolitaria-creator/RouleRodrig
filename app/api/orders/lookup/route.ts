import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { guardShared } from "@/lib/rate-limit";

// ── Account-free order lookup (M20) ────────────────────────────────────────
//
// A guest has no session, so RLS on `orders` (customer_id = auth.uid()) can
// never show them their own order. This is the marketplace twin of
// /api/bookings/lookup, which has served the account-free vehicle flow all
// along — the same shape rather than a second mechanism.
//
// The pair (order number, email) is the credential. Neither alone is enough:
// order numbers are short and human-readable (RR260808-A1B2C) so they must not
// be guessable into a disclosure, and an email alone must never list somebody's
// orders. The RPC is SECURITY DEFINER and granted to service_role ONLY, so this
// route is the sole way in and its rate limit is the real brute-force ceiling.
const lookupSchema = z.object({
  orderNumber: z.string().trim().min(6, "Enter your order number.").max(32),
  email: z.string().trim().toLowerCase().email("Enter the email you ordered with.").max(254),
});

export async function POST(req: NextRequest) {
  // Deliberately tighter than checkout: this is the only guessable surface in
  // the marketplace, so 8/min per IP is the brute-force budget.
  const limited = await guardShared(req, "order-lookup", 8, 60_000);
  if (limited) return limited;

  if (!hasServiceRole()) {
    console.error("order lookup: SUPABASE_SERVICE_ROLE_KEY missing");
    return NextResponse.json({ error: "Order lookup is unavailable right now." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = lookupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  const supabase = await getPrivileged();
  const { data, error } = await supabase.rpc("lookup_order", {
    p_order_number: parsed.data.orderNumber,
    p_email: parsed.data.email,
  });

  if (error) {
    console.error("lookup_order failed", error);
    return NextResponse.json({ error: "We couldn't look that up. Please try again." }, { status: 500 });
  }

  // One message for "no such order" and "wrong email", so this cannot be used
  // to confirm that an order number exists — the same rule the RR003 codes
  // follow elsewhere in this codebase.
  if (!data) {
    return NextResponse.json(
      { error: "We couldn't find an order with that number and email." },
      { status: 404 },
    );
  }

  // What is still rateable on this order (M97), fetched alongside rather than
  // folded into lookup_order(): that function is long, load-bearing for the
  // whole tracking page, and adding a join to it to serve a ratings widget is
  // how a payment-tracking page breaks. A failure here costs the widget and
  // never the lookup — someone chasing a payment must still see their order.
  let reviewable: unknown = null;
  const { data: rev, error: revError } = await supabase.rpc("guest_order_reviewable", {
    p_order_number: parsed.data.orderNumber,
    p_email: parsed.data.email,
  });
  if (revError) console.error("guest_order_reviewable failed", revError);
  else reviewable = rev;

  return NextResponse.json({ order: data, reviewable });
}
