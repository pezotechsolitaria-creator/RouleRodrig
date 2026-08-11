import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { pushToOfferedDrivers, pushToDriverEndpoints, type PushPayload } from "@/lib/push/send";
import { sendWhatsApp } from "@/lib/notifications/whatsapp";
import { enqueueNotification, formatWhatsAppMessage } from "@/lib/notifications/queue";
import { centsToDecimalString } from "@/lib/money";

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

/** Shop name and driver pay for a delivery, for message copy. */
async function context(deliveryId: string) {
  if (!hasServiceRole()) return null;
  try {
    const admin = await getPrivileged();
    const { data } = await admin
      .from("deliveries")
      .select("id, status, driver_earning, order:orders(order_number), store:stores(name)")
      .eq("id", deliveryId)
      .maybeSingle();
    if (!data) return null;
    const row = data as {
      status: string;
      driver_earning: number | null;
      order: { order_number?: string | null } | { order_number?: string | null }[] | null;
      store: { name?: string | null } | { name?: string | null }[] | null;
    };
    const store = Array.isArray(row.store) ? row.store[0] : row.store;
    const order = Array.isArray(row.order) ? row.order[0] : row.order;
    return {
      status: row.status,
      shop: store?.name ?? "a shop",
      orderNumber: order?.order_number ?? null,
      pay: row.driver_earning ? `Rs ${centsToDecimalString(row.driver_earning)}` : null,
    };
  } catch {
    return null;
  }
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
 * Nobody took it and the search gave up. This is an owner problem, not a driver
 * one — there is a customer waiting on an order with no way to arrive. Routed
 * through the notification queue (not inline) because it is not time-critical
 * to the second, and the queue gives it retries and deduplication.
 */
export async function notifyOwnerNoDriver(deliveryId: string): Promise<void> {
  try {
    const ctx = await context(deliveryId);
    const ref = ctx?.orderNumber ? `Order ${ctx.orderNumber}` : "A delivery";
    await enqueueNotification({
      type: "delivery_no_driver",
      category: "deliveries",
      message: formatWhatsAppMessage({
        title: "No driver found",
        lines: [
          `${ref} from ${ctx?.shop ?? "a shop"} found no driver.`,
          "The customer is waiting. Assign someone or call them.",
          "https://roulerodrig.com/admin/deliveries",
        ],
      }),
      // One alert per stranded delivery, however many times the sweep runs.
      dedupeKey: `delivery:no-driver:${deliveryId}`,
      payload: { deliveryId },
    });
  } catch (err) {
    console.error("notifyOwnerNoDriver failed", { deliveryId, err });
  }
}
