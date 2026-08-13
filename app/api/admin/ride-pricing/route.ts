import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { audit } from "@/lib/admin/audit";
import { RIDE_SERVICES } from "@/lib/rides/model";

// ── THE FARES ARE THE OWNER'S ───────────────────────────────────────────────
//
// He asked for test prices he can edit or delete afterwards, which is the right
// instinct: the numbers I seeded are my guesses at Rodriguan rates and they are
// now customer-facing.
//
// "Delete" here means STOP OFFERING IT, not remove the row. A missing pricing row
// would make quote_ride() answer 'unknown_service' for a service the booking
// screen still lists — so the switch is is_bookable, and turning it off makes the
// screen say "we will confirm the price with you" instead of quoting nothing.
// Deleting the row itself is a schema change, not an operational one.

const patchSchema = z.object({
  service: z.enum(RIDE_SERVICES),
  // Rupees in from the form; converted to minor units here so a fare can never
  // land 100x wrong — the same convention as every other price on the platform.
  baseFare: z.number().min(0).max(100_000).nullable().optional(),
  perKm: z.number().min(0).max(10_000).nullable().optional(),
  minimumFare: z.number().min(0).max(100_000).nullable().optional(),
  flatFare: z.number().min(0).max(100_000).nullable().optional(),
  perExtraPassenger: z.number().min(0).max(10_000).nullable().optional(),
  perLuggage: z.number().min(0).max(10_000).nullable().optional(),
  nightSurcharge: z.number().min(0).max(100_000).nullable().optional(),
  nightFromHour: z.number().int().min(0).max(23).optional(),
  nightToHour: z.number().int().min(0).max(23).optional(),
  isBookable: z.boolean().optional(),
});

const toMinor = (rupees: number | null | undefined) =>
  rupees == null ? null : Math.round(rupees * 100);

function authed(req: NextRequest) {
  return verifySession(req.cookies.get(COOKIE_NAME)?.value);
}

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasServiceRole()) {
    return NextResponse.json({ error: "Not configured on this environment." }, { status: 503 });
  }
  const admin = await getPrivileged();
  const { data, error } = await admin.from("ride_pricing").select("*").order("service");
  if (error) {
    console.error("ride_pricing read failed", error);
    return NextResponse.json({ error: "Could not load fares." }, { status: 500 });
  }
  return NextResponse.json({ pricing: data ?? [] });
}

export async function PATCH(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasServiceRole()) {
    return NextResponse.json({ error: "Not configured on this environment." }, { status: 503 });
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }
  const v = parsed.data;

  // Built field by field rather than spread: `service` is the key and nothing a
  // caller invented may reach the update.
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (v.baseFare !== undefined) patch.base_fare = toMinor(v.baseFare) ?? 0;
  if (v.perKm !== undefined) patch.per_km = toMinor(v.perKm) ?? 0;
  if (v.minimumFare !== undefined) patch.minimum_fare = toMinor(v.minimumFare) ?? 0;
  // Null is meaningful here and not "unset": it turns a flat fare back into a
  // distance-based one.
  if (v.flatFare !== undefined) patch.flat_fare = toMinor(v.flatFare);
  if (v.perExtraPassenger !== undefined) patch.per_extra_passenger = toMinor(v.perExtraPassenger) ?? 0;
  if (v.perLuggage !== undefined) patch.per_luggage = toMinor(v.perLuggage) ?? 0;
  if (v.nightSurcharge !== undefined) patch.night_surcharge = toMinor(v.nightSurcharge) ?? 0;
  if (v.nightFromHour !== undefined) patch.night_from_hour = v.nightFromHour;
  if (v.nightToHour !== undefined) patch.night_to_hour = v.nightToHour;
  if (v.isBookable !== undefined) patch.is_bookable = v.isBookable;

  const admin = await getPrivileged();
  const { error } = await admin.from("ride_pricing").update(patch).eq("service", v.service);
  if (error) {
    console.error("ride_pricing update failed", error);
    return NextResponse.json({ error: "Could not save that fare." }, { status: 500 });
  }

  // A price change is exactly the kind of thing somebody asks about later.
  await audit(admin, {
    action: "ride_pricing.update", entityType: "ride_pricing", entityId: v.service,
    diff: patch,
  });
  return NextResponse.json({ ok: true });
}
