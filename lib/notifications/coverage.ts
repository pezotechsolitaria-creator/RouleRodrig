import { NOTIFICATION_CATEGORIES, type NotificationCategory } from "./categories";
import { slotReceives } from "./slot-match";

// ── "Nobody will be phoned about this", asked of every category at once ─────
//
// enqueue_notification() returns -1 when no active slot takes a category (M118),
// which is now distinguishable from a healthy dedupe. But that signal only
// arrives AFTER a message has already been thrown away — and this exact failure
// has happened here: on 2026-08-09 the daily cron raised "ticketing reserve may
// be too small", burned its once-per-day claim, and enqueued into a database
// with zero notification_slots. The alert was destroyed and never retried.
//
// A missing recipient is not an event. It is a STANDING configuration fact,
// derivable from the slot list alone, before a single message is lost. That is
// the version worth putting in front of the owner.
//
// ── THE TRAP THIS CLOSES ───────────────────────────────────────────────────
// /admin already shows each slot's own coverage, so the owner can read one row
// at a time. What no screen shows is the UNION across slots — and only a gap in
// that union actually drops a message. Narrowing ONE slot is harmless while
// another is still catch-all; the fan-out simply falls from two to one. Reading
// that off two chip lists across nine categories is not something a person
// does, which is why it needs computing rather than displaying.
//
// The rule itself is not restated here. slotReceives() is the single mirror of
// the RPC's predicate (including the easy-to-invert "empty list means
// everything"), and it is already pinned by slot-match.test.ts.

export type CoverageSlot = {
  is_active?: boolean | null;
  categories?: readonly string[] | null;
};

/** Categories no active slot subscribes to. An empty array means full cover. */
export function uncoveredCategories(
  slots: readonly CoverageSlot[],
): NotificationCategory[] {
  return NOTIFICATION_CATEGORIES.filter((c) => !slots.some((s) => slotReceives(s, c)));
}
