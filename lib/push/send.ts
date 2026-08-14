import webpush from "web-push";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";

// Web push, used to tell a driver a job exists. Everything here is written to
// fail quietly: a notification that does not arrive must never take an order
// down with it. Callers get a count, not an exception.

export type PushPayload = {
  title: string;
  body: string;
  // Where tapping the notification lands. Relative, so it works on whatever
  // origin the PWA was installed from.
  url?: string;
  tag?: string;
  // Marks the notification as one the user should act on now — Android keeps
  // these on screen instead of collapsing them into the tray silently.
  urgent?: boolean;
};

export type Target = { endpoint: string; p256dh: string; auth: string; driver_name?: string | null };

let configured: boolean | null = null;

// The keys live only in Vercel, exactly like the PayPal credentials, so a local
// dev run reports "not configured" instead of throwing on import.
function configure(): boolean {
  if (configured !== null) return configured;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    configured = false;
    return false;
  }
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:contact@roulerodrig.com",
    publicKey,
    privateKey,
  );
  configured = true;
  return true;
}

export function pushIsConfigured(): boolean {
  return configure();
}

// 404/410 mean the browser has thrown the subscription away — the user
// uninstalled the PWA, cleared data, or the endpoint simply expired. That row
// is dead forever, so delete it rather than retrying it every offer.
const GONE = new Set([404, 410]);

async function deliver(targets: Target[], payload: PushPayload): Promise<number> {
  if (!configure() || targets.length === 0) return 0;

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url ?? "/driver",
    tag: payload.tag,
    urgent: payload.urgent ?? false,
  });

  const dead: string[] = [];
  const results = await Promise.allSettled(
    targets.map((t) =>
      webpush.sendNotification(
        { endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } },
        body,
        // A delivery offer is worthless once the accept window closes, so it
        // expires in the push service's queue too rather than arriving late.
        { TTL: 600, urgency: payload.urgent ? "high" : "normal" },
      ).catch((err: unknown) => {
        const status = (err as { statusCode?: number })?.statusCode;
        if (status && GONE.has(status)) dead.push(t.endpoint);
        throw err;
      }),
    ),
  );

  if (dead.length > 0) {
    try {
      const admin = await getPrivileged();
      await admin.from("push_subscriptions").delete().in("endpoint", dead);
    } catch (err) {
      console.error("could not prune dead push subscriptions", err);
    }
  }

  const sent = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.length - sent;
  if (failed > 0) {
    console.error("push: %d of %d failed (%d pruned)", failed, results.length, dead.length);
  }
  return sent;
}

// Nullable on purpose: `customer_push_targets` takes a uuid that is often
// absent (a guest), and Postgres cannot cast an empty string to uuid.
async function targetsFrom(rpc: string, args: Record<string, string | null>): Promise<Target[]> {
  if (!hasServiceRole()) return [];
  const admin = await getPrivileged();
  const { data, error } = await admin.rpc(rpc, args);
  if (error) {
    console.error("push target lookup failed", { rpc, error });
    return [];
  }
  return (data ?? []) as Target[];
}

/** Push to endpoints the caller has already looked up. Returns how many phones were reached. */
export async function pushToDriverEndpoints(targets: Target[], payload: PushPayload): Promise<number> {
  return deliver(targets, payload);
}

/** Wake every driver holding a live offer on this delivery. Returns how many phones were reached. */
export async function pushToOfferedDrivers(deliveryId: string, payload: PushPayload): Promise<number> {
  const targets = await targetsFrom("driver_push_targets", { p_delivery_id: deliveryId });
  return deliver(targets, payload);
}

/**
 * Wake a customer about their own transaction. Identified by email (guests, the
 * default checkout path here) or by account, so one call covers both.
 */
export async function pushToCustomer(
  identity: { email?: string | null; userId?: string | null },
  payload: PushPayload,
): Promise<number> {
  if (!identity.email && !identity.userId) return 0;
  const targets = await targetsFrom("customer_push_targets", {
    p_email: identity.email ?? "",
    p_user_id: identity.userId ?? "",
  });
  return deliver(targets, payload);
}

/**
 * Wake the owner's own devices — the subscriptions registered from
 * /admin/operations (M68), keyed by the reserved admin address.
 *
 * This is what lets a restaurant order reach a phone WITHOUT spending email.
 * The free tier is ~400 messages a day shared with Supabase auth mail, so a
 * busy kitchen emailing every order is the fastest way to take password resets
 * down with it. Push costs nothing and arrives faster.
 */
export async function pushToAdmins(payload: PushPayload): Promise<number> {
  const targets = await targetsFrom("admin_push_targets", {});
  return deliver(targets, payload);
}

/**
 * Wake the SHOP an order belongs to — every device of every staff member.
 *
 * The audience nobody had wired (M99). The platform owner was woken for every
 * order on the island while the shop that actually has to cook it found out
 * whenever somebody next opened the dashboard. Email is the wrong fallback
 * here: the free tier is ~400 messages a day shared with Supabase auth mail, so
 * a busy kitchen emailing every order takes password resets down with it (M41).
 *
 * Keyed by STORE, not by user, so a merchant with two shops is woken for both
 * and a shop with three staff wakes all three.
 */
export async function pushToMerchant(storeId: string, payload: PushPayload): Promise<number> {
  if (!storeId) return 0;
  const targets = await targetsFrom("merchant_push_targets", { p_store_id: storeId });
  return deliver(targets, payload);
}

/** Wake one specific driver — reassignment, cancellation, an admin nudge. */
export async function pushToDriver(driverId: string, payload: PushPayload): Promise<number> {
  const targets = await targetsFrom("driver_push_targets_for_driver", { p_driver_id: driverId });
  return deliver(targets, payload);
}
