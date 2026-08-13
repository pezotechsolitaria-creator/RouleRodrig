import { NextRequest, NextResponse } from "next/server";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { pushToAdmins, pushIsConfigured } from "@/lib/push/send";

// ── Prove push works, in one tap (M97) ─────────────────────────────────────
//
// "I do not receive notifications" is the hardest kind of bug report to act on,
// because six different things must all be true and NONE of them is visible:
//
//   1. the server holds a VAPID key pair
//   2. this device registered a subscription
//   3. that subscription is still alive at the browser vendor
//   4. something actually called push
//   5. the service worker handled the push event
//   6. the operating system was willing to show it
//
// Every one of those fails silently, and until now the only way to test the
// chain was to make a real booking and hope. So this sends a real push, to his
// own registered devices, on demand — and reports which of the above is false
// rather than "it didn't work".
//
// Diagnostics only: it changes no business data and sends nothing to a
// customer, so it is safe to press repeatedly while fixing a phone.
export async function POST(req: NextRequest) {
  if (!verifySession(req.cookies.get(COOKIE_NAME)?.value)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 1. Is the server able to sign a push at all?
  if (!pushIsConfigured()) {
    return NextResponse.json({
      ok: false,
      stage: "server",
      message:
        "This site has no VAPID key pair, so no push can ever be sent. Set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and NEXT_PUBLIC_VAPID_PUBLIC_KEY in Vercel, then redeploy.",
    });
  }

  if (!hasServiceRole()) {
    return NextResponse.json({ ok: false, stage: "server", message: "Service role key missing." });
  }

  // 2. Has any device registered for the admin?
  const supabase = await getPrivileged();
  const { count } = await supabase
    .from("push_subscriptions")
    .select("endpoint", { count: "exact", head: true })
    .eq("contact_email", "admin@roulerodrig.internal");

  if (!count) {
    return NextResponse.json({
      ok: false,
      stage: "device",
      message:
        "No device is registered for admin on this site. Open /admin on the phone or computer you want alerts on, allow notifications, then press this again.",
    });
  }

  // 3. Actually send one, and report how many endpoints accepted it.
  const sent = await pushToAdmins({
    title: "Roulé Rodrigues — test alert",
    body: "If you can read this, push notifications are working on this device.",
    url: "/admin",
    tag: "rr-push-test",
  });

  if (sent === 0) {
    return NextResponse.json({
      ok: false,
      stage: "delivery",
      registered: count,
      message:
        `${count} device(s) are registered but the push service rejected every one. They are usually stale — clear notifications for this site in the browser, allow them again, then retry.`,
    });
  }

  return NextResponse.json({
    ok: true,
    stage: "sent",
    registered: count,
    sent,
    message:
      `Sent to ${sent} of ${count} registered device(s). If nothing appears within a few seconds, the browser accepted it but the operating system suppressed it — check Do Not Disturb, Focus, or notification settings for your browser.`,
  });
}
