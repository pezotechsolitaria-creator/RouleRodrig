import type { NotificationCategory } from "./categories";

// ── Who receives a given category, in ONE place ────────────────────────────
//
// enqueue_notification() decides this in SQL:
//
//   where is_active
//     and (cardinality(categories) = 0 or p_category = any (categories))
//
// The `cardinality = 0` half is easy to miss and easy to get backwards: an
// EMPTY category list means EVERY category, not none. Both of the owner's real
// WhatsApp slots are configured that way.
//
// /admin re-implemented the rule to show "who will be phoned" and got exactly
// that half wrong — it reported "nobody will be phoned" while the database was
// queueing to two numbers. A dashboard that lies in the alarming direction is
// arguably worse than one that lies in the safe direction: the owner stops
// trusting the feature and goes back to checking manually.
//
// So the rule lives here, and the UI asks this function rather than guessing.
export function slotReceives(
  slot: { is_active?: boolean | null; categories?: readonly string[] | null },
  category: NotificationCategory,
): boolean {
  if (slot.is_active === false) return false;
  const cats = slot.categories ?? [];
  // Empty = subscribed to everything, exactly as the RPC reads it.
  return cats.length === 0 || cats.includes(category);
}
