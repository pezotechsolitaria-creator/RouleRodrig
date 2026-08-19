import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { pushToOfferedDrivers, pushToDriverEndpoints, type PushPayload } from "@/lib/push/send";
import { sendWhatsApp } from "@/lib/notifications/whatsapp";
import { enqueueNotification, formatWhatsAppMessage } from "@/lib/notifications/queue";
import { centsToDecimalString } from "@/lib/money";
import { deliveryStallAlert, type DeliveryStallKind } from "@/lib/delivery/escalation-copy";

// Everything that has to reach a human about a delivery. Two channels on
// purpose: web push dies with the browser (cleared data, an iPhone never added
// to the Home Screen, a permission declined once and unaskable thereafter),
// WhatsApp does not. A driver who loses one still gets the job.
//
// Nothing here throws. A notification that fails must never take an order down
// with it, and every caller sits on a path that has already committed.

type WaTarget = { phone: string | null; api_key: string | null; driver_name: string | null };

async function rpc<T>(name: string, args: Record<string, string>): Promise<T[]> {
  if (!hasServiceRole()) return [];
  try {
    const admin = await getPrivileged();
    const { data, error } = await admin.rpc(name, args);
    if (error) {
      console.error("delivery notify lookup failed", { name, error });
      return [];
    }
    return (data ?? []) as T[];
  } catch (err) {
    console.error("delivery notify lookup threw", { name, err });
    return [];
  }
}

async function whatsappFan(targets: WaTarget[], message: string): Promise<number> {
  const usable = targets.filter((t) => t.phone && t.api_key);
  if (usable.length === 0) return 0;
  const results = await Promise.allSettled(
    usable.map((t) =>
      sendWhatsApp({ phone: t.phone as string, apiKey: t.api_key as string, message }),
    ),
  );
  return results.filter((r) => r.status === "fulfilled" && r.value.ok).length;
}

/** Shop, pay, and the facts that decide WHERE THE PACKAGE IS.
 *
 *  == Why widening this select is safe ======================================
 *  A PostgREST select fails in several ways and only one is dangerous here:
 *  relationship resolution (an unknown or ambiguous embed), which 400s the
 *  WHOLE query and, through the bare catch below, returns null — which would
 *  also silently kill every driver offer message, since notifyOfferedDrivers
 *  bails on a null context. The embed graph is UNCHANGED: still exactly
 *  `orders` and `stores`, no new relationship. Everything added is either a
 *  plain column of deliveries or a column on an already-resolved embed. The
 *  three existing messages read only status, shop, orderNumber and pay, so
 *  adding fields cannot change them.
 */
async function context(deliveryId: string) {
  if (!hasServiceRole()) return null;
  try {
    const admin = await getPrivileged();
    const { data } = await admin
      .from("deliveries")
      .select(
        "id, status, driver_earning, driver_id, reassignment_count, created_at, pickup_due_at, delivery_due_at, order:orders(order_number), store:stores(name, phone)",
      )
      .eq("id", deliveryId)
      .maybeSingle();
    if (!data) return null;
    const row = data as {
      status: string;
      driver_earning: number | null;
      driver_id: string | null;
      reassignment_count: number | null;
      created_at: string | null;
      pickup_due_at: string | null;
      delivery_due_at: string | null;
      order: { order_number?: string | null } | { order_number?: string | null }[] | null;
      store:
        | { name?: string | null; phone?: string | null }
        | { name?: string | null; phone?: string | null }[]
        | null;
    };
    const store = Array.isArray(row.store) ? row.store[0] : row.store;
    const order = Array.isArray(row.order) ? row.order[0] : row.order;
    return {
      status: row.status,
      shop: store?.name ?? "a shop",
      shopPhone: store?.phone ?? null,
      orderNumber: order?.order_number ?? null,
      pay: row.driver_earning ? `Rs ${centsToDecimalString(row.driver_earning)}` : null,
      // The discriminator. NULL means nobody ever accepted it, so the package
      // never left the shop; set means somebody is carrying it.
      driverId: row.driver_id,
      reassignments: row.reassignment_count ?? 0,
      createdAt: row.created_at,
      pickupDueAt: row.pickup_due_at,
      deliveryDueAt: row.delivery_due_at,
    };
  } catch {
    return null;
  }
}

/** Who the driver actually is. A SEPARATE query on purpose — see context().
 *  Worst case it returns null and one message loses a name; it cannot take the
 *  offer and release messages down with it. */
async function driverContact(driverId: string | null) {
  if (!driverId || !hasServiceRole()) return null;
  try {
    const admin = await getPrivileged();
    const { data } = await admin
      .from("delivery_drivers")
      .select("full_name, phone")
      .eq("id", driverId)
      .maybeSingle();
    const row = data as { full_name?: string | null; phone?: string | null } | null;
    return row ? { name: row.full_name ?? null, phone: row.phone ?? null } : null;
  } catch {
    return null;
  }
}

/** Whole minutes since a timestamp, or null. The clock lives here rather than
 *  in the copy module — that is what keeps the copy hermetically testable. */
function minutesSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const mins = Math.floor((Date.now() - t) / 60_000);
  return mins > 0 ? mins : null;
}

/** Wake everyone holding a live offer, on both channels. */
export async function notifyOfferedDrivers(deliveryId: string): Promise<void> {
  try {
    const ctx = await context(deliveryId);
    if (!ctx || ctx.status !== "searching_driver") return;

    const payload: PushPayload = {
      // The two facts that decide whether they tap: what it pays, and from where.
      title: ctx.pay ? `New delivery — ${ctx.pay}` : "New delivery available",
      body: `Pick up from ${ctx.shop}. Open to accept before it goes to someone else.`,
      url: "/driver",
      // Per delivery, so repeated rounds replace rather than stack.
      tag: `delivery:${deliveryId}`,
      urgent: true,
    };

    const message = formatWhatsAppMessage({
      title: ctx.pay ? `New delivery — ${ctx.pay}` : "New delivery available",
      lines: [
        `Pick up from ${ctx.shop}.`,
        "Open the driver page to accept — first to accept gets it.",
        "https://roulerodrig.com/driver",
      ],
    });

    // Both channels at once: a driver reachable on either should not wait for
    // the slower one to finish.
    await Promise.allSettled([
      pushToOfferedDrivers(deliveryId, payload),
      rpc<WaTarget>("driver_whatsapp_targets", { p_delivery_id: deliveryId }).then((t) =>
        whatsappFan(t, message),
      ),
    ]);
  } catch (err) {
    console.error("notifyOfferedDrivers failed", { deliveryId, err });
  }
}

/**
 * Called when an order is marked ready. M49's trigger has already created the
 * delivery and fanned out offers inside that same transaction.
 */
export async function notifyDriversOfNewOffer(orderId: string): Promise<void> {
  try {
    if (!hasServiceRole()) return;
    const admin = await getPrivileged();
    const { data } = await admin
      .from("deliveries")
      .select("id, status")
      .eq("order_id", orderId)
      .maybeSingle();
    const row = data as { id?: string; status?: string } | null;
    // Already claimed, cancelled, or never a network delivery.
    if (!row?.id || row.status !== "searching_driver") return;
    await notifyOfferedDrivers(row.id);
  } catch (err) {
    console.error("notifyDriversOfNewOffer failed", { orderId, err });
  }
}

/**
 * The job was taken off this driver (auto-release before pickup). He is
 * probably riding toward the shop right now, so this is the most time-critical
 * message in the system — it is the only one that stops wasted effort.
 */
export async function notifyDriverReleased(deliveryId: string): Promise<void> {
  try {
    const ctx = await context(deliveryId);
    const shop = ctx?.shop ?? "the shop";
    const title = "Delivery reassigned";
    const body = `The job from ${shop} was released because it wasn't collected in time. Don't ride out for it.`;

    const [pushTargets, waTargets] = await Promise.all([
      rpc<{ endpoint: string; p256dh: string; auth: string }>("driver_push_targets_assigned", {
        p_delivery_id: deliveryId,
      }),
      rpc<WaTarget>("driver_whatsapp_target_assigned", { p_delivery_id: deliveryId }),
    ]);

    await Promise.allSettled([
      pushToDriverEndpoints(pushTargets, {
        title,
        body,
        url: "/driver",
        tag: `delivery:${deliveryId}`,
        urgent: true,
      }),
      whatsappFan(waTargets, formatWhatsAppMessage({ title, lines: [body] })),
    ]);
  } catch (err) {
    console.error("notifyDriverReleased failed", { deliveryId, err });
  }
}

/**
 * A delivery stopped moving and only a human can restart it. Routed through the
 * notification queue (not inline) because it is not time-critical to the
 * second, and the queue gives it retries and deduplication.
 *
 * `kind` comes from the sweep, which knows which loop produced the id. It is
 * optional only so the legacy path in notifySweepResult still works; when it is
 * missing the kind is read off the row itself, which gives the same answer for
 * every delivery the product can actually produce.
 */
export async function notifyOwnerDeliveryStalled(
  deliveryId: string,
  kind?: DeliveryStallKind,
): Promise<void> {
  try {
    const ctx = await context(deliveryId);
    const settled: DeliveryStallKind =
      kind ??
      (ctx?.status === "driver_unresponsive"
        ? "not_collected"
        : ctx?.driverId
          ? "package_with_driver"
          : "no_driver");

    // Nobody accepted it, so there is no driver to name and no call to make.
    const driver =
      settled === "no_driver" ? null : await driverContact(ctx?.driverId ?? null);

    const alert = deliveryStallAlert({
      kind: settled,
      deliveryId,
      reassignments: ctx?.reassignments ?? 0,
      orderNumber: ctx?.orderNumber ?? null,
      shop: ctx?.shop ?? null,
      shopPhone: ctx?.shopPhone ?? null,
      driverName: driver?.name ?? null,
      driverPhone: driver?.phone ?? null,
      minutesOverdue: minutesSince(
        settled === "package_with_driver" ? ctx?.deliveryDueAt : ctx?.pickupDueAt,
      ),
      minutesWaiting: settled === "no_driver" ? minutesSince(ctx?.createdAt) : null,
    });

    await enqueueNotification({
      type: alert.type,
      category: "deliveries",
      message: formatWhatsAppMessage({ title: alert.title, lines: alert.lines }),
      // Carries the situation AND the hand-on count, so a second alert about
      // one delivery is a second message rather than a swallowed insert. The
      // old key was the same string for both kinds and the UNIQUE index has no
      // time window, so the alert saying a driver had vanished with the goods
      // was silently discarded whenever that delivery had stranded once before.
      dedupeKey: alert.dedupeKey,
      // The driver's personal number goes in the MESSAGE only. payload is
      // rendered on the admin notifications card and kept indefinitely.
      payload: { deliveryId, kind: settled },
    });
  } catch (err) {
    console.error("notifyOwnerDeliveryStalled failed", { deliveryId, kind, err });
  }
}

/** Everything one sweep_delivery_escalations() result implies, in one place.
 *  Two callers need it — the cron and the board's "Check for stalls" button —
 *  and the second was throwing the whole payload away. */
export type SweepResult = {
  reofferedIds?: string[];
  releasedIds?: string[];
  noDriverIds?: string[];
  notCollectedIds?: string[];
  packageWithDriverIds?: string[];
  /** LEGACY (M117): the union of noDriverIds and packageWithDriverIds. */
  strandedIds?: string[];
};

export async function notifySweepResult(sweep: unknown): Promise<void> {
  const ids = (sweep ?? {}) as SweepResult;

  // SQL deploys before the app, and a rollback runs them the other way. If the
  // split keys are ABSENT we are talking to the old function: fall back to its
  // union and let each delivery's own row say which story it is.
  //
  // Absent, not falsy — `[]` is a real answer meaning "nothing stalled", and
  // treating it as "old function" would double-send every alert.
  const split =
    ids.noDriverIds !== undefined ||
    ids.notCollectedIds !== undefined ||
    ids.packageWithDriverIds !== undefined;

  const owner: { id: string; kind?: DeliveryStallKind }[] = split
    ? [
        ...(ids.noDriverIds ?? []).map((id) => ({ id, kind: "no_driver" as const })),
        ...(ids.notCollectedIds ?? []).map((id) => ({ id, kind: "not_collected" as const })),
        ...(ids.packageWithDriverIds ?? []).map((id) => ({ id, kind: "package_with_driver" as const })),
      ]
    : (ids.strandedIds ?? []).map((id) => ({ id }));

  await Promise.allSettled([
    // The sweep hands back ids because SQL cannot reach a phone. Without this
    // every round after the first was mute: offer rows appeared, no driver was
    // told, and a driver who came online mid-search learned nothing.
    ...(ids.reofferedIds ?? []).map((id) => notifyOfferedDrivers(id)),
    // A driver riding toward a shop for a job he no longer holds is the most
    // expensive silence in the system.
    ...(ids.releasedIds ?? []).map((id) => notifyDriverReleased(id)),
    ...owner.map((o) => notifyOwnerDeliveryStalled(o.id, o.kind)),
  ]);
}
