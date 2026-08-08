import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { guardShared } from "@/lib/rate-limit";
import { normalizePickupCode } from "@/lib/orders/pickup";

// ── Merchant-side pickup handover (M28) ────────────────────────────────────
//
// The customer shows an eight-character code; the merchant types it here and
// the order becomes Collected in one transaction. Every guarantee lives in
// redeem_pickup_code() — store-staff-only, single-use under a row lock,
// expiring, idempotent — because this route is not the only thing that could
// ever call it, and because the RPC is what runs inside the database
// transaction that also moves the order.
//
// The rate limit is the brute-force ceiling. The code space is 32^8 (1.1e12),
// so 20/min is already astronomically far from a hit; the RPC also kills a
// token after ten failed attempts against it.
const NOT_FOUND_CODE = "RR021";
const EXPIRED_CODE = "RR022";
const WRONG_STATUS_CODE = "RR023";
const BURNED_CODE = "RR024";

const schema = z.object({
  code: z
    .string()
    .trim()
    .max(32)
    .transform(normalizePickupCode)
    .refine((c) => c.length === 8, "Enter the full 8-character code."),
});

export async function POST(req: NextRequest) {
  const limited = await guardShared(req, "pickup-redeem", 20, 60_000);
  if (limited) return limited;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid code." }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("redeem_pickup_code", { p_code: parsed.data.code });

  if (error) {
    // The RPC's own messages are written for the person at the counter, so
    // they are passed through rather than replaced with a generic string.
    if (error.code === NOT_FOUND_CODE) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error.code === EXPIRED_CODE) return NextResponse.json({ error: error.message }, { status: 410 });
    if (error.code === WRONG_STATUS_CODE) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error.code === BURNED_CODE) return NextResponse.json({ error: error.message }, { status: 429 });
    console.error("redeem_pickup_code unexpected error", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }

  return NextResponse.json(data);
}
