import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { guard } from "@/lib/rate-limit";
import { pushIsConfigured } from "@/lib/push/send";

// A customer subscribing their phone to updates about their own order.
//
// The credential is the order plus the email it was placed under — the same
// proof /orders/track already demands — because the default checkout here is a
// guest with no account. Authorisation lives in the RPC (M63); without that
// check anyone could point their own device at a stranger's email and receive
// that stranger's order updates.

const schema = z.object({
  orderId: z.string().uuid(),
  email: z.string().trim().email().max(200).optional(),
  endpoint: z.string().url().max(2000),
  keys: z.object({
    p256dh: z.string().min(1).max(500),
    auth: z.string().min(1).max(500),
  }),
});

export async function POST(req: NextRequest) {
  const limited = guard(req, "order-push", 20, 60_000);
  if (limited) return limited;

  // Subscribing against a server that cannot send is a silent dead end.
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
  const { data, error } = await supabase.rpc("register_customer_push", {
    p_endpoint: parsed.data.endpoint,
    p_p256dh: parsed.data.keys.p256dh,
    p_auth: parsed.data.keys.auth,
    p_order_id: parsed.data.orderId,
    p_email: parsed.data.email ?? null,
    p_user_agent: req.headers.get("user-agent") ?? null,
  });

  if (error) {
    console.error("register_customer_push failed", error);
    return NextResponse.json({ error: "Could not turn alerts on." }, { status: 500 });
  }
  // The RPC returns false when the caller could not prove the order is theirs.
  // Deliberately the same shape as a genuine failure: it must not become an
  // oracle for which email placed which order.
  if (data !== true) {
    return NextResponse.json({ error: "Could not turn alerts on." }, { status: 403 });
  }

  return NextResponse.json({ ok: true });
}
