import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { guard } from "@/lib/rate-limit";
import { isUuid } from "@/lib/file-signature";

const NOT_FOUND_CODE = "RR003";
const ILLEGAL_STATE_CODE = "RR004";

// The merchant attests that the money arrived. This is the ONLY way a
// marketplace payment becomes 'captured' — the platform never touches the
// funds, so no automated signal can prove receipt. confirm_order_payment()
// re-checks is_store_staff() itself, so this route is a thin wrapper rather
// than the security boundary.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = guard(req, "confirm-payment", 30, 60_000);
  if (limited) return limited;

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { data, error } = await supabase.rpc("confirm_order_payment", { p_order_id: id }).single();

  if (error) {
    if (error.code === NOT_FOUND_CODE) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error.code === ILLEGAL_STATE_CODE) return NextResponse.json({ error: error.message }, { status: 409 });
    console.error("confirm_order_payment failed", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }

  return NextResponse.json(data);
}
