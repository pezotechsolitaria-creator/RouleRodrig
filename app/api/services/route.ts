import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { guard } from "@/lib/rate-limit";

// ── Booking a tradesperson, from the storefront ─────────────────────────────
//
// The owner: "now let customers book themselves from the storefront."
//
// PUBLIC, and deliberately open to a visitor with no account. A customer on
// this island books a car wash from a phone at the side of the road; making
// them create an account first is the same as not offering it. That is why the
// phone number is required and validated in SQL — it is the only way the
// provider can reach somebody who never signed in.
//
// Everything that decides whether a booking may exist is in Postgres:
// book_service_slot_public checks visibility, the online-bookings toggle, the
// three-per-phone cap, opening hours and capacity, the last of those under a
// row lock. This route carries the request and rate-limits the door.

/** Refusals the RPC raises on purpose, shown to the customer as written. */
const SPOKEN = new Set(["P0001"]);

export async function GET(req: NextRequest) {
  // Generous: the day picker refetches on every tap, and a customer comparing
  // Tuesday against Thursday is doing exactly what this is for.
  const limited = guard(req, "service-slots", 120, 60_000);
  if (limited) return limited;

  const storeId = req.nextUrl.searchParams.get("store");
  const variantId = req.nextUrl.searchParams.get("variant");
  const date = req.nextUrl.searchParams.get("date");
  if (!storeId || !variantId) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("service_slots", {
    p_store_id: storeId,
    p_variant_id: variantId,
  });
  if (error) return NextResponse.json({ error: "Could not check what is free." }, { status: 400 });

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
      .map((r) => ({ time: (r.slot_time ?? "").slice(0, 5), startsAt: r.starts_at })),
    // A day that yields nothing owes a sentence. "Closed" and "fully booked"
    // send a customer to two different decisions.
    reason: forDay.find((r) => r.reason)?.reason ?? null,
    // Which days are worth tapping, so the strip can grey the rest rather than
    // letting somebody pick a Sunday and be refused after typing their name.
    openDates: [...new Set(rows.filter((r) => r.starts_at).map((r) => r.slot_date))],
  });
}

const Body = z.object({
  storeId: z.string().uuid(),
  variantId: z.string().uuid(),
  startsAt: z.string().min(1),
  name: z.string().trim().min(1).max(80),
  phone: z.string().trim().min(1).max(40),
  note: z.string().trim().max(300).optional(),
});

export async function POST(req: NextRequest) {
  // Tight, because this one writes into somebody's working day. The SQL cap of
  // three open bookings per phone is the real defence — this stops a script
  // before it gets that far.
  const limited = guard(req, "service-book", 6, 60_000);
  if (limited) return limited;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const b = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("book_service_slot_public", {
    p_store_id: b.storeId,
    p_variant_id: b.variantId,
    p_starts_at: b.startsAt,
    p_customer_name: b.name,
    p_customer_phone: b.phone,
    p_note: b.note || null,
  });

  if (error) {
    if (error.code && SPOKEN.has(error.code)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "That booking did not go through." }, { status: 400 });
  }
  return NextResponse.json(data);
}
