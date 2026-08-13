import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { pushIsConfigured, pushToDriverEndpoints } from "@/lib/push/send";

// The owner's own push subscription, and a test send.
//
// This exists because web push was verifiably working and completely
// unreachable: every "Turn on" button lived behind being a signed-in customer
// or an approved driver, and there were zero of both. The one person who needed
// to verify the feature had no route to it.
//
// Auth is the ADMIN_PASSWORD cookie, checked here. The RPCs are service-role
// only, so reaching them proves that check ran.

function guard(req: NextRequest): NextResponse | null {
  if (!verifySession(req.cookies.get(COOKIE_NAME)?.value)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasServiceRole()) {
    return NextResponse.json({ error: "Admin backend is not configured." }, { status: 503 });
  }
  if (!pushIsConfigured()) {
    return NextResponse.json({ error: "VAPID keys are not set on this deployment." }, { status: 503 });
  }
  return null;
}

const subscribeSchema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({ p256dh: z.string().min(1).max(500), auth: z.string().min(1).max(500) }),
});

/** How many of the owner's devices are currently subscribed. */
export async function GET(req: NextRequest) {
  const denied = guard(req);
  if (denied) return denied;
  const admin = await getPrivileged();
  const { data } = await admin.rpc("admin_push_targets");
  return NextResponse.json({ devices: ((data ?? []) as unknown[]).length });
}

export async function POST(req: NextRequest) {
  const denied = guard(req);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = subscribeSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid subscription." }, { status: 400 });

  const admin = await getPrivileged();
  const { data, error } = await admin.rpc("register_admin_push", {
    p_endpoint: parsed.data.endpoint,
    p_p256dh: parsed.data.keys.p256dh,
    p_auth: parsed.data.keys.auth,
    p_user_agent: req.headers.get("user-agent") ?? null,
  });
  if (error || data !== true) {
    console.error("register_admin_push failed", error);
    return NextResponse.json({ error: "Could not turn alerts on." }, { status: 500 });
  }

  // ── Confirm it on the spot (M98) ─────────────────────────────────────────
  //
  // Asked for directly: "the web push should send a msg after I authorise
  // notification so that it confirms that it works."
  //
  // He is right, and it is the difference between a switch and a promise.
  // Allowing the permission proved the BROWSER agreed; it proved nothing about
  // VAPID signing, the service worker, or whether the operating system will
  // actually draw anything. Sending one immediately closes all of that while
  // the person is still looking at the screen — and if it never appears, they
  // learn now rather than the first time it mattered.
  //
  // Straight to the endpoint just registered, not a broadcast: turning alerts
  // on for a new phone must not buzz every other device the owner owns.
  let confirmed = 0;
  try {
    const { pushToDriverEndpoints } = await import("@/lib/push/send");
    confirmed = await pushToDriverEndpoints(
      [{ endpoint: parsed.data.endpoint, p256dh: parsed.data.keys.p256dh, auth: parsed.data.keys.auth }],
      {
        title: "Alerts are on 🎉",
        body: "This device will now receive Roulé Rodrigues alerts.",
        url: "/admin",
        tag: "rr-alerts-on",
      },
    );
  } catch (e) {
    // Registration already succeeded; a failed confirmation must not undo it.
    console.error("admin push welcome failed", e);
  }

  return NextResponse.json({ ok: true, confirmed: confirmed > 0 });
}

/**
 * Send a real push to every device the owner has enabled. Not a simulation — it
 * goes through the same sender, the same VAPID signing and the same service
 * worker as a live alert, so a success here proves the whole chain.
 */
export async function PUT(req: NextRequest) {
  const denied = guard(req);
  if (denied) return denied;

  const admin = await getPrivileged();
  const { data, error } = await admin.rpc("admin_push_targets");
  if (error) {
    console.error("admin_push_targets failed", error);
    return NextResponse.json({ error: "Could not read your devices." }, { status: 500 });
  }

  const targets = (data ?? []) as { endpoint: string; p256dh: string; auth: string }[];
  if (targets.length === 0) {
    return NextResponse.json(
      { error: "No device is subscribed yet. Turn alerts on first." },
      { status: 400 },
    );
  }

  const sent = await pushToDriverEndpoints(targets, {
    title: "Roulé Rodrigues",
    body: "Web push is working. This is a test notification.",
    url: "/admin/operations",
    tag: "admin:test",
    urgent: false,
  });

  // A dead subscription is pruned by the sender, so 0-of-1 means the browser
  // threw the subscription away — report that rather than a bland failure.
  return NextResponse.json({ ok: sent > 0, sent, devices: targets.length });
}

export async function DELETE(req: NextRequest) {
  const denied = guard(req);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = z.object({ endpoint: z.string().url().max(2000) }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const admin = await getPrivileged();
  await admin.rpc("unregister_admin_push", { p_endpoint: parsed.data.endpoint });
  return NextResponse.json({ ok: true });
}
