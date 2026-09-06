import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// ── WHAT THIS MERCHANT HAS EARNED, AND WHAT THEY OWE ────────────────────────
//
// The first honest money figure in the merchant console. Two numbers and
// nothing else:
//
//   · what they have been paid            sum(merchant_net)
//   · what they owe Roulé Rodrigues       sum(commission_amount)
//
// ── WHAT IS DELIBERATELY ABSENT ────────────────────────────────────────────
// There is no payout, no balance and no schedule, because THE PLATFORM NEVER
// HOLDS THE MONEY. The customer bank-transfers the merchant directly. A
// "pending payout" widget would be a number that does not exist anywhere — the
// most confident kind of lie a dashboard can tell.
//
// ── WHY LIFETIME AND NOT THIS MONTH ────────────────────────────────────────
// Eleven payments have ever been taken on this platform, across three
// merchants. A date_trunc('month', now()) filter would guarantee the block
// shows nothing to anybody, which is the same failure as a fabricated chart
// wearing a different hat. Lifetime is small, true, and moves when they sell.
//
// ── WHY NOT merchant_fee_summary() ─────────────────────────────────────────
// It aggregates by MERCHANT, and every food kitchen on this island hangs off
// one platform merchant — so a kitchen owner would be shown the summed takings
// of every restaurant on Rodrigues as if they were their own. It also guards on
// merchant staffing, which a kitchen owner is not. This reads order_financials
// scoped to ONE STORE, through the order it belongs to.

export type Earnings =
  | {
      ok: true;
      /** Cents. What the merchant has been paid, net of commission. */
      netCents: number;
      /** Cents. What they owe the platform. Zero is a real answer here. */
      commissionCents: number;
      /** The rate actually recorded on their orders, never a typed constant. */
      rate: number | null;
      orderCount: number;
    }
  /**
   * Either the read failed, or it came back empty while the store demonstrably
   * has money — see the guard below. Both mean "we cannot tell you", which is
   * very different from "you earned nothing".
   */
  | { ok: false };

/**
 * Lifetime earnings for ONE store.
 *
 * `earned_at is not null` excludes orders whose money was never recognised, and
 * `reversed_at is null` excludes the ones that were cancelled or refunded —
 * both columns already exist on order_financials and are already maintained by
 * the order lifecycle trigger. Nothing here recomputes money; it only reads
 * what create_order and the lifecycle already wrote.
 */
export async function getEarnings(
  supabase: SupabaseClient,
  storeId: string,
): Promise<Earnings> {
  const { data, error } = await supabase
    .from("order_financials")
    .select("merchant_net, commission_amount, commission_rate, orders!inner(store_id)")
    .eq("orders.store_id", storeId)
    .not("earned_at", "is", null)
    .is("reversed_at", null);

  if (error) {
    console.error("getEarnings failed", error);
    return { ok: false };
  }

  const rows = (data ?? []) as unknown as Array<{
    merchant_net: number | null;
    commission_amount: number | null;
    commission_rate: number | string | null;
  }>;

  if (rows.length === 0) {
    // ── THE ANTI-LIE GUARD ───────────────────────────────────────────────
    // "Rs 0.00" shown to an owner who has actually taken money is a false
    // statement about their money — the worst thing this console could say.
    // An RLS denial and a store that has genuinely never sold anything both
    // arrive here as an empty list with no error, so the only way to tell them
    // apart is to ask a second question the merchant can definitely answer:
    // does this store have a paid or collected order at all?
    const { count, error: countError } = await supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("store_id", storeId)
      .in("status", ["paid", "collected"]);

    if (countError) {
      console.error("getEarnings guard failed", countError);
      return { ok: false };
    }
    // Money exists but the figures do not: refuse to show a total.
    if ((count ?? 0) > 0) return { ok: false };

    return { ok: true, netCents: 0, commissionCents: 0, rate: null, orderCount: 0 };
  }

  let netCents = 0;
  let commissionCents = 0;
  for (const r of rows) {
    netCents += r.merchant_net ?? 0;
    commissionCents += r.commission_amount ?? 0;
  }

  // The rate is READ, never typed. If a merchant's orders were written under
  // more than one rate — which is exactly what happens the week a platform
  // changes its model, as this one did today — no single rate is honest, so
  // none is claimed.
  const rates = new Set(
    rows
      .map((r) => (r.commission_rate == null ? null : Number(r.commission_rate)))
      .filter((n): n is number => n != null && Number.isFinite(n)),
  );
  const rate = rates.size === 1 ? [...rates][0] : null;

  return { ok: true, netCents, commissionCents, rate, orderCount: rows.length };
}

/** One completed sale, as it appears on the merchant's own statement. */
export type EarningLine = {
  orderId: string;
  orderNumber: string;
  placedAt: string | null;
  /** Cents. What the customer paid in total, including tax and any delivery. */
  customerTotalCents: number;
  /** Cents. The part commission is charged on: goods minus discount. */
  commissionableCents: number;
  commissionCents: number;
  netCents: number;
  rate: number | null;
};

/**
 * The line-by-line statement behind the Home summary.
 *
 * Same filters as getEarnings — earned, not reversed, this store only — so the
 * two can never disagree. A total the merchant cannot break down is a total
 * they cannot check, and this is the only money on the platform they are
 * actually owed by someone.
 *
 * Newest first: reconciliation starts from the sale you remember.
 */
export async function getEarningLines(
  supabase: SupabaseClient,
  storeId: string,
  limit = 50,
): Promise<EarningLine[] | null> {
  const { data, error } = await supabase
    .from("order_financials")
    .select(
      "order_id, customer_total, commissionable_amount, commission_amount, commission_rate, merchant_net, orders!inner(order_number, placed_at, store_id)",
    )
    .eq("orders.store_id", storeId)
    .not("earned_at", "is", null)
    .is("reversed_at", null)
    .order("earned_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("getEarningLines failed", error);
    return null;
  }

  return ((data ?? []) as unknown as Array<{
    order_id: string;
    customer_total: number | null;
    commissionable_amount: number | null;
    commission_amount: number | null;
    commission_rate: number | string | null;
    merchant_net: number | null;
    orders: { order_number: string; placed_at: string | null } | null;
  }>).map((r) => ({
    orderId: r.order_id,
    orderNumber: r.orders?.order_number ?? "—",
    placedAt: r.orders?.placed_at ?? null,
    customerTotalCents: r.customer_total ?? 0,
    commissionableCents: r.commissionable_amount ?? 0,
    commissionCents: r.commission_amount ?? 0,
    netCents: r.merchant_net ?? 0,
    rate:
      r.commission_rate == null || !Number.isFinite(Number(r.commission_rate))
        ? null
        : Number(r.commission_rate),
  }));
}
