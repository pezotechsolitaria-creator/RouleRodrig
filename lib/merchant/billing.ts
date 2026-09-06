import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  modelChargesCommission,
  modelChargesSubscription,
  type MonetizationModel,
} from "@/lib/marketplace/fees";

// ── HOW THIS PLATFORM CHARGES, ASKED ONCE ──────────────────────────────────
//
// The merchant console showed "Plan premium · cancelled · renews 11 Sept" —
// three facts that contradict each other, on a platform that as of M171 does
// not charge a subscription at all. A merchant reading that cannot tell whether
// they owe money, whether they are about to be cut off, or whether to act.
//
// The answer to all three is now the same and it is simple: nothing is owed
// monthly, and a percentage is taken per sale. This reads the one setting that
// decides it, so no screen has to guess.

export type Billing = {
  model: MonetizationModel;
  chargesSubscription: boolean;
  chargesCommission: boolean;
  /** The platform default rate, as a fraction. Per-merchant overrides win. */
  defaultRate: number;
};

/**
 * FAILS TOWARDS THE TRUTH, NOT TOWARDS BILLING. A failed read reports the
 * platform's own default of 'subscription' — the same fallback
 * merchant_subscription_active() and resolve_commission_rate() use — so a
 * transient error can never make a screen invent a fee arrangement nobody
 * agreed to.
 */
export async function getBilling(supabase: SupabaseClient): Promise<Billing> {
  const { data, error } = await supabase
    .from("marketplace_settings")
    .select("monetization_model, default_commission_rate")
    .eq("id", "main")
    .maybeSingle();

  if (error) console.error("getBilling failed", error);

  const row = data as
    | { monetization_model?: string | null; default_commission_rate?: number | string | null }
    | null;

  const model = (row?.monetization_model ?? "subscription") as MonetizationModel;
  const raw = Number(row?.default_commission_rate ?? 0);

  return {
    model,
    chargesSubscription: modelChargesSubscription(model),
    chargesCommission: modelChargesCommission(model),
    defaultRate: Number.isFinite(raw) ? raw : 0,
  };
}
