import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOwnStoreId } from "@/lib/merchant/context";

// The merchant's own-delivery settings, and the couriers they have issued links
// to.
//
// The store id NEVER comes from the request body: it is resolved server-side by
// getOwnStoreId() and then re-checked inside Postgres by is_store_staff(), so a
// merchant cannot name somebody else's shop even if they craft the request by
// hand.

export async function GET() {
  const supabase = await createClient();
  const storeId = await getOwnStoreId(supabase);
  if (!storeId) return NextResponse.json({ error: "No shop" }, { status: 403 });

  const [{ data: settings }, { data: couriers }] = await Promise.all([
    supabase
      .from("store_own_delivery")
      .select("enabled, tracking_approved, fee_cents")
      .eq("store_id", storeId)
      .maybeSingle(),
    supabase
      .from("store_couriers")
      .select("id, name, phone, token, last_seen_at")
      .eq("store_id", storeId)
      .eq("active", true)
      .order("created_at"),
  ]);

  return NextResponse.json({
    enabled: settings?.enabled ?? false,
    trackingApproved: settings?.tracking_approved ?? false,
    feeCents: settings?.fee_cents ?? 0,
    couriers: couriers ?? [],
  });
}

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("toggle"), enabled: z.boolean() }),
  z.object({
    action: z.literal("add"),
    name: z.string().trim().min(1).max(80),
    phone: z.string().trim().max(40).optional(),
  }),
  z.object({ action: z.literal("remove"), id: z.string().uuid() }),
]);

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const storeId = await getOwnStoreId(supabase);
  if (!storeId) return NextResponse.json({ error: "No shop" }, { status: 403 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const body = parsed.data;

  if (body.action === "toggle") {
    const { error } = await supabase.rpc("set_own_delivery", {
      p_store_id: storeId,
      p_enabled: body.enabled,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "add") {
    // Tracking must be approved first. courier_jobs() requires the approval
    // too, so without this check a merchant could mint links that resolve to an
    // empty screen — worse than a disabled button that says why.
    const { data: settings } = await supabase
      .from("store_own_delivery")
      .select("tracking_approved")
      .eq("store_id", storeId)
      .maybeSingle();
    if (!settings?.tracking_approved) {
      return NextResponse.json(
        { error: "Tracked delivery is not switched on for your shop yet." },
        { status: 403 },
      );
    }

    const { data, error } = await supabase
      .from("store_couriers")
      .insert({ store_id: storeId, name: body.name, phone: body.phone || null })
      .select("id, name, phone, token, last_seen_at")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ courier: data });
  }

  // Revoked, not deleted: the link stops working immediately, and the record of
  // who was carrying orders last week survives.
  const { error } = await supabase
    .from("store_couriers")
    .update({ active: false })
    .eq("id", body.id)
    .eq("store_id", storeId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
