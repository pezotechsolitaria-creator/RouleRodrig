import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { audit } from "@/lib/admin/audit";
import { NIGHT_MODES } from "@/lib/rides/transfer";

// ── THE AIRPORT PRICE LIST IS THE OWNER'S ───────────────────────────────────
//
// M220. Zones, fares, the per-passenger fee, what happens at night, and
// Roulé's commission — all of it here, none of it in the booking screen.
//
// PUBLISHING, NOT EDITING. transfer_pricing_versions is append-only (a trigger
// refuses UPDATE and DELETE): every quote records the id of the list it was
// priced from, so a booking made on Monday can be re-priced to the rupee on
// Friday even if the fares changed on Wednesday. Saving here therefore writes
// a NEW version, effective immediately, and the previous one stays as history.
//
// Rupees in, minor units stored — converted here, once, as ride-pricing does,
// so a fare cannot land 100× wrong. The commission is a percent and is the one
// number NOT converted.

function authed(req: NextRequest) {
  return verifySession(req.cookies.get(COOKIE_NAME)?.value);
}

const rupees = z.number().min(1).max(100_000);

const publishSchema = z
  .object({
    label: z.string().trim().min(1).max(120),
    zone1MaxKm: z.number().positive().max(100),
    zone2MaxKm: z.number().positive().max(200),
    oneWay: z.tuple([rupees, rupees, rupees]),
    returnEach: z.tuple([rupees, rupees, rupees]),
    extraPassengerFee: z.number().min(0).max(10_000),
    includedPassengers: z.number().int().min(1).max(20).default(1),
    maxPricedPassengers: z.number().int().min(1).max(20),
    nightMode: z.enum(NIGHT_MODES),
    nightFromHour: z.number().int().min(0).max(23),
    nightToHour: z.number().int().min(0).max(23),
    nightSurcharge: z.number().min(0).max(100_000),
    nightMultiplier: z.number().min(1).max(3),
    // M221 · the evening band. OPTIONAL, and when absent it is CARRIED OVER
    // from the list in force — never defaulted to off. The review of M221 found
    // that a stale editor tab (or the editor deployed before M221) sends no
    // evening fields, and defaulting them to "none" would have silently
    // switched the owner's Rs 300 evening surcharge off on his next publish.
    eveningMode: z.enum(NIGHT_MODES).optional(),
    eveningFromHour: z.number().int().min(0).max(23).optional(),
    eveningToHour: z.number().int().min(0).max(23).optional(),
    eveningSurcharge: z.number().min(0).max(100_000).optional(),
    eveningMultiplier: z.number().min(1).max(3).optional(),
    commissionPercent: z.number().min(0).max(100),
    quoteValidMinutes: z.number().int().min(5).max(1440).default(30),
    note: z.string().trim().max(500).optional(),
  })
  .refine((v) => v.zone2MaxKm > v.zone1MaxKm, {
    path: ["zone2MaxKm"],
    message: "Zone 3 has to start further out than Zone 2.",
  })
  // A fixed band with no amount is "on" and charges nothing — almost certainly
  // a box left empty, and it would silently price the evening as daytime.
  .refine((v) => v.eveningMode !== "fixed" || (v.eveningSurcharge ?? 0) > 0, {
    path: ["eveningSurcharge"],
    message: "Set the evening surcharge, or switch the evening band off.",
  })
  .refine((v) => v.nightMode !== "fixed" || v.nightSurcharge > 0, {
    path: ["nightSurcharge"],
    message: "Set the night surcharge, or switch the night band off.",
  })
  // A return package dearer per trip than one way contradicts itself, and the
  // pages would have to tell customers so. Almost certainly a typo.
  .refine((v) => v.returnEach.every((r, i) => r <= v.oneWay[i]), {
    path: ["returnEach"],
    message: "A return trip cannot cost more than the one-way fare in the same zone.",
  });

const toMinor = (r: number) => Math.round(r * 100);

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasServiceRole()) {
    return NextResponse.json({ error: "Not configured on this environment." }, { status: 503 });
  }
  const admin = await getPrivileged();
  const [sheet, versions] = await Promise.all([
    admin.rpc("transfer_price_sheet"),
    admin
      .from("transfer_pricing_versions")
      .select("*")
      .order("effective_from", { ascending: false })
      .order("id", { ascending: false })
      .limit(12),
  ]);
  if (sheet.error || versions.error) {
    console.error("transfer pricing read failed", sheet.error ?? versions.error);
    return NextResponse.json({ error: "Could not load the airport price list." }, { status: 500 });
  }
  return NextResponse.json({ active: sheet.data ?? null, versions: versions.data ?? [] });
}

export async function POST(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasServiceRole()) {
    return NextResponse.json({ error: "Not configured on this environment." }, { status: 503 });
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = publishSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Check the numbers." },
      { status: 400 },
    );
  }
  const v = parsed.data;
  const admin = await getPrivileged();

  // Where zones are measured from is not a price, and is not on the form:
  // carried over from the list IN FORCE (not a future-dated one) — and so is
  // the evening band whenever the form did not send it (see the schema).
  const { data: current, error: readErr } = await admin
    .from("transfer_pricing_versions")
    .select("origin_label, origin_lat, origin_lng, origin_radius_km, evening_mode, evening_from_hour, evening_to_hour, evening_surcharge, evening_multiplier")
    .lte("effective_from", new Date().toISOString())
    .order("effective_from", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (readErr || !current) {
    console.error("transfer pricing origin read failed", readErr);
    return NextResponse.json({ error: "Could not read the current price list." }, { status: 500 });
  }

  const row = {
    label: v.label,
    origin_label: current.origin_label,
    origin_lat: current.origin_lat,
    origin_lng: current.origin_lng,
    origin_radius_km: current.origin_radius_km,
    zone1_max_km: v.zone1MaxKm,
    zone2_max_km: v.zone2MaxKm,
    one_way_zone1: toMinor(v.oneWay[0]),
    one_way_zone2: toMinor(v.oneWay[1]),
    one_way_zone3: toMinor(v.oneWay[2]),
    return_zone1: toMinor(v.returnEach[0]),
    return_zone2: toMinor(v.returnEach[1]),
    return_zone3: toMinor(v.returnEach[2]),
    included_passengers: v.includedPassengers,
    extra_passenger_fee: toMinor(v.extraPassengerFee),
    max_priced_passengers: v.maxPricedPassengers,
    night_mode: v.nightMode,
    night_from_hour: v.nightFromHour,
    night_to_hour: v.nightToHour,
    night_surcharge: toMinor(v.nightSurcharge),
    // numeric(4,2): rounded here so Postgres never silently drops a digit.
    night_multiplier: Math.round(v.nightMultiplier * 100) / 100,
    // Each evening field: the form's value, else the list in force's.
    evening_mode: v.eveningMode ?? current.evening_mode,
    evening_from_hour: v.eveningFromHour ?? current.evening_from_hour,
    evening_to_hour: v.eveningToHour ?? current.evening_to_hour,
    evening_surcharge: v.eveningSurcharge != null ? toMinor(v.eveningSurcharge) : current.evening_surcharge,
    evening_multiplier:
      v.eveningMultiplier != null ? Math.round(v.eveningMultiplier * 100) / 100 : current.evening_multiplier,
    commission_percent: Math.round(v.commissionPercent * 100) / 100,
    quote_valid_minutes: v.quoteValidMinutes,
    created_by: "admin",
    note: v.note || null,
  };

  const { data, error } = await admin
    .from("transfer_pricing_versions")
    .insert(row)
    .select("id, effective_from")
    .single();
  if (error) {
    console.error("transfer pricing publish failed", error);
    return NextResponse.json({ error: "Could not publish that price list." }, { status: 500 });
  }

  // A price change is exactly the thing somebody asks about later.
  await audit(admin, {
    action: "transfer_pricing.publish",
    entityType: "transfer_pricing_versions",
    entityId: String(data.id),
    diff: row,
  });
  return NextResponse.json({ ok: true, id: data.id, effectiveFrom: data.effective_from });
}
