import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { guard } from "@/lib/rate-limit";
import { isUuid } from "@/lib/file-signature";

const NOT_FOUND_CODE = "RR003";
const ILLEGAL_STATE_CODE = "RR004";

// The cash half of a split payment, actually handed over.
//
// Deliberately its own endpoint rather than folded into marking an order
// collected: goods leave the counter before the note is in the till, and a
// balance that settles itself the moment an order is marked done is a balance
// nobody ever chases. settle_order_balance() re-checks is_store_staff() itself,
// so this route is a thin wrapper, not the security boundary.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = guard(req, "settle-balance", 30, 60_000);
  if (limited) return limited;

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { data, error } = await supabase.rpc("settle_order_balance", { p_order_id: id });

  if (error) {
    if (error.code === NOT_FOUND_CODE) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error.code === ILLEGAL_STATE_CODE) return NextResponse.json({ error: error.message }, { status: 409 });
    console.error("settle_order_balance failed", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }

  return NextResponse.json(data ?? { ok: true });
}
