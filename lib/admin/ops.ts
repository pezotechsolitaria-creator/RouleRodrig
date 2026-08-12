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
};

export type AttentionCounts = {
  openOrders?: number;
  awaitingPaymentConfirmation?: number;
  pendingVehicleBookings?: number;
  pendingPlaceBookings?: number;
  unhandledSubmissions?: number;
  pendingReviews?: number;
  pendingMerchants?: number;
  pendingOwnerApplications?: number;
  pendingDrivers?: number;
  deliveriesNeedingAdmin?: number;
  lowStockVariants?: number;
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
    {
      key: "awaiting-payment", label: "Bank transfers awaiting confirmation",
      count: c.awaitingPaymentConfirmation ?? 0, severity: "critical", href: "/admin/food",
    },
    {
      key: "open-orders", label: "Open orders in the queue",
      count: c.openOrders ?? 0, severity: "critical", href: "/admin/food",
    },
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
      //
      // The href was also wrong: it pointed at /admin/content#owner_applications,
      // but the list lives in the Command Centre's own `owners` section. Clicking
      // the alert took you to a page that does not have it — which is why a real
      // restaurant application looked like nothing had happened at all.
      key: "owner-apps", label: "New listing applications",
      count: c.pendingOwnerApplications ?? 0, severity: "critical", href: "/admin#owners",
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
