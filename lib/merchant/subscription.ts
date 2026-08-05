import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type SubscriptionPlan = "starter" | "standard" | "premium";
export type SubscriptionStatus = "trialing" | "active" | "past_due" | "suspended" | "cancelled";

export type MerchantSubscription = {
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  startedAt: string;
  currentPeriodEnd: string;
  graceDays: number;
  cancelledAt: string | null;
  /** Whole days until the period ends. Negative once it has lapsed. */
  daysRemaining: number;
  /** Days left in the grace window once the period has ended; 0 outside it. */
  graceDaysRemaining: number;
  /** Mirrors merchant_subscription_active() — selling is allowed. */
  isActive: boolean;
  inGracePeriod: boolean;
  hasExpired: boolean;
};

export const PLAN_LABEL: Record<SubscriptionPlan, string> = {
  starter: "Starter",
  standard: "Standard",
  premium: "Premium",
};

const DAY_MS = 86_400_000;

/**
 * Reads a merchant's subscription and derives the display state.
 *
 * The AUTHORITY on whether a merchant may sell is the database —
 * merchant_subscription_active() gates create_order(), and a trigger gates
 * product/shop writes. This function must therefore mirror that rule exactly
 * and is used only to render the UI; it never decides anything on its own.
 *
 * A merchant with NO subscription row is treated as active, matching the SQL
 * function's coalesce(..., true), so nobody who predates the subscription
 * system is locked out.
 */
export async function getMerchantSubscription(
  supabase: SupabaseClient,
  merchantId: string,
): Promise<MerchantSubscription | null> {
  const { data } = await supabase
    .from("merchant_subscriptions")
    .select("plan, status, started_at, current_period_end, grace_days, cancelled_at")
    .eq("merchant_id", merchantId)
    .maybeSingle();

  if (!data) return null;

  const now = Date.now();
  const periodEnd = new Date(data.current_period_end).getTime();
  const graceEnd = periodEnd + data.grace_days * DAY_MS;

  const daysRemaining = Math.ceil((periodEnd - now) / DAY_MS);
  const withinPeriod = now <= periodEnd;
  const withinGrace = !withinPeriod && now <= graceEnd;
  const statusAllows = ["trialing", "active", "past_due"].includes(data.status);

  return {
    plan: data.plan,
    status: data.status,
    startedAt: data.started_at,
    currentPeriodEnd: data.current_period_end,
    graceDays: data.grace_days,
    cancelledAt: data.cancelled_at,
    daysRemaining,
    graceDaysRemaining: withinGrace ? Math.ceil((graceEnd - now) / DAY_MS) : 0,
    isActive: statusAllows && now <= graceEnd,
    inGracePeriod: statusAllows && withinGrace,
    hasExpired: !statusAllows || now > graceEnd,
  };
}

export async function getBillingHistory(
  supabase: SupabaseClient,
  merchantId: string,
  { page = 1, pageSize = 10 }: { page?: number; pageSize?: number } = {},
) {
  const { data, count } = await supabase
    .from("subscription_invoices")
    .select("id, plan, amount, currency, period_start, period_end, status, paid_at, note, created_at", {
      count: "exact",
    })
    .eq("merchant_id", merchantId)
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  return { invoices: data ?? [], total: count ?? 0, page, pageSize };
}
