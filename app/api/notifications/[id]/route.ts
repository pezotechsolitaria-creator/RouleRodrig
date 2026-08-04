import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/file-signature";
import { guard } from "@/lib/rate-limit";

// Marks one notification read. The only field ever written is read_at —
// RLS's notifications_mark_read_own policy technically permits a caller to
// send other columns in the same request too (RLS is row-level, not
// column-level), so this route explicitly builds the update payload itself
// rather than passing the request body through, closing that off at the
// application layer.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = guard(req, "notifications-mark-read", 60, 60_000);
  if (limited) return limited;

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { data, error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("recipient_id", user.id)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("mark notification read failed", error);
    return NextResponse.json({ error: "Failed to update notification." }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Not found." }, { status: 404 });

  return NextResponse.json({ ok: true });
}
