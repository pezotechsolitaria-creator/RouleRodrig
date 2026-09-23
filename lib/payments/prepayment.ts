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

/**
 * Is cash refused for THIS store? (M201)
 *
 * The platform switch, unless the owner has exempted the store — on 23 Sept
 * 2026 Chez Banane was, on "allow cash for chez banane". Every screen that
 * shows ONE store's cash controls asks this, not isPrepaymentOnly(): asking
 * the platform question there would hide cash the database now accepts.
 *
 * Fails closed exactly like isPrepaymentOnly, and for the same reason. No
 * store means no exemption to look up, so it gets the platform answer.
 */
export async function isPrepaymentOnlyFor(
  supabase: SupabaseClient,
  storeId: string | null | undefined,
): Promise<boolean> {
  if (!storeId) return isPrepaymentOnly(supabase);
  const { data, error } = await supabase.rpc("prepayment_only_for", { p_store_id: storeId });
  if (error) {
    console.error("prepayment_only_for failed", error);
    return true;
  }
  return data !== false;
}

/**
 * A screen that shows orders from SEVERAL stores at once (the kitchen board
 * serves every kitchen a cook is on) can only show a cash control when EVERY
 * one of them takes cash. One store still bound by the rule, or an empty list,
 * and the answer is the platform's — fail closed, never open.
 */
export async function isPrepaymentOnlyForAll(
  supabase: SupabaseClient,
  storeIds: readonly string[],
): Promise<boolean> {
  if (storeIds.length === 0) return isPrepaymentOnly(supabase);
  const answers = await Promise.all(storeIds.map((id) => isPrepaymentOnlyFor(supabase, id)));
  return answers.some(Boolean);
}
