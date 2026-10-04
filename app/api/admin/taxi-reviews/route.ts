import { NextRequest, NextResponse } from "next/server";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import { getPrivileged } from "@/lib/supabase/admin";
import { auditDeletedRows } from "@/lib/admin/audit-delete";

function isAuthed(req: NextRequest) {
  return verifySession(req.cookies.get(COOKIE_NAME)?.value);
}

// ── Admin: list ALL driver reviews (optionally by status) ────────────────────
export async function GET(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const status = req.nextUrl.searchParams.get("status");
  const supabase = await getPrivileged();

  let query = supabase
    .from("taxi_driver_reviews")
    .select("*")
    .order("created_at", { ascending: false });

  if (status && ["pending", "approved", "rejected"].includes(status)) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// ── Admin: approve / reject ──────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, status } = (await req.json()) as { id: string; status: string };
  if (!id || !["pending", "approved", "rejected"].includes(status))
    return NextResponse.json({ error: "Missing id or invalid status" }, { status: 400 });

  const supabase = await getPrivileged();
  const { error } = await supabase.from("taxi_driver_reviews").update({ status }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// ── Admin: delete ────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const supabase = await getPrivileged();
  // `.select()` returns the row this removed, for the trail (architecture
  // review 2026-09-30, item 3). The delete itself is unchanged.
  const { data: gone, error } = await supabase.from("taxi_driver_reviews").delete().eq("id", id).select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await auditDeletedRows(supabase, {
    action: "taxi_review.delete",
    entityType: "taxi_driver_review",
    rows: gone,
    keys: ["driver_id", "driver_name", "name", "rating", "status", "created_at"],
  });
  return NextResponse.json({ ok: true });
}
