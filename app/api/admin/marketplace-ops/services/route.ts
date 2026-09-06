import { NextRequest, NextResponse } from "next/server";
import { guardAdminApi, failed } from "@/lib/admin/api-guard";

// GET /api/admin/marketplace-ops/services — how the Do It For Me line is doing.
//
// All the arithmetic lives in admin_service_board(). Doing it here would mean
// four round trips to build one screen, and a funnel whose numbers could
// disagree with each other depending on how long the page took to load.
//
// The RPC is revoked from anon and authenticated: the /admin password cookie
// checked by guardAdminApi IS the security boundary, and the service-role
// client is only how the read lands. Same door as the rest of /api/admin.

export async function GET(req: NextRequest) {
  const gate = await guardAdminApi(req, "The services desk");
  if (gate instanceof NextResponse) return gate;
  const { admin } = gate;

  // Bounded here as well as in SQL. A query string is not a promise, and the
  // RPC clamps it again — but a 400 explains itself where a silent clamp does
  // not.
  const raw = Number(new URL(req.url).searchParams.get("days") ?? "30");
  const days = Number.isFinite(raw) ? Math.min(Math.max(Math.trunc(raw), 1), 365) : 30;

  const { data, error } = await admin.rpc("admin_service_board", { p_days: days });
  if (error) return failed(error, "Could not load the services desk.");

  return NextResponse.json(data ?? { days, live: [], totals: null, asks: [] });
}
