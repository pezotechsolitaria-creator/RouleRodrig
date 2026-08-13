import { NextRequest, NextResponse } from "next/server";
import { getPrivileged } from "@/lib/supabase/admin";
import { verifySession, COOKIE_NAME } from "@/lib/auth";

function auth(req: NextRequest): NextResponse | null {
  const ok = verifySession(req.cookies.get(COOKIE_NAME)?.value);
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return null;
}

// Whitelist of settable columns — blocks mass-assignment.
//
// The second row is what makes a driver DISPATCHABLE rather than merely listed.
// They were added to taxi_drivers by the rides migration and then blocked here,
// which is the allowlist doing its job — and meant the owner could not set a
// seat count or a base location from anywhere, so every driver defaulted to 4
// seats and could never be ranked by distance. The counters are deliberately
// absent: rides_offered/accepted/completed are written by the dispatch functions
// and must not be settable from a form, or reliability becomes self-reported.
const ALLOWED = [
  "name", "phone", "whatsapp", "photo", "photos", "vehicle", "vehicle_type",
  "languages", "areas", "rate_from", "notes", "featured", "active",
  "base_lat", "base_lng", "base_label", "seats", "luggage_capacity",
  "handles_taxi", "handles_airport", "handles_transfer", "availability",
] as const;

function pick(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const k of ALLOWED) if (k in body) out[k] = body[k];
  return out;
}

export async function GET(req: NextRequest) {
  const denied = await auth(req);
  if (denied) return denied;
  const supabase = await getPrivileged();
  const { data, error } = await supabase
    .from("taxi_drivers")
    .select("*")
    .order("featured", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const denied = await auth(req);
  if (denied) return denied;
  const body = await req.json();
  const supabase = await getPrivileged();
  const { data, error } = await supabase.from("taxi_drivers").insert([pick(body)]).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest) {
  const denied = await auth(req);
  if (denied) return denied;
  const { id, ...patch } = await req.json();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const supabase = await getPrivileged();
  const { data, error } = await supabase.from("taxi_drivers").update(pick(patch)).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const denied = await auth(req);
  if (denied) return denied;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const supabase = await getPrivileged();
  const { error } = await supabase.from("taxi_drivers").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
