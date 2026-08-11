import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { guardShared } from "@/lib/rate-limit";

// Event-level settings, as opposed to per-package ones (/api/organizer/packages)
// or money ones (/api/organizer/payments). Capacity is the first; anything else
// that describes the EVENT rather than a ticket type belongs here too.
//
// Authorization is the database's: organizer_set_capacity() is gated by
// can_manage_event() and this runs on the signed-in user's client, never the
// service role.
const capacitySchema = z.object({
  storeId: z.string().uuid(),
  // null clears the limit. 1_000_000 is an upper bound on a venue, not a
  // business rule — it exists so a typo cannot become a bigint.
  capacity: z.number().int().min(1).max(1_000_000).nullable(),
});

export async function PATCH(req: NextRequest) {
  const limited = await guardShared(req, "organizer-event", 20, 60_000);
  if (limited) return limited;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = capacitySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("organizer_set_capacity", {
    p_store_id: parsed.data.storeId,
    p_capacity: parsed.data.capacity,
  });

  if (error) {
    if (error.code === "RR003") return NextResponse.json({ error: "Not found." }, { status: 404 });
    // RR005 messages are written for the organiser to read — "You have already
    // sold or reserved 6 places" — so they pass straight through.
    if (error.code === "RR005") return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("organizer_set_capacity failed", error);
    return NextResponse.json({ error: "Could not save that." }, { status: 500 });
  }

  return NextResponse.json(data);
}
