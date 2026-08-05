import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOwnStoreId } from "@/lib/merchant/context";
import { guard } from "@/lib/rate-limit";

const NOT_FOUND_CODE = "RR003";
const VALIDATION_CODE = "RR005";
const SUBSCRIPTION_CODE = "RR008";
const CHECK_VIOLATION = "23514";

// "HH:MM" or "HH:MM:SS" — Rodrigues wall-clock time, never an instant.
const timeRe = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;
const time = z.string().regex(timeRe, "Use a time like 08:00.");

const daySchema = z.object({
  weekday: z.number().int().min(0).max(6),
  is_closed: z.boolean(),
  opens_at: time.nullable().optional(),
  closes_at: time.nullable().optional(),
  delivery_opens_at: time.nullable().optional(),
  delivery_closes_at: time.nullable().optional(),
  delivery_closed: z.boolean().optional(),
  note: z.string().trim().max(200).nullable().optional(),
});

// Shape only. Every real rule — closing after opening, the delivery window
// sitting inside the shop's hours, one row per weekday — is enforced by
// set_store_hours() and by CHECK constraints on store_hours, so a request that
// bypasses this route still cannot store an impossible schedule.
const putSchema = z.object({ days: z.array(daySchema).min(1).max(7) });

export async function GET(req: NextRequest) {
  const limited = guard(req, "merchant-store-hours", 60, 60_000);
  if (limited) return limited;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const storeId = await getOwnStoreId(supabase);
  if (!storeId) return NextResponse.json({ error: "No shop found for this account." }, { status: 404 });

  const [{ data: days, error }, { data: status }] = await Promise.all([
    supabase
      .from("store_hours")
      .select("weekday, opens_at, closes_at, delivery_opens_at, delivery_closes_at, delivery_closed, is_closed, note")
      .eq("store_id", storeId)
      .is("date", null)
      .order("weekday"),
    supabase.rpc("store_schedule_status", { p_store_id: storeId }).single(),
  ]);

  if (error) {
    console.error("load store hours failed", error);
    return NextResponse.json({ error: "Could not load your opening hours." }, { status: 500 });
  }

  return NextResponse.json({ days: days ?? [], status: status ?? null });
}

export async function PUT(req: NextRequest) {
  const limited = guard(req, "merchant-store-hours-write", 20, 60_000);
  if (limited) return limited;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const storeId = await getOwnStoreId(supabase);
  if (!storeId) return NextResponse.json({ error: "No shop found for this account." }, { status: 404 });

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

  // The store id comes from the session, never from the body — a merchant
  // cannot address someone else's shop. set_store_hours() re-checks ownership
  // anyway, so this holds even if the route were bypassed.
  const { error } = await supabase.rpc("set_store_hours", {
    p_store_id: storeId,
    p_days: parsed.data.days,
  });

  if (error) {
    if (error.code === NOT_FOUND_CODE) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error.code === VALIDATION_CODE) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error.code === SUBSCRIPTION_CODE) return NextResponse.json({ error: error.message }, { status: 403 });
    if (error.code === CHECK_VIOLATION) {
      return NextResponse.json({ error: "That schedule isn't valid. Check the opening and delivery times." }, { status: 400 });
    }
    console.error("set_store_hours failed", error);
    return NextResponse.json({ error: "Could not save your opening hours." }, { status: 500 });
  }

  const { data: status } = await supabase.rpc("store_schedule_status", { p_store_id: storeId }).single();
  return NextResponse.json({ ok: true, status: status ?? null });
}
