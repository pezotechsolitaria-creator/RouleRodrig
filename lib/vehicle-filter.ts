// ── Which body-style chips a fleet page may offer ──────────────────────────
//
// Pure, so the rule that matters here can be tested rather than trusted: a
// filter chip must never return an empty grid. The owner enables styles in
// /admin ahead of tagging the cars — that is the sane order to work in — so
// "SUV" can be switched on hours before an SUV exists. If the chip row simply
// mirrored the enabled list, tapping it would empty the page and read as a
// broken site.
//
// So availability is DERIVED from the vehicles actually on the page, and the
// owner's toggle can only ever remove a chip, never conjure one.

import type { VehicleType } from "./defaults";

export type TypeChip = { id: string; label: string; count: number };

/** A vehicle, reduced to the one field this module reads. */
export type TypedVehicle = { type?: string };

/**
 * The chips to show for `items`, in the owner's own order.
 *
 * `items` must already be narrowed to one category — a chip row is a question
 * about "which of these", and mixing categories would count an SUV and a
 * scooter into the same answer.
 */
export function typeChips(
  items: TypedVehicle[],
  types: VehicleType[] | undefined,
): TypeChip[] {
  if (!types?.length) return [];
  const counts = new Map<string, number>();
  for (const it of items) {
    const ty = it.type?.trim();
    if (ty) counts.set(ty, (counts.get(ty) ?? 0) + 1);
  }
  return types
    .filter((ty) => ty.enabled)
    .map((ty) => ({ id: ty.id, label: ty.label, count: counts.get(ty.id) ?? 0 }))
    .filter((c) => c.count > 0);
}

/**
 * True when the chip row is worth rendering at all.
 *
 * One chip beside "All" filters nothing — it is furniture above the grid that
 * costs a tap to learn is useless.
 */
export function shouldShowTypeFilter(chips: TypeChip[]): boolean {
  return chips.length > 1;
}

/**
 * Apply the selection. An id that is not among the chips (a style the owner
 * just deleted, a stale value restored from a bfcache page) falls back to
 * showing everything rather than to an empty page.
 */
export function applyTypeFilter<T extends TypedVehicle>(
  items: T[],
  chips: TypeChip[],
  activeType: string,
): T[] {
  if (activeType === "all") return items;
  if (!chips.some((c) => c.id === activeType)) return items;
  return items.filter((it) => it.type === activeType);
}
