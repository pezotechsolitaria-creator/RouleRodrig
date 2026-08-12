import { NextRequest, NextResponse } from "next/server";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";

// The admin operations feed. Read-only and derived — there is nothing to mark
// read, because every item disappears when the underlying problem is actually
// fixed rather than when somebody clicks it.
export async function GET(req: NextRequest) {
  if (!verifySession(req.cookies.get(COOKIE_NAME)?.value)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasServiceRole()) {
    return NextResponse.json(
      { error: "Admin backend is not configured (SUPABASE_SERVICE_ROLE_KEY is unset)." },
      { status: 503 },
    );
  }

  const admin = await getPrivileged();
  const { data, error } = await admin.rpc("admin_operations_feed");
  if (error) {
    console.error("admin_operations_feed failed", error);
    return NextResponse.json({ error: "Could not load operations." }, { status: 500 });
  }
  return NextResponse.json(data);
}
