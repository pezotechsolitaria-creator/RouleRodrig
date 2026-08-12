import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { guard } from "@/lib/rate-limit";

// A user's own notifications — recipient_id = auth.uid() both explicitly
// here and via RLS (notifications_read_own). Works for merchant and
// customer recipients alike; the distinction is just which id a row was
// addressed to; there is no separate "role" concept at the auth layer.
export async function GET(req: NextRequest) {
  const limited = guard(req, "notifications-list", 60, 60_000);
  if (limited) return limited;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const unreadOnly = searchParams.get("unread") === "1";

  let query = supabase
    .from("notifications")
    .select("id, type, title, body, data, order_id, read_at, created_at, category, priority, link")
    .eq("recipient_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (unreadOnly) query = query.is("read_at", null);

  const { data, error } = await query;
  if (error) {
    console.error("list notifications failed", error);
    return NextResponse.json({ error: "Failed to load notifications." }, { status: 500 });
  }

  return NextResponse.json({ notifications: data ?? [] });
}

// Mark everything read in one call. Doing it per row from the client is a round
// trip per notification, which on a bad island connection is exactly the moment
// the user gives up and leaves the badge showing forever.
export async function POST(req: NextRequest) {
  const limited = guard(req, "notifications-read-all", 20, 60_000);
  if (limited) return limited;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  // The RPC scopes to auth.uid() itself — this route cannot be pointed at
  // somebody else's feed even with a hand-made request.
  const { data, error } = await supabase.rpc("mark_all_notifications_read");
  if (error) {
    console.error("mark_all_notifications_read failed", error);
    return NextResponse.json({ error: "Could not mark them read." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, marked: data ?? 0 });
}
