import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { guard } from "@/lib/rate-limit";
import { notifyCustomerOfQuote } from "@/lib/delivery/notify-requests";

// ── The driver's whole API surface ──────────────────────────────────────────
//
// GET  → the dashboard, in one round trip (driver_dashboard()).
// POST → one action, named. Every action is an RPC that validates the
//        transition server-side; this route never decides anything.
//
// There is no UPDATE grant on `deliveries` for any client role (M45), so a
// driver with a REST client cannot set status='delivered' by hand. The only
// way through is an action below, and each one re-checks ownership.
const NOT_A_DRIVER = "RR081";
const NOT_APPROVED = "RR083";
const AT_CAPACITY = "RR084";
const GONE = "RR085";
const BAD_TRANSITION = "RR086";
const PIN_BURNED = "RR087";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("online"), online: z.boolean() }),
  z.object({ action: z.literal("accept"), deliveryId: z.string().uuid() }),
  z.object({
    action: z.literal("advance"),
    deliveryId: z.string().uuid(),
    // `delivered` is deliberately absent: it is reachable only by PIN.
    to: z.enum(["going_to_pickup", "arrived_at_pickup", "picked_up", "out_for_delivery", "arrived"]),
  }),
  z.object({
    action: z.literal("complete"),
    deliveryId: z.string().uuid(),
    pin: z.string().trim().min(1).max(12),
  }),
  // NOTE: the "whatsapp" action lived here. Setting up CallMeBot moved to
  // /admin/people — the owner onboards these drivers by hand, and asking a
  // driver to message a bot and paste a key back was the wrong end of the
  // relationship. The endpoint went with the screen rather than being left
  // reachable with nothing calling it. set_driver_whatsapp() still exists in
  // the database; admin_set_driver_whatsapp() is its sibling.
  z.object({
    action: z.literal("cannot_complete"),
    deliveryId: z.string().uuid(),
    reason: z.enum(["vehicle", "illness", "weather", "access", "merchant", "customer", "other"]),
    note: z.string().trim().max(500).optional(),
  }),
  // M136 — a Deliver Anything job has no price until a driver names one. The
  // fee is in MINOR UNITS, like every other amount on the wire in this system;
  // the bounds are re-checked inside offer_delivery_quote(), because a number
  // typed on a phone is not a number this route may trust.
  z.object({
    action: z.literal("quote"),
    requestId: z.string().uuid(),
    fee: z.number().int().min(100).max(5_000_000),
    note: z.string().trim().max(300).optional(),
  }),
  z.object({ action: z.literal("withdraw_quote"), quoteId: z.string().uuid() }),
]);

async function client() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function GET() {
  const { supabase, user } = await client();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { data, error } = await supabase.rpc("driver_dashboard");
  if (error) {
    // Not a driver is a normal state, not a failure — the page uses it to show
    // the application form instead of an error.
    if (error.code === NOT_A_DRIVER) return NextResponse.json({ isDriver: false }, { status: 200 });
    console.error("driver_dashboard failed", error);
    return NextResponse.json({ error: "Could not load your dashboard." }, { status: 500 });
  }
  // Whether WhatsApp alerts are set up — a boolean, never the key itself. No
  // RPC anywhere returns the stored value, so a stolen session cannot read it.
  // The quotable board rides alongside it: both are small, neither is worth a
  // second round trip on island data, and a failure of either must not cost the
  // driver their active deliveries.
  const { data: openRequests, error: boardError } = await supabase.rpc(
    "driver_open_requests",
  );
  if (boardError) console.error("driver_open_requests failed", boardError);

  return NextResponse.json({
    isDriver: true,
    ...(data as object),
    openRequests: openRequests ?? [],
  });
}

export async function POST(req: NextRequest) {
  // A driver tapping repeatedly on a bad signal is expected, not abuse — but
  // it should not become a flood either.
  const limited = guard(req, "driver-action", 60, 60_000);
  if (limited) return limited;

  const { supabase, user } = await client();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid action." }, { status: 400 });
  }
  const input = parsed.data;

  // One RPC per action, named. This was a six-deep nested ternary and adding
  // the two quoting actions to it would have made the last branch unreadable —
  // the shape is a lookup, so it is written as one.
  function call() {
    switch (input.action) {
      case "online":
        return supabase.rpc("set_driver_availability", { p_online: input.online });
      case "accept":
        return supabase.rpc("accept_delivery", { p_delivery_id: input.deliveryId });
      case "advance":
        return supabase.rpc("advance_delivery", { p_delivery_id: input.deliveryId, p_to: input.to });
      case "complete":
        return supabase.rpc("complete_delivery_with_pin", {
          p_delivery_id: input.deliveryId,
          p_pin: input.pin,
        });
      case "quote":
        return supabase.rpc("offer_delivery_quote", {
          p_request_id: input.requestId,
          p_fee: input.fee,
          p_note: input.note ?? null,
        });
      case "withdraw_quote":
        return supabase.rpc("withdraw_delivery_quote", { p_quote_id: input.quoteId });
      case "cannot_complete":
        return supabase.rpc("driver_cannot_complete", {
          p_delivery_id: input.deliveryId,
          p_reason: input.reason,
          p_note: input.note ?? null,
        });
    }
  }

  const { data, error } = await call();

  if (error) {
    // The RPC messages are written for somebody standing in the road holding a
    // package, so they are passed through rather than replaced.
    const map: Record<string, number> = {
      [NOT_A_DRIVER]: 403,
      [NOT_APPROVED]: 403,
      [AT_CAPACITY]: 409,
      [GONE]: 409,
      [BAD_TRANSITION]: 409,
      [PIN_BURNED]: 429,
      // The quoting RPCs raise P0001 with sentences written for a driver
      // standing in the road — "This request is no longer open", "This is a
      // large item and needs a car or a van". Without this they were flattened
      // into "Something went wrong", which tells them nothing about what to do.
      P0001: 409,
    };
    const status = map[error.code ?? ""] ?? 500;
    if (status === 500) console.error("driver action failed", { action: input.action, error });
    return NextResponse.json(
      { error: status === 500 ? "Something went wrong. Try again." : error.message },
      { status },
    );
  }

  // The customer is waiting on exactly this. Awaited rather than fired and
  // forgotten: a serverless function that has returned can be frozen mid-flight,
  // and notifyCustomerOfQuote never throws.
  if (input.action === "quote" && typeof data === "string") {
    await notifyCustomerOfQuote(data);
  }

  return NextResponse.json(data);
}
