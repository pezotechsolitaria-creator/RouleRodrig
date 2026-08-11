import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { guardShared } from "@/lib/rate-limit";

// The door.
//
// AUTHORIZATION IS THE DATABASE'S. redeem_ticket() is gated by
// can_manage_event() and runs on the SIGNED-IN USER's client, never the service
// role — so someone who is not an assigned organiser for THIS event cannot
// admit anybody, whatever this file does.
//
// An unknown code and a code belonging to somebody else's event return the same
// RR003 with the same words. That is deliberate: a distinguishable response
// would turn this endpoint into an oracle for testing whether a code is real.
//
// The rate limit is generous because a door is genuinely fast — a queue of 200
// people is 200 legitimate calls in a few minutes — but it is not absent,
// because the same endpoint would otherwise be a comfortable place to grind
// guesses. 122 bits of uuid makes guessing hopeless anyway; this is depth.
const scanSchema = z.object({
  // Accepts either a bare public_id or anything containing one, so a code that
  // arrives from a camera app as a URL still works. The uuid is extracted
  // client-side; this is the last check before the database.
  publicId: z.string().uuid("That isn't a ticket code."),
});

export async function POST(req: NextRequest) {
  const limited = await guardShared(req, "organizer-scan", 240, 60_000);
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
  const parsed = scanSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid code." }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("redeem_ticket", {
    p_public_id: parsed.data.publicId,
  });

  if (error) {
    // RR003 covers both "no such ticket" and "not your event" — same answer.
    if (error.code === "RR003") {
      return NextResponse.json({ error: "Not a ticket for this event." }, { status: 404 });
    }
    console.error("redeem_ticket failed", error);
    return NextResponse.json({ error: "Could not read that ticket." }, { status: 500 });
  }

  // admitted | already_used | void all arrive here as 200s carrying the facts.
  // A re-scan at a door is ordinary, not an error, and a scanner that flashes
  // red for ordinary events teaches staff to ignore red.
  return NextResponse.json(data);
}
