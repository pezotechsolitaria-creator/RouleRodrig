import { NextRequest, NextResponse } from "next/server";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/file-signature";

// The order statement. Read-only by construction: there is no write path here,
// so a statement can never be edited into agreeing with a number somebody
// wanted. Reconciliation only means something if the ledger is immutable.
export async function GET(req: NextRequest) {
  if (!verifySession(req.cookies.get(COOKIE_NAME)?.value)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasServiceRole()) {
    return NextResponse.json({ error: "Admin backend is not configured." }, { status: 503 });
  }

  const url = new URL(req.url);
  const storeId = url.searchParams.get("storeId");
  const year = url.searchParams.get("year");

  // A year, or the trailing twelve months when none is given. Parsed here so a
  // hand-typed ?year=abc becomes "the default", never an SQL error.
  let from: string | null = null;
  let to: string | null = null;
  const y = Number.parseInt(year ?? "", 10);
  if (!Number.isNaN(y) && y >= 2020 && y <= 2100) {
    from = new Date(Date.UTC(y, 0, 1)).toISOString();
    to = new Date(Date.UTC(y + 1, 0, 1)).toISOString();
  }

  const admin = await getPrivileged();
  const { data, error } = await admin.rpc("admin_order_statement", {
    p_from: from,
    p_to: to,
    p_store_id: storeId && isUuid(storeId) ? storeId : null,
  });

  if (error) {
    console.error("admin_order_statement failed", error);
    return NextResponse.json({ error: "Could not build the statement." }, { status: 500 });
  }
  return NextResponse.json(data);
}
