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

  const all = data ?? [];
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;

  // Questions Ti Roulé couldn't answer — kept separate from lead analytics.
  const missMap = new Map<string, { question: string; count: number; last: string }>();
  for (const r of all.filter((r) => r.kind === "tiroule_miss")) {
    const q = (r.target_name ?? "").trim();
    if (!q) continue;
    const m = missMap.get(q) ?? { question: q, count: 0, last: r.created_at };
    m.count += 1;
    if (new Date(r.created_at) > new Date(m.last)) m.last = r.created_at;
    missMap.set(q, m);
  }
  const misses = Array.from(missMap.values()).sort((a, b) => b.count - a.count).slice(0, 40);

  const rows = all.filter((r) => r.kind !== "tiroule_miss");

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
      food: rows.filter((r) => r.kind === "food_concierge").length,
    },
    summary,
    recent: rows.slice(0, 50),
    misses,
  });
}

// Mark a Ti Roulé question as answered — clears its logged rows.
export async function DELETE(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: { question?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid" }, { status: 400 }); }
  const question = (body.question ?? "").trim();
  if (!question) return NextResponse.json({ error: "Missing question" }, { status: 400 });
  const supabase = await getPrivileged();
  const { error } = await supabase.from("lead_events").delete().eq("kind", "tiroule_miss").eq("target_name", question);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
