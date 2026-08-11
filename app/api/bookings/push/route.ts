import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { guard } from "@/lib/rate-limit";
import { pushIsConfigured } from "@/lib/push/send";

// A customer subscribing their phone to updates about their own booking.
// Credential: the reference plus the email they booked with — the same proof
// /api/bookings/lookup demands. All matching happens inside the RPC (M64),
// which reduces the reference to hex so it can never carry a pattern wildcard.

const schema = z.object({
  ref: z.string().trim().min(1).max(40),
  email: z.string().trim().email().max(200),
  endpoint: z.string().url().max(2000),
  keys: z.object({
    p256dh: z.string().min(1).max(500),
    auth: z.string().min(1).max(500),
  }),
});

export async function POST(req: NextRequest) {
  // Same budget as the lookup it mirrors: this endpoint takes a guessable
  // reference, so it must not become a cheap oracle.
  const limited = guard(req, "booking-push", 10, 60_000);
  if (limited) return limited;

  if (!pushIsConfigured()) {
    return NextResponse.json({ error: "Alerts are not available yet." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid subscription." }, { status: 400 });

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("register_booking_push", {
    p_endpoint: parsed.data.endpoint,
    p_p256dh: parsed.data.keys.p256dh,
    p_auth: parsed.data.keys.auth,
    p_ref: parsed.data.ref,
    p_email: parsed.data.email,
    p_user_agent: req.headers.get("user-agent") ?? null,
  });

  if (error) {
    console.error("register_booking_push failed", error);
    return NextResponse.json({ error: "Could not turn alerts on." }, { status: 500 });
  }
  // Same response for "no such booking" and "wrong email", so this cannot be
  // used to discover which address made which booking.
  if (data !== true) {
    return NextResponse.json({ error: "Could not turn alerts on." }, { status: 403 });
  }

  return NextResponse.json({ ok: true });
}
