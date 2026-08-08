import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { guardShared } from "@/lib/rate-limit";

// ── "I have sent the transfer", for a guest (M21) ───────────────────────────
//
// The account-holder version of this is POST /api/orders/[id]/receipt →
// submit_payment_receipt(), which opens with `if v_customer is null then raise
// 'not authenticated'`. A guest order has customer_id NULL and no session, so
// that path can never run — which meant a guest who chose Bank transfer could
// see no bank details, report no payment, and watch auto_release_at cancel the
// order 48h later, possibly after wiring real money.
//
// Same credential as /api/orders/lookup (order number + the address that placed
// the order), same service-role-only RPC, same rate-limited single entry point.
// The RPC additionally requires customer_id IS NULL, so knowing a REGISTERED
// customer's order number and email still gets you nothing here.
const reportSchema = z.object({
  orderNumber: z.string().trim().min(6, "Enter your order number.").max(32),
  email: z.string().trim().toLowerCase().email("Enter the email you ordered with.").max(254),
});

const NOT_FOUND_CODE = "RR003";
const ILLEGAL_STATE_CODE = "RR004";
const VALIDATION_CODE = "RR005";
const METHOD_CODE = "RR009";

export async function POST(req: NextRequest) {
  // This mutates order state, so it is tighter than the read-only lookup (8/min):
  // there is no legitimate reason to declare a transfer more than a few times.
  const limited = await guardShared(req, "order-report-payment", 5, 60_000);
  if (limited) return limited;

  if (!hasServiceRole()) {
    console.error("report payment: SUPABASE_SERVICE_ROLE_KEY missing");
    return NextResponse.json({ error: "This is unavailable right now." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = reportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  const supabase = await getPrivileged();
  const { data, error } = await supabase.rpc("guest_report_payment", {
    p_order_number: parsed.data.orderNumber,
    p_email: parsed.data.email,
  });

  if (error) {
    // One message for "no such order" and "wrong email", same rule as the
    // lookup route: this must not confirm that an order number exists.
    if (error.code === NOT_FOUND_CODE) {
      return NextResponse.json(
        { error: "We couldn't find an order with that number and email." },
        { status: 404 },
      );
    }
    if (error.code === ILLEGAL_STATE_CODE) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error.code === METHOD_CODE) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error.code === VALIDATION_CODE) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("guest_report_payment failed", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }

  return NextResponse.json(data ?? { status: "awaiting_payment_confirmation" });
}
