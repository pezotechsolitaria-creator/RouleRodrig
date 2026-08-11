import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { guard } from "@/lib/rate-limit";
import { pushIsConfigured } from "@/lib/push/send";

// Register or drop this device's push subscription. Both actions go through an
// RPC (M52) rather than a direct write, because re-homing an endpoint from one
// account to another is something RLS cannot express — see the migration.

const NOT_SIGNED_IN = "RR001";
const INCOMPLETE = "RR002";

const subscribeSchema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({
    p256dh: z.string().min(1).max(500),
    auth: z.string().min(1).max(500),
  }),
});

const unsubscribeSchema = z.object({ endpoint: z.string().url().max(2000) });

export async function POST(req: NextRequest) {
  const limited = guard(req, "driver-push", 20, 60_000);
  if (limited) return limited;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  // Registering against a server that cannot send is a silent dead end — the
  // driver would see "Alerts on" and never hear a thing.
  if (!pushIsConfigured()) {
    return NextResponse.json(
      { error: "Alerts are not switched on for this site yet." },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = subscribeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid subscription." }, { status: 400 });
  }

  const { error } = await supabase.rpc("register_push_subscription", {
    p_endpoint: parsed.data.endpoint,
    p_p256dh: parsed.data.keys.p256dh,
    p_auth: parsed.data.keys.auth,
    p_user_agent: req.headers.get("user-agent") ?? null,
  });

  if (error) {
    if (error.code === NOT_SIGNED_IN) return NextResponse.json({ error: error.message }, { status: 401 });
    if (error.code === INCOMPLETE) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("register_push_subscription failed", error);
    return NextResponse.json({ error: "Could not turn alerts on." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
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
  const parsed = unsubscribeSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const { error } = await supabase.rpc("unregister_push_subscription", {
    p_endpoint: parsed.data.endpoint,
  });
  if (error) {
    console.error("unregister_push_subscription failed", error);
    return NextResponse.json({ error: "Could not turn alerts off." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
