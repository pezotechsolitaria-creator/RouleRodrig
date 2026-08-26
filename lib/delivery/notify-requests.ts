import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { pushToDriverEndpoints, pushToCustomer, pushToDriver, type Target } from "@/lib/push/send";
import { sendWhatsApp } from "@/lib/notifications/whatsapp";
import { enqueueNotification, formatWhatsAppMessage } from "@/lib/notifications/queue";
import {
  newRequestTitle,
  newRequestLines,
  newRequestAction,
  quoteArrivedTitle,
  quoteArrivedLines,
  quoteArrivedAction,
  quoteAcceptedTitle,
  quoteAcceptedLines,
  quoteAcceptedAction,
  cancelledTitle,
  cancelledLines,
  type RequestFacts,
} from "@/lib/delivery/request-copy";

// ── Making the Deliver Anything loop audible ────────────────────────────────
//
// The twin of lib/delivery/notify.ts, for the half of the system that has no
// delivery row yet. Every lookup there is keyed by delivery_id and the whole
// notifiable window of a quote marketplace happens BEFORE a delivery exists, so
// none of them can be reused — M137 added the request-keyed ones this uses.
//
// NOTHING HERE THROWS. Every caller sits on a path that has already committed:
// the request is filed, the quote is written, the driver is booked. A
// notification failure must never undo any of that, and a caller that has to
// remember to wrap this in a try/catch is a caller that will forget.

type WaTarget = { phone: string | null; api_key: string | null; driver_name: string | null };

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T[]> {
  if (!hasServiceRole()) return [];
  try {
    const admin = await getPrivileged();
    const { data, error } = await admin.rpc(name, args);
    if (error) {
      console.error("request notify lookup failed", { name, error });
      return [];
    }
    return (data ?? []) as T[];
  } catch (err) {
    console.error("request notify lookup threw", { name, err });
    return [];
  }
}

async function facts<T>(name: string, args: Record<string, unknown>): Promise<T | null> {
  if (!hasServiceRole()) return null;
  try {
    const admin = await getPrivileged();
    const { data, error } = await admin.rpc(name, args);
    if (error) {
      console.error("request notify facts failed", { name, error });
      return null;
    }
    return (data ?? null) as T | null;
  } catch (err) {
    console.error("request notify facts threw", { name, err });
    return null;
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

type Facts = RequestFacts & {
  contactPhone: string | null;
  customerId: string | null;
  guestEmail: string | null;
  status: string;
  expiresAt: string | null;
  quoteCount: number;
};

type QuoteFacts = {
  quoteId: string;
  fee: number;
  note: string | null;
  status: string;
  driverId: string;
  driverName: string;
  driverPhone: string | null;
  vehicleType: string | null;
  request: Facts;
  deliveryId: string | null;
  pin: string | null;
};

/** Where a customer goes to see their prices. Relative on purpose for push —
 *  it resolves against whatever origin the PWA was installed from. */
function customerPath(requestId: string): string {
  return `/deliver/${requestId}`;
}

// ── 1. A job is on the board ────────────────────────────────────────────────

/**
 * Tell every eligible driver that a job they could quote on has appeared.
 *
 * Push AND WhatsApp, for the reason the rest of this system uses both: push
 * dies with the browser — cleared data, an iPhone never added to the Home
 * Screen, a permission declined once and unaskable afterwards — and WhatsApp
 * does not. A driver who loses one still gets the job.
 */
export async function notifyDriversOfNewRequest(requestId: string): Promise<void> {
  const f = await facts<Facts>("delivery_request_facts", { p_request_id: requestId });
  if (!f) return;

  const title = newRequestTitle(f);
  const lines = newRequestLines(f);
  const [pushTargets, waTargets] = await Promise.all([
    rpc<Target>("request_push_targets", { p_request_id: requestId }),
    rpc<WaTarget>("request_whatsapp_targets", { p_request_id: requestId }),
  ]);

  await Promise.allSettled([
    pushToDriverEndpoints(pushTargets, {
      title,
      body: lines.slice(0, 3).join(" · "),
      url: "/driver",
      // One tag per REQUEST, so a re-notify replaces the old card rather than
      // stacking a second one for the same job.
      tag: `delivery-request-${requestId}`,
      urgent: true,
    }),
    whatsappFan(
      waTargets,
      formatWhatsAppMessage({ title, lines, action: newRequestAction("/driver") }),
    ),
  ]);

  // The owner's board, so a request that reaches no driver is visible to
  // somebody. dedupeKey is the request id: a retried POST cannot produce a
  // second alert.
  await enqueueNotification({
    type: "delivery.request_posted",
    category: "deliveries",
    message: formatWhatsAppMessage({
      title: `${title} (${pushTargets.length} push, ${waTargets.length} WhatsApp)`,
      lines,
    }),
    dedupeKey: `delivery.request_posted:${requestId}`,
    payload: {
      requestId,
      kind: f.kind,
      sizeClass: f.sizeClass,
      pushTargets: pushTargets.length,
      whatsappTargets: waTargets.length,
    },
  });
}

// ── 2. A price has arrived ──────────────────────────────────────────────────

/**
 * Tell the customer that a driver has quoted.
 *
 * The one message in this flow whose audience is the customer, and the one that
 * has to carry "nobody is on the way until you choose" — see request-copy.ts,
 * where that sentence is unconditional and pinned by a test.
 *
 * A guest has no push subscription and no account, so for them this is an
 * owner-board alert plus whatever channel the owner runs. Wiring guest email
 * here would spend the shared Supabase mail budget on every quote in a bidding
 * war, which is how password resets stop arriving (M41).
 */
export async function notifyCustomerOfQuote(quoteId: string): Promise<void> {
  const q = await facts<QuoteFacts>("delivery_quote_facts", { p_quote_id: quoteId });
  if (!q?.request) return;

  const title = quoteArrivedTitle({ fee: q.fee, quoteCount: q.request.quoteCount });
  const lines = quoteArrivedLines({
    fee: q.fee,
    driverName: q.driverName,
    vehicleType: q.vehicleType,
    note: q.note,
    what: q.request.what,
    quoteCount: q.request.quoteCount,
  });

  await Promise.allSettled([
    pushToCustomer(
      { email: q.request.guestEmail, userId: q.request.customerId },
      {
        title,
        body: lines.at(-1) as string,
        url: customerPath(q.request.id),
        // Per REQUEST, not per quote: five drivers quoting should leave one
        // card on the lock screen saying there are five prices, not five cards.
        tag: `delivery-quotes-${q.request.id}`,
        urgent: true,
      },
    ),
    enqueueNotification({
      type: "delivery.quote_offered",
      category: "deliveries",
      message: formatWhatsAppMessage({
        title,
        lines,
        action: quoteArrivedAction(customerPath(q.request.id)),
      }),
      dedupeKey: `delivery.quote_offered:${quoteId}`,
      payload: {
        requestId: q.request.id,
        quoteId,
        fee: q.fee,
        driverId: q.driverId,
        quoteCount: q.request.quoteCount,
      },
    }),
  ]);
}

// ── 3. A driver has been chosen ─────────────────────────────────────────────

/**
 * Tell the driver their price won and the job is theirs.
 *
 * Awaited by its caller rather than fired and forgotten: a serverless function
 * that has returned can be frozen mid-flight, and a driver who is never told
 * they won is the exact silent failure this whole flow exists to end.
 */
export async function notifyQuoteAccepted(quoteId: string): Promise<void> {
  const q = await facts<QuoteFacts>("delivery_quote_facts", { p_quote_id: quoteId });
  if (!q?.request) return;

  const title = quoteAcceptedTitle({ fee: q.fee });
  const lines = quoteAcceptedLines({
    fee: q.fee,
    request: q.request,
    contactPhone: q.request.contactPhone,
    pin: q.pin,
  });

  const waTargets = await rpc<WaTarget>("driver_whatsapp_target_for_driver", {
    p_driver_id: q.driverId,
  });

  await Promise.allSettled([
    pushToDriver(q.driverId, {
      title,
      body: lines.slice(0, 3).join(" · "),
      url: "/driver",
      tag: `delivery-won-${q.request.id}`,
      urgent: true,
    }),
    whatsappFan(
      waTargets,
      formatWhatsAppMessage({ title, lines, action: quoteAcceptedAction("/driver") }),
    ),
    // The customer's own confirmation, so the screen is not the only place the
    // booking exists.
    pushToCustomer(
      { email: q.request.guestEmail, userId: q.request.customerId },
      {
        title: `${q.driverName} is booked`,
        body: `They will collect from ${q.request.pickupText} and bring it to ${q.request.dropoffText}.`,
        url: customerPath(q.request.id),
        tag: `delivery-quotes-${q.request.id}`,
      },
    ),
    enqueueNotification({
      type: "delivery.quote_accepted",
      category: "deliveries",
      message: formatWhatsAppMessage({ title, lines }),
      dedupeKey: `delivery.quote_accepted:${quoteId}`,
      payload: {
        requestId: q.request.id,
        quoteId,
        deliveryId: q.deliveryId,
        driverId: q.driverId,
        fee: q.fee,
      },
    }),
  ]);
}

// ── 4. The customer changed their mind ──────────────────────────────────────

type CancelFacts = {
  requestId: string;
  what: string;
  pickupText: string;
  dropoffText: string;
  contactName: string | null;
  cancelReason: string | null;
  deliveryId: string | null;
  driverId: string | null;
  driverName: string | null;
  fee: number | null;
};

/**
 * Tell the driver their booked job is off.
 *
 * The most time-critical message in the whole flow: they may already be on the
 * road, and every minute they keep driving is a minute of their fuel spent on
 * a job that no longer exists. Push and WhatsApp together, no delay.
 *
 * Silently does nothing when there is no driver — a request cancelled while
 * still open has nobody to tell, and the caller should not have to know which
 * case it is in.
 */
export async function notifyDriverOfCancellation(requestId: string): Promise<void> {
  const f = await facts<CancelFacts>("delivery_cancel_facts", { p_request_id: requestId });
  if (!f?.driverId) return;

  const title = cancelledTitle({ what: f.what });
  const lines = cancelledLines({
    pickupText: f.pickupText,
    dropoffText: f.dropoffText,
    contactName: f.contactName,
    reason: f.cancelReason,
  });

  const waTargets = await rpc<WaTarget>("driver_whatsapp_target_for_driver", {
    p_driver_id: f.driverId,
  });

  await Promise.allSettled([
    pushToDriver(f.driverId, {
      title,
      body: lines[0],
      url: "/driver",
      // Replaces the "you won" card for the same job rather than stacking a
      // second one beside it, so the lock screen cannot show both at once.
      tag: `delivery-won-${f.requestId}`,
      urgent: true,
    }),
    whatsappFan(waTargets, formatWhatsAppMessage({ title, lines })),
    enqueueNotification({
      type: "delivery.cancelled_by_customer",
      category: "deliveries",
      message: formatWhatsAppMessage({ title, lines }),
      dedupeKey: `delivery.cancelled_by_customer:${f.deliveryId ?? requestId}`,
      payload: {
        requestId: f.requestId,
        deliveryId: f.deliveryId,
        driverId: f.driverId,
        fee: f.fee,
      },
    }),
  ]);
}
