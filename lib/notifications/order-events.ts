import "server-only";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { dispatchNotification } from "./dispatch";
import { SITE_URL } from "@/lib/site";
import { centsToDecimalString } from "@/lib/money";

// ── Customer-facing lifecycle emails ────────────────────────────────────────
//
// The `notifications` table gets a row for every lifecycle event, but its ONLY
// reader is components/merchant/NotificationBell.tsx — mounted solely in the
// merchant layout. So every `recipient_type='customer'` row ever written has
// been invisible, and three of the four events a customer actually cares about
// reached them through no channel at all:
//
//   * acceptance          — the merchant UI toasted "The customer has been told"
//   * payment confirmed   — "tells the customer to expect it"
//   * order expired       — nothing, ever
//
// Both of those strings were false. This module makes them true. It is
// best-effort by construction and never throws: the state change has already
// committed before any of this runs, exactly like the M17 placement notice.

export type OrderCustomerEvent = "accepted" | "payment_confirmed" | "expired" | "payment_due";

/** Copy per event. Kept together so the whole customer voice is readable at once. */
function compose(event: OrderCustomerEvent, orderNumber: string, storeName: string) {
  switch (event) {
    // The only message in this file that can still change the outcome. Every
    // other one reports something already decided; this one is sent while the
    // customer can still act, which is why it is the single highest-value
    // email the marketplace sends (M21).
    case "payment_due":
      return {
        title: `Your reservation for order ${orderNumber} ends soon`,
        body:
          `Your items at ${storeName} are still reserved, but the transfer hasn't been reported yet. ` +
          `Send it and tell us — the reservation stops counting down the moment you do. ` +
          `Nothing is charged automatically, and you can still cancel by doing nothing.`,
        cta: "Pay and keep my items →",
      };
    case "accepted":
      return {
        title: `${storeName} accepted order ${orderNumber}`,
        body:
          `Good news — ${storeName} has confirmed your order and is preparing it. ` +
          `Your items are no longer on a reservation clock.`,
        cta: "Track your order →",
      };
    case "payment_confirmed":
      return {
        title: `Payment received for order ${orderNumber}`,
        body:
          `${storeName} has confirmed your payment. Nothing further is owed — ` +
          `they will let you know as soon as your order is ready.`,
        cta: "View your order →",
      };
    case "expired":
      return {
        title: `Order ${orderNumber} has expired`,
        body:
          `Your reservation with ${storeName} lapsed before it was confirmed, so the items have been ` +
          `released. You have not been charged. If you still want them, you can order again.`,
        cta: "Browse shops →",
      };
  }
}

/**
 * Emails the customer about an order lifecycle event. Never throws; returns
 * true only when a channel actually delivered.
 *
 * Addresses live behind admin.auth.admin.getUserById(), which the anon fallback
 * inside getPrivileged() cannot call — so a missing service-role key is a LOUD
 * failure rather than a silent no-op, same rule as lib/notifications/order-placed.ts.
 */
export async function notifyOrderCustomer(orderId: string, event: OrderCustomerEvent): Promise<boolean> {
  try {
    if (!hasServiceRole()) {
      console.error(
        `notifyOrderCustomer: SUPABASE_SERVICE_ROLE_KEY missing — order ${orderId} "${event}" NOT sent to the customer`,
      );
      return false;
    }
    const admin = await getPrivileged();

    const { data: order } = await admin
      .from("orders")
      .select("id, order_number, customer_id, customer_email, total, store_id, stores(name)")
      .eq("id", orderId)
      .maybeSingle();
    if (!order) {
      console.error(`notifyOrderCustomer: order ${orderId} not found`);
      return false;
    }
    const row = order as unknown as {
      order_number: string;
      customer_id: string | null;
      customer_email: string | null;
      total: number;
      stores: { name: string } | { name: string }[] | null;
    };

    const store = Array.isArray(row.stores) ? row.stores[0] : row.stores;
    const storeName = store?.name ?? "The shop";

    // GUEST ORDERS (M20). This used to `return false` whenever customer_id was
    // null, so a guest received NOTHING for acceptance, payment confirmation or
    // expiry — the three messages that matter most after placing an order.
    // orders.customer_email is populated for both paths, so prefer it and fall
    // back to the auth lookup only for pre-M20 rows that predate the column.
    let email = row.customer_email ?? null;
    if (!email && row.customer_id) {
      const { data: authUser } = await admin.auth.admin.getUserById(row.customer_id);
      email = authUser?.user?.email ?? null;
    }
    if (!email) return false;
    const isGuest = !row.customer_id;

    const copy = compose(event, row.order_number, storeName);
    return await dispatchNotification({
      recipientType: "customer",
      recipientEmail: email,
      orderNumber: row.order_number,
      type: "order_status_changed",
      title: copy.title,
      body: copy.body,
      details: [["Total", `Rs ${centsToDecimalString(row.total)}`]],
      cta: {
        // A guest cannot open /orders/[id] — it filters on customer_id =
        // auth.uid() — so they are sent to the account-free tracking page.
        url:
          event === "expired"
            ? `${SITE_URL}/shop`
            : isGuest
              ? `${SITE_URL}/orders/track?ref=${encodeURIComponent(row.order_number)}`
              : `${SITE_URL}/orders/${orderId}`,
        label: copy.cta,
      },
      channels: ["email"],
    });
  } catch (err) {
    console.error(`notifyOrderCustomer failed for order ${orderId} (${event})`, err);
    return false;
  }
}
