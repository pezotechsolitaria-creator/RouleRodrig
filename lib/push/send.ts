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

  // 404/410: the row is worthless, delete it. Anything else — a 500 from the
  // push service, a rejected VAPID key, a timeout — may recover, so it counts
  // against fail_count instead. Until M130 nothing raised that column at all,
  // so the `fail_count < 5` guard in all four target functions had never
  // excluded a single endpoint.
  const dead: string[] = [];
  const failing: string[] = [];
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
        else failing.push(t.endpoint);
        throw err;
      }),
    ),
  );

  if (dead.length > 0 || failing.length > 0) {
    try {
      const admin = await getPrivileged();
      // Through the RPCs rather than a table write, because a push endpoint can
      // live in EITHER push_subscriptions or taxi_push_subscriptions and this
      // function does not know which — it just has a list of targets. It used
      // to delete from push_subscriptions alone, so a dead TAXI endpoint was
      // pruned from a table it had never been in and was re-attempted on every
      // ride offer for ever. The endpoint is a globally unique URL, so one call
      // safely covers both.
      if (dead.length > 0) await admin.rpc("record_push_gone", { p_endpoints: dead });
      if (failing.length > 0) await admin.rpc("record_push_failures", { p_endpoints: failing });
    } catch (err) {
      console.error("could not record dead or failing push subscriptions", err);
    }
  }

  const sent = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.length - sent;
  if (failed > 0) {
    console.error(
      "push: %d of %d failed (%d pruned, %d marked failing)",
      failed, results.length, dead.length, failing.length,
    );
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

/**
 * Wake the organisers of an event — a ticket sold, a payment confirmed.
 *
 * Keyed by STORE like the merchant one, but it cannot BE the merchant one:
 * organisers hold scoped accounts (M43) and reach their events through an
 * assignment to the platform merchant's store (M40), deliberately never
 * becoming merchants. merchant_push_targets walks merchant_staff and an
 * organiser is not staff, so it would find nobody and report success.
 */
export async function pushToOrganizer(storeId: string, payload: PushPayload): Promise<number> {
  if (!storeId) return 0;
  const targets = await targetsFrom("organizer_push_targets", { p_store_id: storeId });
  return deliver(targets, payload);
}

/** Wake one specific driver — reassignment, cancellation, an admin nudge. */
export async function pushToDriver(driverId: string, payload: PushPayload): Promise<number> {
  const targets = await targetsFrom("driver_push_targets_for_driver", { p_driver_id: driverId });
  return deliver(targets, payload);
}
