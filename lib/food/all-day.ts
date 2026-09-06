// ── ALL DAY: what the kitchen is actually cooking, in total ─────────────────
//
// A cook reading a stack of tickets one at a time makes the same dish four
// separate times. Every serious kitchen screen has a view that collapses the
// live tickets into totals — "6× chicken curry, 3× mine frite" — so one pan
// goes on once. Toast calls it All Day; so does everyone else.
//
// This is the arithmetic, kept out of the component so it can be tested
// properly. The component's job is to display what this returns.

export type AllDayItem = {
  name: string;
  variant: string | null;
  /** Total portions to cook across every counted ticket. */
  qty: number;
  /** How many separate orders this line came from. */
  tickets: number;
  /** The kitchen has marked this off the menu — it cannot be made. */
  soldOut: boolean;
};

export type AllDayView = {
  items: AllDayItem[];
  /** Portions in total, across every line. */
  totalPortions: number;
  /** Orders counted. */
  countedOrders: number;
  /**
   * Live orders deliberately NOT counted because the money is unproven.
   *
   * Surfaced rather than hidden: a cook who sees "12 portions" has to be able
   * to trust it is 12. Silently omitting orders would make the number wrong in
   * the one direction that wastes food.
   */
  excludedOrders: number;
};

type OrderLike = {
  items: { name: string; variant: string | null; qty: number; soldOut?: boolean }[];
  finished?: boolean;
  /** Bank transfer with nothing proven yet. The board already says: do NOT cook. */
  waitingOnTransfer?: boolean;
};

/**
 * Collapse the live tickets into one list of things to cook.
 *
 * ── WHAT COUNTS, AND WHY ──────────────────────────────────────────────────
 *
 * FINISHED ORDERS ARE OUT. Collected, cancelled and refunded orders stay on
 * the board as today's record, but nobody is cooking them.
 *
 * ORDERS WAITING ON A BANK TRANSFER ARE OUT. The ticket for one of these
 * already says "Waiting for the customer's bank transfer. Nothing to cook
 * yet." An All Day total that quietly included them would send a cook to put
 * six portions on for an order that may never be paid — and All Day is
 * specifically the screen someone acts on in bulk, which is exactly where that
 * mistake gets expensive. They are counted separately and reported, so the
 * number on screen can be trusted as the number to cook.
 *
 * ── HOW LINES ARE GROUPED ─────────────────────────────────────────────────
 *
 * By name AND variant, never by name alone. "Curry (large)" and "Curry
 * (small)" are two different jobs with two different pans; merging them into
 * "5× Curry" tells the cook something untrue at the exact moment they are
 * batching. The variant is part of the identity, not a detail.
 *
 * Sold-out lines are KEPT rather than dropped. If a dish went off the menu
 * while orders for it were already live, the cook needs to see it — those
 * customers still need telling. Hiding the line hides the problem.
 */
export function allDayFrom(orders: OrderLike[]): AllDayView {
  const byKey = new Map<string, AllDayItem & { orderIds: Set<number> }>();
  let countedOrders = 0;
  let excludedOrders = 0;

  orders.forEach((order, index) => {
    if (order.finished) return;
    if (order.waitingOnTransfer) {
      excludedOrders += 1;
      return;
    }
    countedOrders += 1;

    for (const item of order.items ?? []) {
      const name = (item.name ?? "").trim();
      if (!name) continue;
      const variant = item.variant?.trim() ? item.variant.trim() : null;
      // The key carries the variant, so large and small never merge, and it is
      // built with JSON rather than by gluing the two together with a
      // separator character. A separator has to be something no dish name can
      // contain, and every candidate is either typeable by a human — a dish
      // really called "Curry · Large" would then collide with "Curry" in a
      // "Large" variant — or invisible, which is worse: the first version of
      // this used a literal NUL and it silently turned the file binary to git.
      const key = JSON.stringify([name, variant]);

      const qty = Number.isFinite(item.qty) && item.qty > 0 ? Math.round(item.qty) : 0;
      if (qty === 0) continue;

      const existing = byKey.get(key);
      if (existing) {
        existing.qty += qty;
        existing.orderIds.add(index);
        // Sold out anywhere means sold out — the kitchen cannot make it for
        // one customer and not another.
        existing.soldOut = existing.soldOut || !!item.soldOut;
      } else {
        byKey.set(key, {
          name,
          variant,
          qty,
          tickets: 0,
          soldOut: !!item.soldOut,
          orderIds: new Set([index]),
        });
      }
    }
  });

  const items: AllDayItem[] = [...byKey.values()]
    .map(({ orderIds, ...rest }) => ({ ...rest, tickets: orderIds.size }))
    // Biggest batch first — that is the order a cook works in. Ties break
    // alphabetically so the list does not reshuffle on every poll, which on a
    // screen that refreshes itself would be unreadable.
    .sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name)
      || (a.variant ?? "").localeCompare(b.variant ?? ""));

  return {
    items,
    totalPortions: items.reduce((n, i) => n + i.qty, 0),
    countedOrders,
    excludedOrders,
  };
}
