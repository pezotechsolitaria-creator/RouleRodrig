import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { guard } from "@/lib/rate-limit";

// ── Public: log a lead event (a click/enquiry on a directory listing) ────────
// Used to measure demand and bill featured/pay-per-lead. Insert-only; no PII.
const KINDS = ["stay_eat_do", "taxi", "food_concierge", "tiroule_miss"];
const TYPES = ["whatsapp", "call", "link"];

export async function POST(req: NextRequest) {
  const limited = guard(req, "leads", 40, 60_000);
  if (limited) return limited;

  let body: { kind?: string; target_name?: string; category?: string; type?: string; ref?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const kind = (body.kind ?? "").trim();
  const target = (body.target_name ?? "").trim();
  if (!KINDS.includes(kind) || !target) {
    return NextResponse.json({ error: "Invalid lead" }, { status: 400 });
  }

  const record = {
    kind,
    target_name: target.slice(0, 160),
    category: (body.category ?? "").toString().trim().slice(0, 40) || null,
    type: TYPES.includes((body.type ?? "").trim()) ? (body.type ?? "").trim() : null,
    ref: (body.ref ?? "").toString().trim().slice(0, 80) || null,
  };

  const supabase = await createClient();
  const { error } = await supabase.from("lead_events").insert([record]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
