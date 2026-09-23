// ── WHAT A DAY CHIP IS CALLED (M216) ────────────────────────────────────────
//
// The picker used to label every day "Today" or "Tomorrow", because M161 only
// ever offered two. A two-day pre-order horizon (M216, Chez Banane) offers a
// third, and it read "Tomorrow" as well — two chips with the same name and
// different days behind them.
//
// Pure, and keyed on the ISO date string food_pickup_slots() returns, so the
// label never depends on the browser's clock or time zone: the server already
// decided which Rodrigues date each chip is.

type WhenWords = {
  today: string;
  tomorrow: string;
  /** Sunday first — the order Date.getUTCDay() counts in. */
  weekdays: readonly string[];
};

/** Days between two YYYY-MM-DD dates, by calendar, never by clock. */
function daysBetween(from: string, to: string): number {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

/**
 * "Today", "Tomorrow", then the weekday and date: "Friday 25".
 *
 * `today` is the FIRST date the server returned — food_pickup_slots() always
 * starts at the kitchen's local today — so a phone set to another time zone
 * still names the days the kitchen means.
 */
export function dayLabel(date: string, today: string | undefined, w: WhenWords): string {
  if (!today || date === today) return w.today;
  const n = daysBetween(today, date);
  if (n === 1) return w.tomorrow;
  const wd = new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10))).getUTCDay();
  return `${w.weekdays[wd]} ${+date.slice(8, 10)}`;
}
