import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { guard } from "@/lib/rate-limit";

// ── THE TAXI DRIVER'S ONE ENDPOINT ──────────────────────────────────────────
//
// Everything their permanent link can do: read their own status, go on or off
// duty, and subscribe this phone to push. Nothing else — no ride list, no other
// driver, no customer they have not been assigned.
//
// The token is the credential, because these drivers have no account by the
// owner's decision. Unlike an OFFER token it does not expire and is not spent:
// it is an identity, so the two protections that matter are that it grants very
// little and that it cannot be ground out by guessing. Hence the rate limits.

export const dynamic = "force-dynamic";

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("availability"),
    token: z.string().min(32).max(200),
    state: z.enum(["available", "off"]),
  }),
  z.object({
    action: z.literal("subscribe"),
    token: z.string().min(32).max(200),
    endpoint: z.string().url().max(600),
    p256dh: z.string().min(10).max(300),
    auth: z.string().min(4).max(300),
    userAgent: z.string().max(300).optional(),
  }),
  z.object({
    action: z.literal("unsubscribe"),
    endpoint: z.string().url().max(600),
  }),
  // M92 — "nobody came". The driver is the only person who knows, and until
  // now they had no way to say it: the ride sat in 'arrived' until an admin
  // cancelled it, which recorded the loss against the driver rather than the
  // passenger who caused it.
  z.object({
    action: z.literal("noShow"),
    token: z.string().min(32).max(200),
    note: z.string().trim().max(300).optional(),
  }),
]);

export async function GET(req: NextRequest) {
  const limited = guard(req, "driver-home-read", 40, 60_000);
  if (limited) return limited;
  if (!hasServiceRole()) return NextResponse.json({ ok: false }, { status: 503 });

  const token = new URL(req.url).searchParams.get("t") ?? "";
  if (token.length < 32) return NextResponse.json({ ok: false }, { status: 400 });

  const admin = await getPrivileged();
  const { data, error } = await admin.rpc("taxi_driver_home", { p_token: token });
  if (error) {
    console.error("taxi_driver_home failed", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  // Tighter than the read: this one changes whether they get offered work.
  const limited = guard(req, "driver-home-write", 20, 60_000);
  if (limited) return limited;
  if (!hasServiceRole()) return NextResponse.json({ ok: false }, { status: 503 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });
  const p = parsed.data;

  const admin = await getPrivileged();

  if (p.action === "availability") {
    const { data, error } = await admin.rpc("set_taxi_availability_by_token", {
      p_token: p.token, p_state: p.state,
    });
    if (error) {
      console.error("set_taxi_availability_by_token failed", error);
      return NextResponse.json({ ok: false }, { status: 500 });
    }
    return NextResponse.json(data);
  }

  if (p.action === "noShow") {
    const { data, error } = await admin.rpc("report_ride_no_show_by_token", {
      p_token: p.token,
      p_note: p.note ?? null,
    });
    if (error) {
      // RR090 covers both "not your token" and "no ride to report", on
      // purpose — neither answer should tell a stranger holding a guessed
      // token whether it is real.
      if (error.code === "RR090") {
        return NextResponse.json({ ok: false, error: error.message }, { status: 404 });
      }
      console.error("report_ride_no_show_by_token failed", error);
      return NextResponse.json({ ok: false }, { status: 500 });
    }
    return NextResponse.json(data);
  }

  if (p.action === "subscribe") {
    const { data, error } = await admin.rpc("register_taxi_push", {
      p_token: p.token, p_endpoint: p.endpoint,
      p_p256dh: p.p256dh, p_auth: p.auth, p_user_agent: p.userAgent ?? null,
    });
    if (error) {
      console.error("register_taxi_push failed", error);
      return NextResponse.json({ ok: false }, { status: 500 });
    }
    return NextResponse.json(data);
  }

  // unsubscribe — no token needed. Knowing the endpoint IS knowing the device,
  // and the only thing this can do is stop that device being messaged. Refusing
  // somebody the ability to turn notifications off would be the worse failure.
  const { data, error } = await admin.rpc("unregister_taxi_push", { p_endpoint: p.endpoint });
  if (error) {
    console.error("unregister_taxi_push failed", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  return NextResponse.json(data);
}
