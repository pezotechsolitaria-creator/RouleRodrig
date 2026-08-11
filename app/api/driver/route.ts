import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { guard } from "@/lib/rate-limit";

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
  // An empty key means "turn WhatsApp alerts off" — the RPC deletes rather than
  // storing a blank that would later read as configured.
  z.object({
    action: z.literal("whatsapp"),
    apiKey: z.string().trim().max(200),
    phone: z.string().trim().max(30).optional(),
  }),
  z.object({
    action: z.literal("cannot_complete"),
    deliveryId: z.string().uuid(),
    reason: z.enum(["vehicle", "illness", "weather", "access", "merchant", "customer", "other"]),
    note: z.string().trim().max(500).optional(),
  }),
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
  const { data: hasWhatsapp } = await supabase.rpc("driver_whatsapp_configured");

  return NextResponse.json({
    isDriver: true,
    ...(data as object),
    whatsappConfigured: Boolean(hasWhatsapp),
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

  const call =
    input.action === "online"
      ? supabase.rpc("set_driver_availability", { p_online: input.online })
      : input.action === "accept"
        ? supabase.rpc("accept_delivery", { p_delivery_id: input.deliveryId })
        : input.action === "advance"
          ? supabase.rpc("advance_delivery", { p_delivery_id: input.deliveryId, p_to: input.to })
          : input.action === "complete"
            ? supabase.rpc("complete_delivery_with_pin", { p_delivery_id: input.deliveryId, p_pin: input.pin })
            : input.action === "whatsapp"
              ? supabase.rpc("set_driver_whatsapp", {
                  p_api_key: input.apiKey,
                  p_phone: input.phone ?? null,
                })
              : supabase.rpc("driver_cannot_complete", {
                p_delivery_id: input.deliveryId,
                p_reason: input.reason,
                p_note: input.note ?? null,
              });

  const { data, error } = await call;

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
    };
    const status = map[error.code ?? ""] ?? 500;
    if (status === 500) console.error("driver action failed", { action: input.action, error });
    return NextResponse.json(
      { error: status === 500 ? "Something went wrong. Try again." : error.message },
      { status },
    );
  }

  return NextResponse.json(data);
}
