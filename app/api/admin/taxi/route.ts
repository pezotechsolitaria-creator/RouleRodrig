import { NextRequest, NextResponse } from "next/server";
import { getPrivileged } from "@/lib/supabase/admin";
import { verifySession, COOKIE_NAME } from "@/lib/auth";

function auth(req: NextRequest): NextResponse | null {
  const ok = verifySession(req.cookies.get(COOKIE_NAME)?.value);
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return null;
}

// Whitelist of settable columns — blocks mass-assignment.
const ALLOWED = [
  "name", "phone", "whatsapp", "photo", "photos", "vehicle", "vehicle_type",
  "languages", "areas", "rate_from", "notes", "featured", "active",
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
