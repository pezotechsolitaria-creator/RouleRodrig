import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// ── Health / readiness / liveness ────────────────────────────────────────────
// GET /api/health           → readiness (checks the database dependency)
// GET /api/health?probe=live → liveness (process is up; no dependencies)
//
// Use the readiness probe for load-balancer health checks and uptime monitors;
// use the liveness probe for container orchestrators that should NOT recycle
// the instance just because a downstream dependency is briefly unavailable.
export async function GET(req: Request) {
  const probe = new URL(req.url).searchParams.get("probe");

  if (probe === "live") {
    return NextResponse.json(
      { status: "ok", probe: "liveness", at: new Date().toISOString() },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const started = Date.now();
  let db: "ok" | "degraded" = "ok";
  let dbLatencyMs: number | null = null;

  try {
    const supabase = await createClient();
    const t0 = Date.now();
    // Cheap, indexed probe query against the single content row.
    const { error } = await supabase.from("site_content").select("id").limit(1);
    dbLatencyMs = Date.now() - t0;
    if (error) db = "degraded";
  } catch {
    db = "degraded";
  }

  const healthy = db === "ok";
  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      probe: "readiness",
      checks: { database: db, dbLatencyMs },
      uptimeMs: Math.round(process.uptime() * 1000),
      totalMs: Date.now() - started,
      at: new Date().toISOString(),
    },
    {
      status: healthy ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
