import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifySession, COOKIE_NAME } from "@/lib/auth";

function auth(req: NextRequest): NextResponse | null {
  const ok = verifySession(req.cookies.get(COOKIE_NAME)?.value);
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return null;
}

export async function GET(req: NextRequest) {
  const denied = await auth(req);
  if (denied) return denied;
  const supabase = await createClient();
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
  const supabase = await createClient();
  const { data, error } = await supabase.from("taxi_drivers").insert([body]).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest) {
  const denied = await auth(req);
  if (denied) return denied;
  const { id, ...patch } = await req.json();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const supabase = await createClient();
  const { data, error } = await supabase.from("taxi_drivers").update(patch).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const denied = await auth(req);
  if (denied) return denied;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const supabase = await createClient();
  const { error } = await supabase.from("taxi_drivers").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
