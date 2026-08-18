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
  // M109 — the driver moves their OWN ride. Until this existed the only route
  // to 'arrived' or 'on_trip' was admin_set_ride_status(), so the customer's
  // timeline advanced when the OWNER touched /admin — which is exactly the
  // answering-service role the ride system was built to end.
  z.object({
    action: z.literal("advance"),
    token: z.string().min(32).max(200),
    to: z.enum(["driver_on_way", "arrived", "on_trip", "completed"]),
  }),
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

  if (p.action === "advance") {
    const { data, error } = await admin.rpc("driver_advance_ride_by_token", {
      p_token: p.token, p_to: p.to,
    });
    if (error) {
      console.error("driver_advance_ride_by_token failed", error);
      return NextResponse.json({ ok: false }, { status: 500 });
    }
    // The RPC answers {ok:false,reason:...} for a bad token, a ride that is not
    // theirs, and a step that is out of order. All are 200s: a driver
    // double-tapping ARRIVED on a slow connection is the NORMAL case, and it
    // must not surface as a fault. The client re-reads and finds itself already
    // where it wanted to be.
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

    // Confirm on the spot, to the phone that just registered. Allowing the
    // permission only proved the BROWSER agreed — it says nothing about VAPID
    // signing, the service worker, or whether the phone will draw anything. A
    // driver who sees "Alerts are on" knows; one who sees a green switch is
    // only hoping, and finds out at the worst moment.
    if ((data as { ok?: boolean } | null)?.ok) {
      try {
        const { pushToDriverEndpoints } = await import("@/lib/push/send");
        await pushToDriverEndpoints(
          [{ endpoint: p.endpoint, p256dh: p.p256dh, auth: p.auth }],
          {
            title: "Alerts are on 🎉",
            body: "You'll hear about a ride even when this page is closed.",
            url: "/",
            tag: "rr-alerts-on",
          },
        );
      } catch (e) {
        console.error("driver push welcome failed", e);
      }
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
