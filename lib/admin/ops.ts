// ── The Command Center's brain, kept pure ──────────────────────────────────
//
// The admin homepage is being rebuilt from "a content editor that opens on a
// form" into an operational command centre: what is happening, what needs a
// human, what just happened. The DECISIONS in that screen — what counts as
// needing attention, how urgent it is, where clicking it goes, how activity
// from four unrelated tables merges into one feed — live here as pure
// functions, because they are exactly the logic that must not quietly rot.
// The page fetches counts; this file decides what they mean.

export type AttentionSeverity = "critical" | "action" | "info";

export type AttentionItem = {
  key: string;
  label: string;
  count: number;
  severity: AttentionSeverity;
  /** Where the admin goes to deal with it. */
  href: string;
  /**
   * The actual things behind the number, when knowing the number is not enough
   * to act on it.
   *
   * "Live shops with no bank details: 4" told the owner a real emergency was
   * happening and nothing about where. Finding out meant opening the shops
   * screen and comparing nine rows by eye, so the red 4 sat there for days
   * while a live kitchen took no orders. A count you cannot act on is a count
   * you learn to ignore.
   *
   * Only worth filling for the rows where the identity IS the next step —
   * "17 orders waiting" needs no list, the queue is the list.
   */
  names?: string[];
};

/**
 * Orders waiting, split by WHICH QUEUE they are waiting in.
 *
 * They were one number linking to /admin/food. But that screen is scoped to
 * kitchens by design — a shop order or a concert order counted in that total led
 * to a page where it can never appear, so the alert said "3 orders" and the
 * destination showed one. Three surfaces exist and each owns its own orders:
 * /admin/food, /admin/marketplace, /admin/events.
 */
export type OrderQueues = { food?: number; shop?: number; events?: number };

export type AttentionCounts = {
  openOrders?: OrderQueues;
  awaitingPaymentConfirmation?: OrderQueues;
  pendingVehicleBookings?: number;
  pendingPlaceBookings?: number;
  unhandledSubmissions?: number;
  pendingReviews?: number;
  pendingMerchants?: number;
  pendingOwnerApplications?: number;
  pendingDrivers?: number;
  deliveriesNeedingAdmin?: number;
  lowStockVariants?: number;
  /**
   * Dishes a customer can actually order RIGHT NOW, across every kitchen.
   *
   * Zero is a silent catastrophe, which is why it is counted. /food is
   * deliberately built to fall back to the WhatsApp concierge while there is
   * nothing to sell — a good decision, and completely invisible from the admin
   * side. Found by shopping the live site as a customer: every kitchen holding
   * dishes was `paused`, so the ordering surface had quietly become a contact
   * form and nothing anywhere said so.
   */
  orderableDishes?: number;
  /**
   * Kitchens that are LIVE and offering nothing.
   *
   * The opposite of orderableDishes and just as invisible. A customer who finds
   * an open restaurant with an empty menu concludes the site is broken, not
   * that the kitchen is quiet.
   */
  emptyLiveKitchens?: number;
  /**
   * Live shops with no way to receive money (M89).
   *
   * Cash was switched off platform-wide so nothing is handed over before the
   * money arrives. Eight of eleven stores were cash-only with no account
   * published, so the switch takes them off the market until they supply bank
   * details — four of them live on the day it shipped. That is the intended
   * trade, but it MUST be visible: a shop that silently cannot sell looks to
   * everyone like a shop nobody is buying from.
   */
  paymentBlockedStores?: number;
  /**
   * WHICH shops those are. Without this the row above is unactionable: the
   * owner is told four shops cannot trade and left to work out which four.
   */
  paymentBlockedStoreNames?: string[];
  /**
   * Refunds a customer is still waiting for (M90).
   *
   * The most damaging number on this page. Every other queue is somebody
   * waiting for a thing; this is somebody waiting for their MONEY BACK, after
   * an order they already paid for was cancelled. It is also the one the
   * platform cannot fix by itself — the money sits in the merchant's account,
   * so this list is a chase list.
   */
  refundsOwed?: number;
  /**
   * Refunds still unsent after the shop has been reminded twice (M93).
   *
   * A subset of refundsOwed, listed separately because it means something
   * different: not "somebody has not got round to it" but "somebody has been
   * asked and has not done it". That is the platform's problem — the customer
   * blames Roulé Rodrigues, not the shop they have never heard of again.
   */
  refundsIgnored?: number;
  /**
   * Taxi passengers who booked and never appeared, last 30 days (M92).
   *
   * INFO, not a queue: nobody is blocked and there is no button to press. It
   * is here because the cost is invisible otherwise — the driver eats the fuel
   * and the platform never hears about it — and because a number that climbs
   * is the signal to change how booking works, not something to fix ride by
   * ride.
   */
  taxiNoShows?: number;
  /**
   * Taxi rides parked because the passenger has repeat no-shows (M94).
   *
   * ACTION, not info: a real person booked a real ride and it is deliberately
   * not being dispatched until somebody rings them. Left alone it is a customer
   * silently ignored, which is worse than the no-show it guards against.
   */
  ridesAwaitingCallback?: number;
};

/**
 * Turn raw counts into the "Requires attention" queue.
 *
 * Severity is about CONSEQUENCE, not recency:
 *  · critical — a customer is actively waiting or money is in limbo
 *  · action   — a person applied and is waiting on a decision
 *  · info     — worth knowing this week, nobody is blocked today
 *
 * Zero-count items are dropped entirely: an empty queue should look empty,
 * because "0 problems" repeated eleven times reads as noise and trains the
 * operator to stop looking at the one line that matters.
 */
/** The three order queues, and the only screen that can show each one. */
const ORDER_QUEUES = [
  { key: "food" as const, noun: "Food orders", href: "/admin/food" },
  { key: "shop" as const, noun: "Shop orders", href: "/admin/marketplace" },
  { key: "events" as const, noun: "Ticket orders", href: "/admin/events" },
];

export function attentionItems(c: AttentionCounts): AttentionItem[] {
  const all: AttentionItem[] = [
    // SEVERITY IS ORDERING, NOT COLOUR. `critical` means a customer is waiting
    // right now; `action` means a person is waiting on a decision from you.
    // Both are urgent enough to show in red (see severityStyle in
    // app/admin/page.tsx) — but the rank still has to separate them, because a
    // customer whose food is going cold outranks an application that can wait
    // an hour. A test enforces exactly that, and it caught an attempt to flatten
    // them into one level.
    {
      key: "deliveries", label: "Deliveries need an admin decision",
      count: c.deliveriesNeedingAdmin ?? 0, severity: "critical", href: "/admin/deliveries",
    },
    // Not a queue — a STATE, and the only item here that fires on a zero.
    // Everything else counts work waiting to be done; this one says the shop
    // door is shut. It outranks the rest because no amount of clearing other
    // queues matters while nobody can place an order in the first place.
    {
      key: "food-offline",
      label: "Food ordering is OFF — customers see the concierge form, not a menu",
      count: (c.orderableDishes ?? 1) === 0 ? 1 : 0,
      severity: "critical",
      href: "/admin/food",
    },
    // Money owed BACK. First among equals in the critical band once counts are
    // equal, because it is the only queue where the customer has already paid
    // and received nothing — and where every day of delay is the platform's
    // reputation, not the merchant's.
    // Listed ABOVE plain refunds-owed: chasing has already failed here, so
    // this is the one that needs the owner personally rather than another
    // automated nudge.
    {
      key: "refunds-ignored",
      label: "Refunds a shop has been reminded about twice and still not sent",
      count: c.refundsIgnored ?? 0,
      severity: "critical",
      href: "/admin/marketplace",
    },
    {
      key: "refunds-owed",
      label: "Refunds customers are still waiting for",
      count: c.refundsOwed ?? 0,
      severity: "critical",
      href: "/admin/marketplace",
    },
    // A live shop nobody can pay. Critical, and ranked with the other two
    // "the door is shut" states rather than among the queues: no amount of
    // clearing work matters while a customer physically cannot buy. This is
    // the cost of M89 made visible, and it clears itself one merchant at a
    // time as bank details arrive.
    {
      key: "payment-blocked-stores",
      label: "Live shops with no bank details — they cannot take an order",
      count: c.paymentBlockedStores ?? 0,
      severity: "critical",
      href: "/admin/stores",
      // Named, because "4" is not something anybody can act on. Each of these
      // is fixed in one place: the shop's Payment section on /admin/stores.
      names: c.paymentBlockedStoreNames,
    },
    // A live restaurant with an empty menu. Not critical — nothing is broken
    // and no customer is waiting — but somebody will walk into it today.
    {
      key: "empty-live-kitchen",
      label: "Live kitchens with no dishes on sale",
      count: c.emptyLiveKitchens ?? 0,
      severity: "action",
      href: "/admin/food",
    },
    // One row per queue, each pointing at the screen that actually holds it.
    ...ORDER_QUEUES.flatMap<AttentionItem>((q) => [
      {
        key: `awaiting-payment-${q.key}`,
        label: `${q.noun} awaiting payment confirmation`,
        count: c.awaitingPaymentConfirmation?.[q.key] ?? 0,
        severity: "critical",
        href: q.href,
      },
      {
        key: `open-orders-${q.key}`,
        label: `${q.noun} still open`,
        count: c.openOrders?.[q.key] ?? 0,
        severity: "critical",
        href: q.href,
      },
    ]),
    {
      key: "vehicle-bookings", label: "Rental requests to confirm",
      count: c.pendingVehicleBookings ?? 0, severity: "action", href: "/admin/content#bookings",
    },
    {
      key: "place-bookings", label: "Experience bookings to confirm",
      count: c.pendingPlaceBookings ?? 0, severity: "action", href: "/admin/content#place_bookings",
    },
    {
      key: "merchants", label: "Merchant applications to review",
      count: c.pendingMerchants ?? 0, severity: "action", href: "/admin/subscriptions",
    },
    {
      key: "drivers", label: "Driver applications to review",
      count: c.pendingDrivers ?? 0, severity: "action", href: "/admin/deliveries",
    },
    {
      // The list lives in the content studio's "Listing Applications" section.
      // It was /admin#owners, which was right while the studio WAS /admin —
      // moving the studio to /admin/content turned it into a link that lands on
      // the Command Center and does nothing, so a real restaurant application
      // looked like nothing had happened at all.
      key: "owner-apps", label: "New listing applications",
      count: c.pendingOwnerApplications ?? 0, severity: "critical", href: "/admin/content#owners",
    },
    {
      key: "submissions", label: "Unanswered contact messages",
      count: c.unhandledSubmissions ?? 0, severity: "action", href: "/admin/content#submissions",
    },
    {
      key: "reviews", label: "Reviews awaiting moderation",
      count: c.pendingReviews ?? 0, severity: "info", href: "/admin/content#reviews",
    },
    {
      key: "rides-callback", label: "Taxi bookings held for a confirmation call",
      count: c.ridesAwaitingCallback ?? 0, severity: "action", href: "/admin/rides",
    },
    {
      key: "taxi-no-shows", label: "Taxi no-shows in the last 30 days",
      count: c.taxiNoShows ?? 0, severity: "info", href: "/admin/rides",
    },
    {
      key: "low-stock", label: "Products low on stock",
      count: c.lowStockVariants ?? 0, severity: "info", href: "/admin/stores",
    },
  ];

  const rank: Record<AttentionSeverity, number> = { critical: 0, action: 1, info: 2 };
  return all
    .filter((i) => i.count > 0)
    .sort((a, b) => rank[a.severity] - rank[b.severity] || b.count - a.count);
}

// ── The activity feed ───────────────────────────────────────────────────────

export type ActivityEvent = {
  /** ISO timestamp — the merge key across sources. */
  at: string;
  /** One line, written for a human scanning a feed. */
  line: string;
  href: string;
};

/**
 * Merge events from any number of sources into one feed, newest first.
 *
 * Pure and total: an event with an unparseable timestamp sorts to the END
 * rather than throwing or floating to the top — the feed's job is to be
 * glanced at, and a crash on one malformed legacy row would take the whole
 * command centre down with it.
 */
export function mergeActivity(sources: ActivityEvent[][], limit = 12): ActivityEvent[] {
  const time = (e: ActivityEvent) => {
    const t = Date.parse(e.at);
    return Number.isFinite(t) ? t : -Infinity;
  };
  return sources
    .flat()
    .sort((a, b) => time(b) - time(a))
    .slice(0, limit);
}

// ── Search input hygiene ────────────────────────────────────────────────────

/**
 * Make a user-typed string safe inside a PostgREST ilike PATTERN.
 *
 * This is the M11 lesson applied before the bug instead of after it: `%` and
 * `_` are wildcards inside ilike, and PostgREST additionally rewrites `*` to
 * `%`. A search box that passes its input straight into a pattern lets
 * `%` match EVERY row — which in a lookup was an authentication bypass, and in
 * an admin search is "return the whole table". Escape rather than reject,
 * because a customer genuinely may be called O'Brien_Smith.
 */
export function escapeIlike(raw: string): string {
  return raw
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
    .replace(/\*/g, "\\*");
}

/** The pattern for a "contains" search on an already-escaped needle. */
export function containsPattern(raw: string): string {
  return `%${escapeIlike(raw.trim())}%`;
}

/**
 * Is this query worth sending to the database at all?
 * One character matches half of every table and helps nobody.
 */
export function isSearchable(raw: string): boolean {
  return raw.trim().length >= 2;
}
