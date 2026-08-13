import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Is the platform refusing cash? (M89)
 *
 * One question, asked in one place, so the consoles and the database cannot
 * disagree about whether cash exists. The authority is `prepayment_only()` in
 * Postgres — the same function the payments trigger and store_payment_options()
 * read — this is only the way a screen gets to see it.
 *
 * FAILS CLOSED. A failed read returns true, because the two outcomes are not
 * symmetrical: wrongly hiding a cash control costs a merchant one confusing
 * screen, while wrongly SHOWING one offers a payment the trigger will refuse,
 * and the customer discovers it after the food is cooked. This is the same
 * lesson as `acceptsCash ?? true` in /api/cart/resolve — a missing answer is
 * not a yes.
 */
export async function isPrepaymentOnly(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase.rpc("prepayment_only");
  if (error) {
    console.error("prepayment_only failed", error);
    return true;
  }
  return data !== false;
}
