import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";

// Event organisers — invite, assign to an event, suspend.
//
// AUTH NOTE — the two-admin-identities rule (M25). `/admin` authenticates with a
// signed password cookie and has no Supabase user, so is_platform_admin() can
// never be true for it; the cookie check below IS the security boundary and the
// service-role client is how the write lands. The RPCs additionally refuse any
// caller that DOES have a session but is not a platform admin, so a signed-in
// organiser cannot reach them either way — verified by probe.
//
// Nothing here decides authorization. Every mutation goes through an admin_*
// RPC that re-checks and writes an audit_logs row with the before/after.
function isAuthed(req: NextRequest) {
  return verifySession(req.cookies.get(COOKIE_NAME)?.value);
}

function serviceRoleMissing() {
  return NextResponse.json(
    { error: "Admin backend is not configured on this environment (SUPABASE_SERVICE_ROLE_KEY is unset)." },
    { status: 503 },
  );
}

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(254),
  name: z.string().trim().min(1, "A name is required.").max(120),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  // Pre-launch test accounts must be distinguishable from real organisers —
  // the control earned when a cleanup predicate nearly deleted a real order.
  isTest: z.boolean().optional(),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});

const assignSchema = z.object({
  organizerId: z.string().uuid(),
  storeId: z.string().uuid(),
  // Defaults false: admin-only payment verification is the safe default, and
  // enabling it is one boolean per organiser per event.
  canVerifyPayments: z.boolean().optional(),
});

const unassignSchema = z.object({
  organizerId: z.string().uuid(),
  storeId: z.string().uuid(),
  unassign: z.literal(true),
});

const statusSchema = z.object({
  organizerId: z.string().uuid(),
  status: z.enum(["invited", "active", "suspended"]),
});

function rpcError(error: { code?: string; message?: string }, fallback: string) {
  if (error.code === "RR005") return NextResponse.json({ error: error.message }, { status: 400 });
  if (error.code === "RR003") return NextResponse.json({ error: error.message ?? "Not found." }, { status: 404 });
  console.error(fallback, error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

export async function GET(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasServiceRole()) return serviceRoleMissing();

  const supabase = await getPrivileged();
  // Organisers with their assignments in ONE aggregated call, and the event
  // list to assign from. Never an N+1 over events.
  const [{ data: organizers, error }, { data: events }] = await Promise.all([
    supabase.rpc("admin_list_organizers"),
    supabase
      .from("events")
      .select("store_id, starts_at, stores(name, slug)")
      .order("starts_at", { ascending: true }),
  ]);

  if (error) {
    console.error("admin_list_organizers failed", error);
    return NextResponse.json({ error: "Failed to load organisers." }, { status: 500 });
  }

  type Row = { store_id: string; starts_at: string; stores: { name: string; slug: string } | { name: string; slug: string }[] | null };
  const eventList = ((events ?? []) as unknown as Row[]).map((e) => {
    const s = Array.isArray(e.stores) ? e.stores[0] : e.stores;
    return { storeId: e.store_id, name: s?.name ?? "Event", slug: s?.slug ?? "", startsAt: e.starts_at };
  });

  return NextResponse.json({ organizers: organizers ?? [], events: eventList });
}

export async function POST(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasServiceRole()) return serviceRoleMissing();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  const supabase = await getPrivileged();
  const { data, error } = await supabase.rpc("admin_invite_organizer", {
    p_email: parsed.data.email,
    p_display_name: parsed.data.name,
    p_phone: parsed.data.phone?.trim() || null,
    p_is_test: parsed.data.isTest ?? false,
    p_notes: parsed.data.notes?.trim() || null,
    p_actor_note: "admin_dashboard",
  });
  if (error) return rpcError(error, "Could not invite that organiser.");
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasServiceRole()) return serviceRoleMissing();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const supabase = await getPrivileged();

  // Three distinct mutations on one route, discriminated by shape rather than
  // by a free-text "action" field a caller could invent.
  const unassign = unassignSchema.safeParse(body);
  if (unassign.success) {
    const { data, error } = await supabase.rpc("admin_unassign_organizer_event", {
      p_organizer_id: unassign.data.organizerId,
      p_store_id: unassign.data.storeId,
      p_actor_note: "admin_dashboard",
    });
    if (error) return rpcError(error, "Could not remove that assignment.");
    return NextResponse.json(data);
  }

  const assign = assignSchema.safeParse(body);
  if (assign.success) {
    const { data, error } = await supabase.rpc("admin_assign_organizer_event", {
      p_organizer_id: assign.data.organizerId,
      p_store_id: assign.data.storeId,
      p_can_verify_payments: assign.data.canVerifyPayments ?? false,
      p_actor_note: "admin_dashboard",
    });
    if (error) return rpcError(error, "Could not assign that event.");
    return NextResponse.json(data);
  }

  const status = statusSchema.safeParse(body);
  if (status.success) {
    const { data, error } = await supabase.rpc("admin_set_organizer_status", {
      p_organizer_id: status.data.organizerId,
      p_status: status.data.status,
      p_actor_note: "admin_dashboard",
    });
    if (error) return rpcError(error, "Could not change that status.");
    return NextResponse.json(data);
  }

  return NextResponse.json({ error: "Invalid input." }, { status: 400 });
}
