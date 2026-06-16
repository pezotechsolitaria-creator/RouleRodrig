import { NextRequest, NextResponse } from "next/server";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import { getPrivileged } from "@/lib/supabase/admin";

function isAuthed(req: NextRequest) {
  return verifySession(req.cookies.get(COOKIE_NAME)?.value);
}

// ── Admin: lead analytics for the directory listings ─────────────────────────
// Returns recent events + per-target aggregates (all-time + last 30 days).
export async function GET(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await getPrivileged();
  const { data, error } = await supabase
    .from("lead_events")
    .select("kind, target_name, category, type, ref, created_at")
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data ?? [];
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;

  type Agg = { target: string; kind: string; category: string | null; total: number; last30: number };
  const map = new Map<string, Agg>();
  for (const r of rows) {
    const key = `${r.kind}::${r.target_name}`;
    const a = map.get(key) ?? { target: r.target_name, kind: r.kind, category: r.category, total: 0, last30: 0 };
    a.total += 1;
    if (new Date(r.created_at).getTime() >= cutoff) a.last30 += 1;
    map.set(key, a);
  }
  const summary = Array.from(map.values()).sort((x, y) => y.total - x.total);

  return NextResponse.json({
    totals: {
      all: rows.length,
      last30: rows.filter((r) => new Date(r.created_at).getTime() >= cutoff).length,
      stayEatDo: rows.filter((r) => r.kind === "stay_eat_do").length,
      taxi: rows.filter((r) => r.kind === "taxi").length,
    },
    summary,
    recent: rows.slice(0, 50),
  });
}
