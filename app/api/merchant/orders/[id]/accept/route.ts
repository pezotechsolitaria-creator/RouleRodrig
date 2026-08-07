import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { guard } from "@/lib/rate-limit";
import { isUuid } from "@/lib/file-signature";
import { notifyOrderCustomer } from "@/lib/notifications/order-events";

const NOT_FOUND_CODE = "RR003";
const ILLEGAL_STATE_CODE = "RR004";

// The merchant commits to fulfilling the order. This clears the reservation
// fuse WITHOUT claiming any money arrived — see M14. Keeping the two apart is
// what preserves the payments row as evidence: the platform never touches
// funds, so that row is the only record either side can point at in a dispute,
// and a merchant should never have to attest payment simply to stop a clock.
//
// accept_order() re-checks is_store_staff() itself, so this route is a thin
// wrapper rather than the security boundary — same shape as confirm-payment.
// The RPC is idempotent, so a double-tap or a retried request returns the
// original acceptance instead of erroring or moving the timestamp.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = guard(req, "accept-order", 30, 60_000);
  if (limited) return limited;

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { data, error } = await supabase.rpc("accept_order", { p_order_id: id }).single();

  if (error) {
    // RR003 is deliberately identical for "no such order" and "not your order",
    // so a merchant cannot probe for another shop's order ids.
    if (error.code === NOT_FOUND_CODE) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error.code === ILLEGAL_STATE_CODE) return NextResponse.json({ error: error.message }, { status: 409 });
    console.error("accept_order failed", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }

  // The merchant UI says "The customer has been told" — until now that was
  // false, because the RPC's in-app notification row has no customer-side
  // reader. Best-effort and never able to fail an acceptance that has already
  // committed, same pattern as the M17 placement notice.
  try {
    await notifyOrderCustomer(id, "accepted");
  } catch (err) {
    console.error("accept notification failed", err);
  }

  return NextResponse.json(data);
}
