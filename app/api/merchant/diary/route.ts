import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOwnStoreId } from "@/lib/merchant/context";

// ── The service provider's diary ────────────────────────────────────────────
//
// The store id NEVER comes from the request body: it is resolved server-side by
// getOwnStoreId() and re-checked inside Postgres by is_store_staff(), so a
// provider cannot read or fill somebody else's diary even by crafting the
// request by hand. Same rule as /api/merchant/own-delivery.
//
// Every write here is an RPC. Capacity — "can this time actually be sold" — is
// decided under a row lock in book_service_slot, which is the only place it can
// be decided safely: two people booking the last 09:00 slot at once is the
// ordinary case on a busy morning, not an edge case.

/** Refusals the RPCs raise on purpose, shown to the provider as written. */
const SPOKEN = new Set(["P0001", "RR089"]);

function fail(error: { code?: string; message?: string } | null) {
  if (error && error.code && SPOKEN.has(error.code)) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ error: "That did not go through." }, { status: 400 });
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const storeId = await getOwnStoreId(supabase);
  if (!storeId) return NextResponse.json({ error: "No shop" }, { status: 403 });

  const variantId = req.nextUrl.searchParams.get("slots");
  const date = req.nextUrl.searchParams.get("date");

  // ── The times still free for one service on one day ────────────────────
  if (variantId) {
    const { data, error } = await supabase.rpc("service_slots", {
      p_store_id: storeId,
      p_variant_id: variantId,
    });
    if (error) return fail(error);
    const rows = (data ?? []) as {
      slot_date: string;
      slot_time: string | null;
      starts_at: string | null;
      reason: string | null;
    }[];
    const forDay = date ? rows.filter((r) => r.slot_date === date) : rows;
    return NextResponse.json({
      times: forDay
        .filter((r) => r.starts_at)
        // "09:00:00" from Postgres; the diary reads in minutes, not seconds.
        .map((r) => ({ time: (r.slot_time ?? "").slice(0, 5), startsAt: r.starts_at })),
      // A day that yields nothing owes an explanation, and the RPC supplies
      // one. Dropping it would leave an empty list meaning four things.
      reason: forDay.find((r) => r.reason)?.reason ?? null,
      // Which days are worth tapping at all, so the picker can grey the rest
      // instead of letting somebody choose a Sunday and then be refused.
      openDates: [...new Set(rows.filter((r) => r.starts_at).map((r) => r.slot_date))],
    });
  }

  const days = Number(req.nextUrl.searchParams.get("days") ?? 14);

  const [{ data: diary, error }, { data: provider }, { data: products }] = await Promise.all([
    supabase.rpc("service_calendar", { p_store_id: storeId, p_days: Number.isFinite(days) ? days : 14 }),
    supabase
      .from("trade_providers")
      .select("trade, mobile, slot_minutes, concurrent_jobs, lead_hours, booking_days")
      .eq("store_id", storeId)
      .maybeSingle(),
    supabase
      .from("products")
      .select("id, name, status, product_variants(id, name, price, is_active)")
      .eq("store_id", storeId)
      .neq("status", "archived")
      .order("name"),
  ]);
  if (error) return fail(error);

  // Durations hang off the variant, so they are fetched for the variants this
  // store actually has rather than joined through a table the client can read
  // for every shop on the island.
  type Variant = { id: string; name: string | null; price: number; is_active: boolean };
  type Product = { id: string; name: string; status: string; product_variants: Variant[] };
  const rows = (products ?? []) as Product[];
  const variantIds = rows.flatMap((p) => p.product_variants.filter((v) => v.is_active).map((v) => v.id));
  const { data: durations } = variantIds.length
    ? await supabase.from("service_durations").select("variant_id, minutes").in("variant_id", variantIds)
    : { data: [] as { variant_id: string; minutes: number }[] };
  const minutesOf = new Map(
    ((durations ?? []) as { variant_id: string; minutes: number }[]).map((d) => [d.variant_id, d.minutes]),
  );

  return NextResponse.json({
    ...(diary as object),
    settings: {
      trade: provider?.trade ?? "",
      mobile: provider?.mobile ?? false,
      slotMinutes: provider?.slot_minutes ?? 30,
      concurrentJobs: provider?.concurrent_jobs ?? 1,
      leadHours: provider?.lead_hours ?? 2,
      bookingDays: provider?.booking_days ?? 14,
    },
    services: rows.flatMap((p) =>
      p.product_variants
        .filter((v) => v.is_active)
        .map((v) => ({
          variantId: v.id,
          // A single-variant product is the ordinary case for a trade: the
          // variant is usually unnamed, and "Car wash" beats "Car wash —".
          name: v.name ? `${p.name} — ${v.name}` : p.name,
          priceCents: v.price,
          draft: p.status !== "active",
          minutes: minutesOf.get(v.id) ?? null,
        })),
    ),
  });
}

const Body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("book"),
    variantId: z.string().uuid(),
    startsAt: z.string().min(1),
    customerName: z.string().trim().min(1).max(80),
    customerPhone: z.string().trim().min(1).max(40),
    note: z.string().trim().max(300).optional(),
  }),
  z.object({
    action: z.literal("status"),
    bookingId: z.string().uuid(),
    status: z.enum(["booked", "done", "cancelled", "no_show"]),
  }),
  z.object({
    action: z.literal("settings"),
    // The four bounds are the CHECK constraints, repeated here only so the
    // provider gets a sentence instead of a Postgres error string. Postgres
    // stays the authority: a request that skips this route still fails.
    slotMinutes: z.union([z.literal(15), z.literal(30), z.literal(60)]),
    concurrentJobs: z.number().int().min(1).max(20),
    leadHours: z.number().int().min(0).max(168),
    bookingDays: z.number().int().min(1).max(90),
  }),
  z.object({
    action: z.literal("duration"),
    variantId: z.string().uuid(),
    // null clears it, and clearing is a real choice: no duration means the
    // slot finder falls back to one slot rather than guessing a length.
    minutes: z.number().int().min(5).max(600).nullable(),
  }),
]);

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const storeId = await getOwnStoreId(supabase);
  if (!storeId) return NextResponse.json({ error: "No shop" }, { status: 403 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const body = parsed.data;

  if (body.action === "book") {
    const { data, error } = await supabase.rpc("book_service_slot", {
      p_store_id: storeId,
      p_variant_id: body.variantId,
      p_starts_at: body.startsAt,
      p_customer_name: body.customerName,
      p_customer_phone: body.customerPhone,
      p_note: body.note || null,
      // Taken by the provider, on the telephone. That is how almost every
      // booking on this island will arrive, and the diary records which ones
      // did — a provider whose bookings are all 'provider' has a website that
      // is not working for them.
      p_source: "provider",
    });
    if (error) return fail(error);
    return NextResponse.json(data);
  }

  if (body.action === "status") {
    const { data, error } = await supabase.rpc("set_service_booking_status", {
      p_booking_id: body.bookingId,
      p_status: body.status,
    });
    if (error) return fail(error);
    return NextResponse.json(data);
  }

  if (body.action === "settings") {
    const { error } = await supabase
      .from("trade_providers")
      .update({
        slot_minutes: body.slotMinutes,
        concurrent_jobs: body.concurrentJobs,
        lead_hours: body.leadHours,
        booking_days: body.bookingDays,
        updated_at: new Date().toISOString(),
      })
      .eq("store_id", storeId);
    if (error) return fail(error);
    return NextResponse.json({ ok: true });
  }

  // ── A duration belongs to a variant of THIS store ──────────────────────
  // service_durations is keyed only by variant_id, so without this check a
  // provider could set the length of somebody else's service. The table's
  // policy is a read policy; the write goes through here, so here is where the
  // ownership has to be proved.
  const { data: owned } = await supabase
    .from("product_variants")
    .select("id, products!inner(store_id)")
    .eq("id", body.variantId)
    .eq("products.store_id", storeId)
    .maybeSingle();
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (body.minutes === null) {
    const { error } = await supabase.from("service_durations").delete().eq("variant_id", body.variantId);
    if (error) return fail(error);
    return NextResponse.json({ ok: true, minutes: null });
  }

  const { error } = await supabase
    .from("service_durations")
    .upsert(
      { variant_id: body.variantId, minutes: body.minutes, updated_at: new Date().toISOString() },
      { onConflict: "variant_id" },
    );
  if (error) return fail(error);
  return NextResponse.json({ ok: true, minutes: body.minutes });
}
