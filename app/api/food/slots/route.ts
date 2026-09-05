import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { guardShared } from "@/lib/rate-limit";

// ── WHICH TIMES CAN THIS BASKET BE COLLECTED AT? (M161) ─────────────────────
//
// A thin pass-through to food_pickup_slots(). It deliberately holds NO
// scheduling logic: the same split lib/schedule.ts declares in its own header,
// and the reason the picker cannot drift from what checkout will accept.
// create_food_order re-derives the window server-side anyway, so nothing here
// is trusted — a client that invents a time gets RR030 at checkout.
//
// Reading which times are offered is harmless and guest checkout is the
// default path on /food, so the RPC is granted to anon as well.

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  storeId: z.string().uuid(),
  // The basket. Its slowest dish sets the lead time, and every dish must be
  // servable at a tick for that tick to be offered — which is how a breakfast
  // farata disappears from tonight and appears at 07:00 tomorrow, with no
  // special case anywhere.
  variantIds: z.array(z.string().uuid()).max(50).optional(),
});

export async function POST(req: NextRequest) {
  const limited = await guardShared(req, "food-slots", 30, 60_000);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("food_pickup_slots", {
    p_store_id: parsed.data.storeId,
    p_variant_ids: parsed.data.variantIds ?? null,
  });

  if (error) {
    console.error("food_pickup_slots failed", error);
    return NextResponse.json({ error: "Could not load collection times." }, { status: 500 });
  }

  type Row = {
    slot_date: string;
    slot_time: string | null;
    starts_at: string | null;
    reason: string | null;
  };

  // A row with a reason and no time is a whole DAY explaining itself — the
  // page can say "closed Sunday" instead of showing an empty strip.
  const rows = (data ?? []) as Row[];

  return NextResponse.json({
    slots: rows.map((r) => ({
      date: r.slot_date,
      time: r.slot_time ? r.slot_time.slice(0, 5) : null,
      startsAt: r.starts_at,
      reason: r.reason,
    })),
  });
}
