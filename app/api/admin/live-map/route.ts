import { NextRequest, NextResponse } from "next/server";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";

// ── EVERY DRIVER, ONE QUERY ─────────────────────────────────────────────────
//
// The whole board in a single round trip: both kinds of driver, where they are,
// how old that is, and what job they are on. admin_live_map() does the joining
// in the database rather than having a browser stitch five endpoints together —
// which is what makes a 10-second refresh cheap enough to leave open all day.
//
// Auth is the ADMIN_PASSWORD cookie, the same door every other /api/admin route
// uses. The RPC is service_role only and additionally refuses an authenticated
// non-admin, so neither half trusts the other blindly.

export const dynamic = "force-dynamic";

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
  const { data, error } = await admin.rpc("admin_live_map");
  if (error) {
    console.error("admin_live_map failed", error);
    return NextResponse.json({ error: "Could not load the live map." }, { status: 500 });
  }
  return NextResponse.json(data);
}
