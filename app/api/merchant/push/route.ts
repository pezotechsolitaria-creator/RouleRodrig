import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { guard } from "@/lib/rate-limit";
import { pushIsConfigured } from "@/lib/push/send";

// A shop owner subscribing their phone to their own orders (M99).
//
// Authorisation lives in the RPC, not here: register_merchant_push() writes
// against auth.uid() and refuses anyone who is not staff of a store, so this
// route cannot be tricked into registering a device for somebody else's shop.
// The store is never accepted from the body for the same reason — a merchant
// with two shops is resolved at SEND time, so one subscription covers both.

const schema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({
    p256dh: z.string().min(1).max(500),
    auth: z.string().min(1).max(500),
  }),
});

export async function POST(req: NextRequest) {
  const limited = guard(req, "merchant-push", 20, 60_000);
  if (limited) return limited;

  // Subscribing against a server that cannot send is a silent dead end — the
  // switch would say "on" and nothing would ever arrive.
  if (!pushIsConfigured()) {
    return NextResponse.json({ error: "Alerts are not available yet." }, { status: 503 });
  }

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
  if (!parsed.success) return NextResponse.json({ error: "Invalid subscription." }, { status: 400 });

  const { data, error } = await supabase.rpc("register_merchant_push", {
    p_endpoint: parsed.data.endpoint,
    p_p256dh: parsed.data.keys.p256dh,
    p_auth: parsed.data.keys.auth,
    p_user_agent: req.headers.get("user-agent") ?? null,
  });

  if (error) {
    console.error("register_merchant_push failed", error);
    return NextResponse.json({ error: "Could not turn alerts on." }, { status: 500 });
  }
  if (data !== true) {
    return NextResponse.json({ error: "This account is not attached to a shop." }, { status: 403 });
  }
  return NextResponse.json({ ok: true });
}
