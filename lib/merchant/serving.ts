import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// ── WHAT CAN I STILL SERVE? ─────────────────────────────────────────────────
//
// The question a cook actually has, and it is NOT "how many units are low".
// A dish comes off the menu for reasons a stock count cannot express: it is
// outside its serving window, it is a Sunday dish, the kitchen is shut, or the
// last portion went. Three of those four have nothing to do with quantity, and
// a shop's low-stock report would report a perfectly healthy kitchen as fine
// while six dishes were unorderable for the next two hours.
//
// food_catalog already computes `orderable` by folding all of it together —
// the same column /food gates its Add button on — so the cook's screen and the
// customer's screen can never disagree about what is available.

export type ServingToday = {
  ok: true;
  total: number;
  orderable: number;
  /** Dishes that are off right now, with the reason, worst first. */
  off: { name: string; reason: string }[];
} | { ok: false };

/** Reason codes, in the cook's words. Ordered by how much they can do about it. */
const REASON: Record<string, { label: string; actionable: boolean }> = {
  sold_out: { label: "sold out", actionable: true },
  off_menu: { label: "off the menu", actionable: true },
  missing: { label: "not set up", actionable: true },
  wrong_time: { label: "outside its serving time", actionable: false },
  wrong_day: { label: "not served today", actionable: false },
  kitchen_closed: { label: "kitchen closed", actionable: false },
};

export async function getServingToday(
  supabase: SupabaseClient,
  storeId: string,
): Promise<ServingToday> {
  const { data, error } = await supabase
    .from("food_catalog")
    .select("name, orderable, availability")
    .eq("kitchen_id", storeId);

  if (error) {
    console.error("getServingToday failed", error);
    return { ok: false };
  }

  const rows = (data ?? []) as { name: string; orderable: boolean; availability: string }[];

  const off = rows
    .filter((r) => !r.orderable)
    .map((r) => ({
      name: r.name,
      reason: REASON[r.availability]?.label ?? r.availability,
      actionable: REASON[r.availability]?.actionable ?? false,
    }))
    // Something the cook can fix outranks something they cannot: a sold-out
    // dish is a decision, a dish outside its window is just the clock.
    .sort((a, b) => Number(b.actionable) - Number(a.actionable) || a.name.localeCompare(b.name))
    .map(({ name, reason }) => ({ name, reason }));

  return {
    ok: true,
    total: rows.length,
    orderable: rows.filter((r) => r.orderable).length,
    off,
  };
}
