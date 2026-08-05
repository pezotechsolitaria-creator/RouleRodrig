import { NextRequest, NextResponse } from "next/server";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/file-signature";

// One shop's full recurring week, for the admin editor. The list endpoint only
// carries today's row, so opening the editor reads the whole schedule rather
// than guessing at the other six days.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!verifySession(req.cookies.get(COOKIE_NAME)?.value)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasServiceRole()) {
    return NextResponse.json(
      { error: "Admin backend is not configured on this environment (SUPABASE_SERVICE_ROLE_KEY is unset)." },
      { status: 503 },
    );
  }

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const supabase = await getPrivileged();
  const { data, error } = await supabase
    .from("store_hours")
    .select("weekday, opens_at, closes_at, delivery_opens_at, delivery_closes_at, delivery_closed, is_closed, note")
    .eq("store_id", id)
    .is("date", null)
    .order("weekday");

  if (error) {
    console.error("admin store hours read failed", error);
    return NextResponse.json({ error: "Could not load those hours." }, { status: 500 });
  }
  return NextResponse.json({ days: data ?? [] });
}
