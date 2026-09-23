import type { SupabaseClient } from "@supabase/supabase-js";
import type { FoodKitchenSummary } from "./types";

// ── IS THERE ANYTHING "READY NOW" TO SEND SOMEBODY TO? (M216) ───────────────
//
// /food?open=1 is browse_food(p_orderable_only), and since M216 that filter
// reads ready_now: a dish somebody could have TODAY, cooked on the spot. A
// kitchen that needs notice is never in it — Chez Banane's dishes are booked a
// day ahead, open or closed — and on 23 Sept 2026 Chez Banane was the only
// kitchen on /food. So the "Ready now" chip, and the "See what's ready now"
// exit on a dish that cannot be ordered, both led to "Nothing delicious
// matched that" at every hour of every day.
//
// The answer is read off food_home().kitchens rather than asked of the
// catalog a second time: `isOpen` is the kitchen's hours, `minNoticeHours` is
// kitchen_notice_hours(), and both come from the same food_catalog rows the
// filter reads. A walk-up kitchen inside its hours is what the filter can
// return; with none, the control that leads there is hidden, not left to fail.

type KitchenNow = Pick<FoodKitchenSummary, "isOpen" | "minNoticeHours">;

/** An open kitchen that cooks on the spot — the only kind "ready now" lists. */
export function isWalkUpServingNow(k: KitchenNow): boolean {
  return k.isOpen && !(k.minNoticeHours > 0);
}

/** How many kitchens could hand food over right now, without a booking. */
export function walkUpKitchensServingNow(kitchens: readonly KitchenNow[]): number {
  return kitchens.filter(isWalkUpServingNow).length;
}

/**
 * The same question for a page that did not load food_home() — the dish page,
 * and only on the rare path where it needs it (a walk-up dish that cannot be
 * ordered). A failed read answers false: hiding a link to a list that may be
 * empty costs less than sending somebody to an empty list.
 */
export async function anyWalkUpServingNow(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase.rpc("food_home");
  if (error || !data) return false;
  const kitchens = (data as { kitchens?: KitchenNow[] }).kitchens ?? [];
  return walkUpKitchensServingNow(kitchens) > 0;
}
