import { NextRequest, NextResponse } from "next/server";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import { getPrivileged } from "@/lib/supabase/admin";
import { auditDeletedRows } from "@/lib/admin/audit-delete";

function isAuthed(req: NextRequest) {
  return verifySession(req.cookies.get(COOKIE_NAME)?.value);
}

// ── Admin: list waitlist signups ────────────────────────────────────
export async function GET(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = await getPrivileged();
  const { data, error } = await supabase
    .from("waitlist")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// ── Admin: remove a signup ──────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const supabase = await getPrivileged();
  // `.select()` returns the row this removed, for the trail (architecture
  // review 2026-09-30, item 3). The delete itself is unchanged.
  const { data: gone, error } = await supabase.from("waitlist").delete().eq("id", id).select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await auditDeletedRows(supabase, {
    action: "waitlist.delete",
    entityType: "waitlist",
    rows: gone,
    keys: ["email", "name", "source", "created_at"],
  });
  return NextResponse.json({ ok: true });
}
