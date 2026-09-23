import "server-only";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { notify } from "./engine";
import type { NotificationType } from "./registry";
import { SITE_URL } from "@/lib/site";
import { centsToDecimalString } from "@/lib/money";
import type { EmailType } from "@/lib/email/types";
import { orderDocumentAttachments } from "@/lib/receipts/order-document";
import { formatSlot, parseSlotRange, slotDayWords, type SlotWindow } from "@/lib/orders/slot";
import { customerSlotLead, customerSlotPayment, slotRowLabel } from "@/lib/orders/slot-copy";
import type { PaymentProvider } from "@/lib/orders/hold";

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

/**
 * Which email type each lifecycle event routes as (M41). Payment confirmation is
 * `critical` in the registry — it is the message that tells a customer they owe
 * nothing further, and its absence produces a support call every time.
 */
/** For a merchant-typed string on its way into email HTML. */
export const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const EVENT_EMAIL_TYPE: Record<OrderCustomerEvent, EmailType> = {
  payment_due: "marketplace_payment_due",
  accepted: "marketplace_order_status",
  payment_confirmed: "marketplace_payment_confirmation",
  expired: "marketplace_order_expired",
};

/**
 * Which registry template each lifecycle event raises. Separate from
 * EVENT_EMAIL_TYPE because they answer different questions: that one routes the
 * EMAIL for quota priority, this one decides the channels, the in-app wording
 * and the push.
 */
const EVENT_NOTIFICATION_TYPE: Record<OrderCustomerEvent, NotificationType> = {
  payment_due: "order.payment_due",
  accepted: "order.accepted",
  payment_confirmed: "order.payment_confirmed",
  expired: "order.expired",
};

/** A booked order's slot, and what it takes to describe it (M216). */
export type ComposeSlot = {
  window: SlotWindow;
  fulfillment: string | null;
  provider: PaymentProvider | undefined;
};

/**
 * Copy per event. Kept together so the whole customer voice is readable at once.
 *
 * ── A BOOKED ORDER IS FOR A DAY (M216) ──────────────────────────────────────
 * With `slot`, every message names the day and time the order is booked for.
 * "Accepted … and is preparing it" is false on a Wednesday about Friday's
 * lunch — a cook can accept a pre-order days before he starts it — and "no
 * longer on a reservation clock" talks about a hold that was never the
 * deadline of a slotted order (lib/orders/hold.ts, holdIsTheDeadline).
 * Exported so the wording is tested without a database.
 */
export function compose(
  event: OrderCustomerEvent,
  orderNumber: string,
  storeName: string,
  slot: ComposeSlot | null = null,
) {
  if (slot) return composeSlotted(event, orderNumber, storeName, slot);
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

function composeSlotted(
  event: OrderCustomerEvent,
  orderNumber: string,
  storeName: string,
  { window: w, fulfillment, provider }: ComposeSlot,
) {
  // Spelled out, never "tomorrow": an email is read whenever it is read.
  const when = formatSlot(w);
  const day = slotDayWords(w.from);
  const lead = customerSlotLead(w, fulfillment, storeName);
  switch (event) {
    case "payment_due":
      return {
        title: `Order ${orderNumber} for ${day} is waiting for your transfer`,
        body:
          `Your order at ${storeName} is booked for ${when}, but the transfer hasn't been reported yet. ` +
          `Send it and tell us before then, so ${storeName} can confirm it. ` +
          `Nothing is charged automatically, and you can still cancel by doing nothing.`,
        cta: "Pay and keep my order →",
      };
    case "accepted":
      return {
        title: `${storeName} confirmed order ${orderNumber} for ${day}`,
        body:
          `Good news — ${storeName} has confirmed your order. ${lead}` +
          (provider === "cash" ? ` ${customerSlotPayment(provider, fulfillment)}` : ""),
        cta: "Track your order →",
      };
    case "payment_confirmed":
      return {
        title: `Payment received for order ${orderNumber}`,
        body: `${storeName} has confirmed your payment. Nothing further is owed. ${lead}`,
        cta: "View your order →",
      };
    case "expired":
      // expire_order() cancels a booked order that nobody started once its
      // slot is over (M181b), so the time is what this names — not a lapsed
      // "reservation" the customer was never shown.
      return {
        title: `Order ${orderNumber} was not confirmed in time`,
        body:
          `${storeName} had not confirmed your order for ${when} by then, so it was cancelled and ` +
          `nothing was charged. If you still want it, you can order again.`,
        cta: "See what’s cooking →",
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
      .select(
        "id, order_number, customer_id, customer_email, total, store_id, pickup_slot, fulfillment_method, " +
          "stores(name), payments(provider)",
      )
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
      pickup_slot: string | null;
      fulfillment_method: string | null;
      stores: { name: string } | { name: string }[] | null;
      payments: { provider: string }[] | null;
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

    // M216. Only food orders are ever booked for a slot, which is also why an
    // expired one is sent back to /food rather than the shop directory.
    const slotWindow = parseSlotRange(row.pickup_slot);
    const slot: ComposeSlot | null = slotWindow
      ? {
          window: slotWindow,
          fulfillment: row.fulfillment_method,
          provider: row.payments?.[0]?.provider as PaymentProvider | undefined,
        }
      : null;

    // The composed title and body become the email's <h1> and a paragraph()
    // of HTML (sendOrderNotificationEmail escapes neither — some callers pass
    // markup on purpose). stores.name is set by store staff, so it is escaped
    // HERE, for the email only; push and in-app get the raw name through
    // ctx.storeName below, as plain text. order-placed.ts does the same.
    const copy = compose(event, row.order_number, escapeHtml(storeName), slot);

    // MIGRATED ONTO THE ENGINE. This used to call dispatchNotification directly
    // and therefore reached email only — the customer got no in-app entry and
    // no push for the four messages that matter most after placing an order.
    //
    // The hand-written copy, the total, and the guest-aware CTA are all passed
    // through as email overrides rather than flattened into the registry's
    // one-liners: `payment_due` is the single highest-value mail the
    // marketplace sends, and a guest CANNOT open /orders/[id] (it filters on
    // customer_id = auth.uid()). The registry still decides the channels, the
    // priority and the in-app/push wording.
    const ctaUrl =
      event === "expired"
        ? `${SITE_URL}${slot ? "/food" : "/shop"}`
        : isGuest
          ? `${SITE_URL}/orders/track?ref=${encodeURIComponent(row.order_number)}`
          : `${SITE_URL}/orders/${orderId}`;

    // ── THE DOCUMENT ────────────────────────────────────────────────────
    //
    // Only for the event that means the money is in. "Accepted", "expired" and
    // "payment due" are all states in which nothing has been received, and a
    // PDF headed Receipt attached to any of them would be a written claim that
    // it had. Best-effort: it returns an empty list rather than throwing, and
    // the email goes out either way.
    const attachments =
      event === "payment_confirmed"
        ? await orderDocumentAttachments(admin, orderId, "receipt")
        : [];

    const result = await notify(
      EVENT_NOTIFICATION_TYPE[event],
      // userId drives the in-app row; a guest has none and gets push by email.
      { userId: row.customer_id ?? null, email },
      // `when` is the booked slot, for the registry's in-app and push wording.
      { ref: row.order_number, storeName, id: orderId, when: slot ? formatSlot(slot.window) : null },
      {
        // Same shape as the key this replaced, so an order mid-flight during
        // the deploy cannot be emailed twice.
        dedupeKey: `${EVENT_EMAIL_TYPE[event]}:${orderId}:${event}`,
        orderId,
        email: {
          title: copy.title,
          body: copy.body,
          details: [
            ...(slot
              ? ([[slotRowLabel(slot.fulfillment), formatSlot(slot.window)]] as [string, string][])
              : []),
            ["Total", `Rs ${centsToDecimalString(row.total)}`],
          ],
          cta: { url: ctaUrl, label: copy.cta },
          emailType: EVENT_EMAIL_TYPE[event],
          idempotencyKey: `${EVENT_EMAIL_TYPE[event]}:${orderId}:${event}`,
          attachments,
        },
      },
    );
    return result.emailed;
  } catch (err) {
    console.error(`notifyOrderCustomer failed for order ${orderId} (${event})`, err);
    return false;
  }
}
