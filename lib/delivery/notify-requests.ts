import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { pushToDriverEndpoints, pushToCustomer, pushToDriver, type Target } from "@/lib/push/send";
import { sendWhatsApp } from "@/lib/notifications/whatsapp";
import { sendGuestQuoteEmail, sendDeliveryProblemEmail } from "@/lib/email";
import { SITE_URL } from "@/lib/site";
import { formatWhatsAppMessage } from "@/lib/notifications/queue";
import {
  deliveryStalledCopy,
  deliveryClosedCopy,
  requestExpiredCopy,
  type CustomerProblemKind,
} from "@/lib/delivery/customer-copy";
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
  lostQuoteTitle,
  lostQuoteLines,
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

  // Deep-linked, not bare "/driver": the tap should land on the dashboard
  // WITH this request brought into view, not at the top of a board the
  // driver then has to search one-handed. The dashboard reads ?request=.
  const driverLink = `/driver?request=${requestId}`;

  await Promise.allSettled([
    pushToDriverEndpoints(pushTargets, {
      title,
      body: lines.slice(0, 3).join(" · "),
      url: driverLink,
      // One tag per REQUEST, so a re-notify replaces the old card rather than
      // stacking a second one for the same job.
      tag: `delivery-request-${requestId}`,
      urgent: true,
    }),
    whatsappFan(
      waTargets,
      formatWhatsAppMessage({ title, lines, action: newRequestAction(driverLink) }),
    ),
  ]);

  // ── NO OWNER ALERT WHILE THIS IS WORKING (M164) ───────────────────────────
  //
  // This used to WhatsApp the owner on every posted request. It was the single
  // noisiest line in the system: 12 of the 34 delivery alerts in a fortnight,
  // each one saying nothing more than "the marketplace did its job".
  //
  // The owner is told when it does NOT work instead. A request that reaches no
  // driver at all is escalated by sweep_delivery_escalations() and arrives as
  // an EMAIL through notifyOwnerDeliveryStalled -> sendDeliveryStallEmail.
  //
  // Deliberately not replaced with a quieter WhatsApp: a channel the owner has
  // learned to swipe away is worse than no channel, because the one message
  // that mattered gets swiped with it.
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
    Promise.resolve(/* M164: owner WhatsApp for a routine quote is silenced -- see notifyDriversOfNewRequest */),

    // ── THE GUEST'S ONLY CHANNEL (M167) ──────────────────────────────────
    //
    // A signed-in customer gets the push above. A guest has no account and no
    // subscription, so the first price on their request reached them NOWHERE:
    // it existed only on the request page, which they had to think to reopen.
    // On a surface whose whole value arrives minutes later, that is the
    // product failing quietly.
    //
    // FIRST price only, and this file has carried the reason as a standing
    // warning since it was written: a bidding war is many quotes on one
    // request, and mailing every one spends a shared sending budget that
    // password resets draw on too (M41). quoteCount includes this quote, so
    // `=== 1` is the first driver to answer.
    //
    // customerId null is what makes them a guest -- a signed-in customer with
    // an email on file must NOT get this, or they get push and mail for the
    // same event.
    q.request.guestEmail && !q.request.customerId && q.request.quoteCount === 1
      ? sendGuestQuoteEmail({
          to: q.request.guestEmail,
          // The queue's own words, unchanged, so the mail and the push cannot
          // describe one event two ways.
          title,
          lines,
          url: `${SITE_URL}${customerPath(q.request.id)}`,
          requestId: q.request.id,
        })
      : Promise.resolve(false),
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

  // The job they just won, brought into view — not the top of the dashboard.
  // deliveryId can be null for a heartbeat between accept and assignment, so
  // the bare dashboard stays the fallback.
  const wonLink = q.deliveryId ? `/driver?delivery=${q.deliveryId}` : "/driver";

  await Promise.allSettled([
    pushToDriver(q.driverId, {
      title,
      body: lines.slice(0, 3).join(" · "),
      url: wonLink,
      tag: `delivery-won-${q.request.id}`,
      urgent: true,
    }),
    whatsappFan(
      waTargets,
      formatWhatsAppMessage({ title, lines, action: quoteAcceptedAction(wonLink) }),
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
    Promise.resolve(/* M164: the driver and the customer are both told directly above; the owner does not need a third copy */),
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
    Promise.resolve(/* M164: the driver is told directly above, which is the time-critical half */),
  ]);
}

// ── 5. The drivers who did not win ──────────────────────────────────────────

type LosingFacts = {
  requestId: string;
  what: string;
  pickupText: string;
  dropoffText: string;
  losers: number;
  winningFee: number | null;
  outcome: string;
};

/**
 * Close the loop for everybody who quoted and lost.
 *
 * Until this existed a driver who priced a job heard nothing, ever — not when
 * somebody else won it, not when the customer withdrew it. Their quote simply
 * stopped existing. That is how a reverse auction loses its supply side: not
 * through complaints, but through drivers quietly deciding the board is not
 * worth opening.
 *
 * Called after acceptance and after cancellation, both of which set the losing
 * quotes to 'declined'. Does nothing when there were none.
 */
export async function notifyLosingDrivers(requestId: string): Promise<void> {
  const f = await facts<LosingFacts>("losing_quote_facts", { p_request_id: requestId });
  if (!f || f.losers === 0) return;

  const title = lostQuoteTitle({ outcome: f.outcome });
  const lines = lostQuoteLines({
    what: f.what,
    pickupText: f.pickupText,
    dropoffText: f.dropoffText,
    outcome: f.outcome,
  });

  const [pushTargets, waTargets] = await Promise.all([
    rpc<Target>("losing_quote_push_targets", { p_request_id: requestId }),
    rpc<WaTarget>("losing_quote_whatsapp_targets", { p_request_id: requestId }),
  ]);

  await Promise.allSettled([
    pushToDriverEndpoints(pushTargets, {
      title,
      body: lines[0],
      url: "/driver",
      // Replaces the board card for this job rather than stacking beside it.
      tag: `delivery-request-${requestId}`,
    }),
    whatsappFan(waTargets, formatWhatsAppMessage({ title, lines })),
  ]);
}

// ── 6. THE PERSON WAITING BY THE DOOR ───────────────────────────────────────

type ProblemFacts = {
  requestId: string | null;
  what: string | null;
  dropoffText: string | null;
  guestEmail: string | null;
  customerId: string | null;
};

/** Who to tell, for a delivery that came from a Deliver Anything request. */
async function customerFor(deliveryId: string): Promise<ProblemFacts | null> {
  if (!hasServiceRole()) return null;
  try {
    const admin = await getPrivileged();
    const { data: d } = await admin
      .from("deliveries")
      .select("request_id")
      .eq("id", deliveryId)
      .maybeSingle();
    const requestId = (d as { request_id?: string | null } | null)?.request_id ?? null;
    // A shop order's customer is told through the order pipeline, which has its
    // own addresses and its own copy. Returning null here is that boundary, not
    // a failure.
    if (!requestId) return null;

    const { data: r } = await admin
      .from("delivery_requests")
      .select("id, what, dropoff_text, guest_email, customer_id")
      .eq("id", requestId)
      .maybeSingle();
    if (!r) return null;
    const row = r as {
      id: string;
      what: string | null;
      dropoff_text: string | null;
      guest_email: string | null;
      customer_id: string | null;
    };
    return {
      requestId: row.id,
      what: row.what,
      dropoffText: row.dropoff_text,
      guestEmail: row.guest_email,
      customerId: row.customer_id,
    };
  } catch (err) {
    console.error("customerFor failed", { deliveryId, err });
    return null;
  }
}

/**
 * Tell the customer their booked delivery has stopped.
 *
 * Push first, because it costs nothing and a guest CAN receive it — a guest
 * subscription is matched on the contact email, live since M147.
 *
 * ── WHEN THIS SPENDS AN EMAIL ─────────────────────────────────────────────
 * The standing rule (M41/M167) is that guest email must not be spent on every
 * quote in a bidding war, because the free tier is shared with Supabase auth
 * mail and password resets stop arriving when it runs dry. That rule is about
 * VOLUME: many messages about one request.
 *
 * A stall is at most one message per job, and it is the single message the
 * customer most needs. So the email goes when the push reached NOBODY, or when
 * there is no account behind the request at all — the two cases where silence
 * would otherwise be total. A signed-in customer whose phone took the push is
 * not mailed as well.
 */
export async function notifyCustomerOfDeliveryProblem(
  deliveryId: string,
  kind: CustomerProblemKind,
): Promise<void> {
  try {
    const f = await customerFor(deliveryId);
    if (!f?.requestId) return;

    const copy = deliveryStalledCopy({
      what: f.what,
      dropoff: f.dropoffText,
      kind,
    });

    const reached = await pushToCustomer(
      { email: f.guestEmail, userId: f.customerId },
      {
        title: copy.title,
        body: copy.lines[0],
        url: customerPath(f.requestId),
        // Replaces the "booked" card rather than stacking beside it.
        tag: `delivery-quotes-${f.requestId}`,
        urgent: true,
      },
    );

    if (f.guestEmail && (reached === 0 || !f.customerId)) {
      await sendDeliveryProblemEmail({
        to: f.guestEmail,
        what: f.what,
        dropoff: f.dropoffText,
        reason: copy.lines[0],
        nextStep: copy.lines.slice(1).join(" ") || "We will be in touch.",
        url: `${SITE_URL}${customerPath(f.requestId)}`,
        deliveryId,
        kind,
      });
    }
  } catch (err) {
    // Same contract as the rest of this file: a caller on a committed path
    // must never be brought down by a notification.
    console.error("notifyCustomerOfDeliveryProblem failed", { deliveryId, kind, err });
  }
}

/** Tell the customer the job is over without being delivered. */
export async function notifyCustomerOfDeliveryClosed(
  deliveryId: string,
  reason: string | null,
): Promise<void> {
  try {
    const f = await customerFor(deliveryId);
    if (!f?.requestId) return;

    const copy = deliveryClosedCopy({ what: f.what, reason });
    const reached = await pushToCustomer(
      { email: f.guestEmail, userId: f.customerId },
      {
        title: copy.title,
        body: copy.lines[0],
        url: customerPath(f.requestId),
        tag: `delivery-quotes-${f.requestId}`,
      },
    );

    if (f.guestEmail && (reached === 0 || !f.customerId)) {
      await sendDeliveryProblemEmail({
        to: f.guestEmail,
        what: f.what,
        dropoff: f.dropoffText,
        reason: copy.lines[0],
        nextStep: copy.lines.slice(1).join(" "),
        url: `${SITE_URL}${customerPath(f.requestId)}`,
        deliveryId,
        kind: "closed",
      });
    }
  } catch (err) {
    console.error("notifyCustomerOfDeliveryClosed failed", { deliveryId, err });
  }
}

/**
 * Tell the customer their request ran out of time with a price on it.
 *
 * Called from the nightly sweep, which now returns the rows rather than a
 * count — the same change that lets the owner's alert name them.
 */
export async function notifyCustomerOfExpiry(job: {
  id: string;
  what: string | null;
  guestEmail: string | null;
  isGuest: boolean;
  bestFeeCents: number | null;
}): Promise<void> {
  try {
    const copy = requestExpiredCopy({ what: job.what, bestFeeCents: job.bestFeeCents });
    const reached = await pushToCustomer(
      { email: job.guestEmail, userId: job.isGuest ? null : undefined },
      {
        title: copy.title,
        body: copy.lines[0],
        url: customerPath(job.id),
        tag: `delivery-quotes-${job.id}`,
      },
    );

    if (job.guestEmail && (reached === 0 || job.isGuest)) {
      await sendDeliveryProblemEmail({
        to: job.guestEmail,
        what: job.what,
        dropoff: null,
        reason: copy.lines[0],
        nextStep: copy.lines.slice(1).join(" "),
        url: `${SITE_URL}${customerPath(job.id)}`,
        deliveryId: job.id,
        kind: "expired",
      });
    }
  } catch (err) {
    console.error("notifyCustomerOfExpiry failed", { requestId: job.id, err });
  }
}
