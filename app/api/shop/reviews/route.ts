import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { guardShared } from "@/lib/rate-limit";

// ── Store reviews (M29) ────────────────────────────────────────────────────
//
// One route, two credentials, because the marketplace has two kinds of
// customer and M21 is the standing lesson about serving only one of them:
//
//   { orderId }                  → the caller's session proves the order
//   { orderNumber, email }       → the M20 guest credential
//
// Neither branch decides anything. rate_store() and guest_rate_store() verify
// the purchase, refuse an order that is not collected, refuse a second review,
// and choose the published status themselves. This route picks which one to
// call and rate-limits the guessable one.
//
// NOT a separate /api/reviews: that path already belongs to the site
// testimonials on `product_reviews`, an entirely different table with its own
// moderation. Two review systems, two routes, no shared surprise.
const NOT_FOUND = "RR031";
const NOT_COLLECTED = "RR032";
const ALREADY = "RR033";
const BAD_RATING = "RR030";
const NOT_SIGNED_IN = "RR034";

const schema = z
  .object({
    rating: z.number().int().min(1, "Choose between 1 and 5 stars.").max(5, "Choose between 1 and 5 stars."),
    body: z.string().trim().max(1000).optional(),
    orderId: z.string().uuid().optional(),
    orderNumber: z.string().trim().min(6).max(32).optional(),
    email: z.string().trim().toLowerCase().email().max(254).optional(),
  })
  .refine((v) => Boolean(v.orderId) || Boolean(v.orderNumber && v.email), {
    message: "Tell us which order you're reviewing.",
  });

function mapError(code: string | undefined, message: string): NextResponse | null {
  // The RPC messages are written for the customer, so they are passed through.
  if (code === NOT_FOUND) return NextResponse.json({ error: message }, { status: 404 });
  if (code === NOT_COLLECTED) return NextResponse.json({ error: message }, { status: 409 });
  if (code === ALREADY) return NextResponse.json({ error: message }, { status: 409 });
  if (code === BAD_RATING) return NextResponse.json({ error: message }, { status: 400 });
  if (code === NOT_SIGNED_IN) return NextResponse.json({ error: message }, { status: 401 });
  return null;
}

export async function POST(req: NextRequest) {
  const limited = await guardShared(req, "store-review", 10, 60_000);
  if (limited) return limited;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }
  const { rating, body, orderId, orderNumber, email } = parsed.data;

  // Signed-in path first: if there is a session AND an order id, the session is
  // the stronger credential and the one the RPC will check.
  if (orderId) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in to leave a review." }, { status: 401 });

    const { data, error } = await supabase.rpc("rate_store", {
      p_order_id: orderId,
      p_rating: rating,
      p_body: body ?? null,
    });
    if (error) {
      const mapped = mapError(error.code, error.message);
      if (mapped) return mapped;
      console.error("rate_store unexpected error", error);
      return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
    }
    return NextResponse.json(data);
  }

  if (!hasServiceRole()) {
    console.error("store review: SUPABASE_SERVICE_ROLE_KEY missing");
    return NextResponse.json({ error: "Reviews are unavailable right now." }, { status: 503 });
  }

  const admin = await getPrivileged();
  const { data, error } = await admin.rpc("guest_rate_store", {
    p_order_number: orderNumber,
    p_email: email,
    p_rating: rating,
    p_body: body ?? null,
  });
  if (error) {
    const mapped = mapError(error.code, error.message);
    if (mapped) return mapped;
    console.error("guest_rate_store unexpected error", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
  return NextResponse.json(data);
}
