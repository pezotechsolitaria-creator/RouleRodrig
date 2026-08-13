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
  // The credential that makes WhatsApp automatic. Settable (the owner has to
  // paste what the driver's opt-in reply gives them) but NEVER returned — see
  // the select list in GET below.
  "whatsapp_api_key", "notify_from_hour", "notify_to_hour",
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

  // ── ONE driver's personal link, on demand ────────────────────────────────
  // The token is deliberately absent from the list below: fifty of them in every
  // page load would put every driver's private page in a page source. But the
  // owner has to be able to SEND a driver their link, so it is fetched one at a
  // time, for the driver he actually asked about.
  const linkFor = new URL(req.url).searchParams.get("linkFor");
  if (linkFor) {
    const { data, error } = await supabase
      .from("taxi_drivers")
      .select("id, name, whatsapp, phone, driver_token")
      .eq("id", linkFor)
      .maybeSingle();
    if (error || !data) return NextResponse.json({ error: "Not found." }, { status: 404 });
    const d = data as { name: string; whatsapp: string | null; phone: string; driver_token: string };
    return NextResponse.json({
      name: d.name,
      whatsapp: (d.whatsapp ?? d.phone).replace(/\D/g, ""),
      link: `/d/${d.driver_token}`,
    });
  }
  // EXPLICIT COLUMNS, not select("*"). Two of them must never reach a browser:
  //  · whatsapp_api_key is a bearer credential — anyone holding it can send
  //    WhatsApp as that number (see lib/notifications/whatsapp.ts, M43). The
  //    client gets a BOOLEAN instead, which is all a screen needs to say
  //    "this driver is not set up yet".
  //  · driver_token is the driver's permanent personal link. It is theirs, sent
  //    to them once; an admin list that echoed it into a bundle would put every
  //    driver's private page in a page source.
  // select("*") would have shipped both the moment they were added to the
  // allowlist above, which is exactly what happened before this comment existed.
  const { data, error } = await supabase
    .from("taxi_drivers")
    .select(
      "id, name, phone, whatsapp, photo, photos, vehicle, vehicle_type, languages, areas, " +
        "rate_from, notes, featured, active, created_at, " +
        "base_lat, base_lng, base_label, seats, luggage_capacity, " +
        "handles_taxi, handles_airport, handles_transfer, availability, " +
        "notify_from_hour, notify_to_hour, " +
        "rides_offered, rides_accepted, rides_completed, rides_declined, last_offered_at",
    )
    .order("featured", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Whether automation will reach them, without revealing the credential.
  const [{ data: waReady }, { data: pushReady }] = await Promise.all([
    supabase.rpc("taxi_whatsapp_readiness"),
    supabase.rpc("taxi_push_readiness"),
  ]);
  const waMap = new Map(
    ((waReady ?? []) as { driver_id: string; whatsapp_ready: boolean }[]).map((r) => [r.driver_id, r.whatsapp_ready]),
  );
  const pushMap = new Map(
    ((pushReady ?? []) as { driver_id: string; push_ready: boolean }[]).map((r) => [r.driver_id, r.push_ready]),
  );
  return NextResponse.json(
    ((data ?? []) as unknown as Record<string, unknown>[]).map((d) => ({
      ...d,
      whatsapp_ready: waMap.get(String(d.id)) ?? false,
      push_ready: pushMap.get(String(d.id)) ?? false,
    })),
  );
}

export async function POST(req: NextRequest) {
  const denied = await auth(req);
  if (denied) return denied;
  const body = await req.json();
  const supabase = await getPrivileged();
  const { data, error } = await supabase.from("taxi_drivers").insert([pick(body)]).select("id, name").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest) {
  const denied = await auth(req);
  if (denied) return denied;
  const { id, ...patch } = await req.json();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const supabase = await getPrivileged();
  const { data, error } = await supabase.from("taxi_drivers").update(pick(patch)).eq("id", id).select("id, name").single();
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
