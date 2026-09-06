import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/driver/log?days=30 — what this driver actually did.
//
// ── WHY THIS IS NOT PART OF /api/driver ────────────────────────────────────
// That endpoint rides the dashboard's 20-second poll, and openRequests travels
// with it precisely because it is small and needed constantly. A 30-day history
// is neither: it changes when a job finishes, not every twenty seconds, and
// sending it on every tick would spend somebody's island data re-downloading a
// month of finished work they are not looking at.
//
// So it is its own route, fetched when the section is opened.
//
// The RPC runs as the CURRENT DRIVER — current_driver() keys on auth.uid() —
// so a driver can only ever read their own history. There is no id parameter
// here by design: adding one would be the only way this could become a way to
// read somebody else's earnings.

const NOT_A_DRIVER = "RR081";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  // Bounded here and clamped again in SQL. A query string is not a promise.
  const raw = Number(new URL(req.url).searchParams.get("days") ?? "30");
  const days = Number.isFinite(raw) ? Math.min(Math.max(Math.trunc(raw), 1), 90) : 30;

  const { data, error } = await supabase.rpc("driver_delivery_log", { p_days: days });
  if (error) {
    // Not a driver is a normal state, not a failure.
    if (error.code === NOT_A_DRIVER) {
      return NextResponse.json({ days, rows: [], totals: null }, { status: 200 });
    }
    console.error("driver_delivery_log failed", error);
    return NextResponse.json({ error: "Could not load your history." }, { status: 500 });
  }

  return NextResponse.json(data ?? { days, rows: [], totals: null });
}
