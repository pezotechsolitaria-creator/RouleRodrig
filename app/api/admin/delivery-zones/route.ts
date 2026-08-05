import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";

// Platform administration of delivery regions and their prices.
//
// AUTH NOTE: same two-admin-identities situation as app/api/admin/subscriptions
// — `/admin` authenticates with a signed password cookie and has no Supabase
// user, so is_platform_admin() can never be true for it. delivery_zones grants
// writes to nobody except the service role, so the cookie check below IS the
// security boundary and the service-role client is how the write lands.
function isAuthed(req: NextRequest) {
  return verifySession(req.cookies.get(COOKIE_NAME)?.value);
}

function serviceRoleMissing() {
  return NextResponse.json(
    { error: "Admin backend is not configured on this environment (SUPABASE_SERVICE_ROLE_KEY is unset)." },
    { status: 503 },
  );
}

// Fees are minor units, like every other amount in this system. The ceiling is
// a guard against a slipped decimal turning Rs 150 into Rs 15,000 — no delivery
// anywhere on a 108 km² island costs more than Rs 2,000.
const feeSchema = z.number().int().min(0).max(200_000);

const createSchema = z.object({
  name: z.string().trim().min(1, "A zone name is required.").max(80),
  covers: z.string().trim().max(300).optional().or(z.literal("")),
  fee: feeSchema,
  position: z.number().int().min(0).max(999).optional(),
  isActive: z.boolean().optional(),
});

const patchSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(80).optional(),
  covers: z.string().trim().max(300).optional().or(z.literal("")),
  fee: feeSchema.optional(),
  position: z.number().int().min(0).max(999).optional(),
  isActive: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasServiceRole()) return serviceRoleMissing();

  const supabase = await getPrivileged();
  const [{ data: zones, error }, { data: settings }] = await Promise.all([
    supabase.from("delivery_zones").select("*").order("position"),
    supabase
      .from("marketplace_settings")
      .select("delivery_enabled, delivery_max_minutes")
      .eq("id", "main")
      .maybeSingle(),
  ]);

  if (error) {
    console.error("admin delivery zones list failed", error);
    return NextResponse.json({ error: "Failed to load delivery areas." }, { status: 500 });
  }

  return NextResponse.json({
    zones: zones ?? [],
    deliveryEnabled: settings?.delivery_enabled ?? false,
    maxMinutes: settings?.delivery_max_minutes ?? 120,
  });
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
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }
  const { name, covers, fee, position, isActive } = parsed.data;

  const supabase = await getPrivileged();
  const { data, error } = await supabase
    .from("delivery_zones")
    .insert({
      name,
      covers: covers?.trim() || null,
      fee,
      position: position ?? 0,
      is_active: isActive ?? true,
    })
    .select()
    .single();

  if (error) {
    console.error("create delivery zone failed", error);
    return NextResponse.json({ error: "Could not create that area." }, { status: 500 });
  }
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
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }
  const { id, name, covers, fee, position, isActive } = parsed.data;

  // Built field by field rather than spreading the body: `id`, `created_at` and
  // anything else a caller invented must never reach the update.
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (name !== undefined) patch.name = name;
  if (covers !== undefined) patch.covers = covers.trim() || null;
  if (fee !== undefined) patch.fee = fee;
  if (position !== undefined) patch.position = position;
  if (isActive !== undefined) patch.is_active = isActive;

  const supabase = await getPrivileged();
  const { error } = await supabase.from("delivery_zones").update(patch).eq("id", id);
  if (error) {
    console.error("update delivery zone failed", error);
    return NextResponse.json({ error: "Could not save that area." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

// Deactivate rather than delete: orders reference delivery_zones(id), and a
// hard delete would either fail on the foreign key or, worse, orphan the record
// of which area an order was priced against. Inactive zones disappear from
// checkout immediately, which is the actual intent behind "remove".
export async function DELETE(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasServiceRole()) return serviceRoleMissing();

  const id = new URL(req.url).searchParams.get("id");
  if (!id || !z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Missing or invalid id." }, { status: 400 });
  }

  const supabase = await getPrivileged();
  const { error } = await supabase
    .from("delivery_zones")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    console.error("deactivate delivery zone failed", error);
    return NextResponse.json({ error: "Could not remove that area." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
