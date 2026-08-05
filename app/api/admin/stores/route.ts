import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";

// Platform administration of every shop's opening + delivery hours.
//
// AUTH NOTE: same two-admin-identities situation as the other admin routes —
// /admin authenticates with a signed password cookie and has no Supabase user,
// so is_platform_admin() can never be true for it. The cookie check below IS
// the security boundary, and the service-role client is how the write lands.
function isAuthed(req: NextRequest) {
  return verifySession(req.cookies.get(COOKIE_NAME)?.value);
}

function serviceRoleMissing() {
  return NextResponse.json(
    { error: "Admin backend is not configured on this environment (SUPABASE_SERVICE_ROLE_KEY is unset)." },
    { status: 503 },
  );
}

const timeRe = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;
const time = z.string().regex(timeRe, "Use a time like 08:00.");

const putSchema = z.object({
  storeId: z.string().uuid(),
  days: z.array(z.object({
    weekday: z.number().int().min(0).max(6),
    is_closed: z.boolean(),
    opens_at: time.nullable().optional(),
    closes_at: time.nullable().optional(),
    delivery_opens_at: time.nullable().optional(),
    delivery_closes_at: time.nullable().optional(),
    delivery_closed: z.boolean().optional(),
  })).min(1).max(7),
});

// Every shop plus its live schedule status, in ONE query. The lateral join runs
// store_schedule_status() per row inside Postgres rather than issuing a request
// per store, so this stays a single round trip however many shops exist.
export async function GET(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasServiceRole()) return serviceRoleMissing();

  const supabase = await getPrivileged();
  const { data, error } = await supabase.rpc("admin_store_schedules");

  if (error) {
    console.error("admin stores list failed", error);
    return NextResponse.json({ error: "Failed to load shops." }, { status: 500 });
  }
  return NextResponse.json({ stores: data ?? [] });
}

export async function PUT(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasServiceRole()) return serviceRoleMissing();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  // admin_set_store_hours is the platform door. It shares one internal
  // implementation with the merchant's set_store_hours, so validation cannot
  // diverge between the two surfaces — but it is granted only to service_role,
  // because /admin has no Supabase user and therefore satisfies neither
  // is_store_staff() nor is_platform_admin().
  const supabase = await getPrivileged();
  const { error } = await supabase.rpc("admin_set_store_hours", {
    p_store_id: parsed.data.storeId,
    p_days: parsed.data.days,
  });
  if (error) {
    if (error.code === "RR005") return NextResponse.json({ error: error.message }, { status: 400 });
    if (error.code === "RR003") return NextResponse.json({ error: "Shop not found." }, { status: 404 });
    if (error.code === "23514") {
      return NextResponse.json({ error: "That schedule isn't valid. Check the opening and delivery times." }, { status: 400 });
    }
    console.error("admin set_store_hours failed", error);
    return NextResponse.json({ error: "Could not save those hours." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
