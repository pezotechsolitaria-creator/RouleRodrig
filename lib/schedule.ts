// The scheduling vocabulary shared by every surface: storefront, checkout,
// merchant dashboard, admin dashboard and the API routes.
//
// WHERE THE TRUTH LIVES — read this before adding anything here.
//
// The DECISION "is this shop open / is delivery running" is made in ONE place:
// the Postgres function store_schedule_status(store_id), which evaluates the
// weekly rules against Rodrigues wall-clock time. create_order() and
// quote_order() call it directly, so a crafted request that skips the UI is
// refused by the same code that the UI consults.
//
// This module deliberately does NOT re-implement that decision. It holds the
// shared TYPES, the formatting, and the copy — the presentation half. Anything
// that could change whether an order is accepted belongs in SQL, not here.
// That split is what stops the two halves drifting: there is nothing to drift.
//
// Rodrigues is UTC+4 (Indian/Mauritius) and does not observe DST.

export const RODRIGUES_TZ = "Indian/Mauritius";

// Postgres extract(dow): 0 = Sunday .. 6 = Saturday. The DB CHECK constraint
// uses the same numbering, so these indices are the wire format.
export const WEEKDAYS = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
] as const;

export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

// The week as merchants think of it — Monday first — while keeping the DB's
// Sunday-zero indices as the values.
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

export type DaySchedule = {
  weekday: number;
  is_closed: boolean;
  opens_at: string | null;          // "HH:MM", Rodrigues wall clock
  closes_at: string | null;
  // null delivery bounds mean "delivery follows the shop's own hours" —
  // mirrored by the store_hours_delivery_window CHECK constraint.
  delivery_opens_at: string | null;
  delivery_closes_at: string | null;
  delivery_closed: boolean;
  note?: string | null;
};

// Exactly the row shape returned by store_schedule_status().
export type ScheduleStatus = {
  has_schedule: boolean;
  is_open: boolean;
  delivery_available: boolean;
  local_date: string;
  local_time: string;
  weekday: number;
  opens_at: string | null;
  closes_at: string | null;
  is_closed: boolean;
  delivery_opens_at: string | null;
  delivery_closes_at: string | null;
  delivery_closed: boolean;
  is_override: boolean;
  next_open_at: string | null;
};

/** "08:00:00" | "08:00" -> "08:00". Postgres time values arrive with seconds. */
export function hhmm(t: string | null | undefined): string {
  if (!t) return "";
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return "";
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

/** The current moment in Rodrigues, regardless of where this code runs. */
export function nowInRodrigues(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: RODRIGUES_TZ }));
}

/** Minutes since midnight, for ordering comparisons. Returns null if unparseable. */
export function toMinutes(t: string | null | undefined): number | null {
  const s = hhmm(t);
  if (!s) return null;
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Validation mirroring the DB CHECK constraints and set_store_hours(). Used to
 * disable the save button and show the reason inline — the database rejects
 * these too, so this is a courtesy, never the guarantee.
 * Returns null when the day is valid.
 */
export function validateDay(d: DaySchedule): string | null {
  if (d.is_closed) return null;

  const o = toMinutes(d.opens_at);
  const c = toMinutes(d.closes_at);
  if (o === null || c === null) return "Set both an opening and a closing time.";
  if (c <= o) return "Closing time must be after opening time.";

  const dOpen = toMinutes(d.delivery_opens_at);
  const dClose = toMinutes(d.delivery_closes_at);
  const anySet = d.delivery_opens_at != null || d.delivery_closes_at != null;
  if (!anySet) return null;                        // inherits the shop's hours
  if (dOpen === null || dClose === null) return "Set both a delivery start and end time.";
  if (dClose <= dOpen) return "Delivery must end after it starts.";
  if (dOpen < o) return "Delivery cannot start before the shop opens.";
  if (dClose > c) return "Delivery cannot end after the shop closes.";
  return null;
}

export function validateWeek(days: DaySchedule[]): string | null {
  for (const d of days) {
    const err = validateDay(d);
    if (err) return `${WEEKDAYS[d.weekday]}: ${err}`;
  }
  return null;
}

/** "Open 08:00 – 20:00" / "Closed today" — the today line shown to customers. */
export function todayLine(s: ScheduleStatus | null): string {
  if (!s) return "Hours not available";
  if (!s.has_schedule) return "Hours not set";
  if (s.is_closed || !s.opens_at || !s.closes_at) return "Closed today";
  return `${hhmm(s.opens_at)} – ${hhmm(s.closes_at)}`;
}

/** The effective delivery window, applying the inherit-from-shop-hours rule. */
export function deliveryLine(s: ScheduleStatus | null): string {
  if (!s || !s.has_schedule) return "";
  if (s.is_closed) return "No delivery today";
  if (s.delivery_closed) return "No delivery today";
  const open = hhmm(s.delivery_opens_at) || hhmm(s.opens_at);
  const close = hhmm(s.delivery_closes_at) || hhmm(s.closes_at);
  if (!open || !close) return "";
  return `${open} – ${close}`;
}

export type StatusTone = "open" | "closed" | "unknown";

export function openTone(s: ScheduleStatus | null): StatusTone {
  if (!s || !s.has_schedule) return "unknown";
  return s.is_open ? "open" : "closed";
}

/** "Opens Monday 08:00" / "Opens today 14:00" / "" when already open. */
export function nextOpenLabel(s: ScheduleStatus | null): string {
  if (!s || s.is_open || !s.next_open_at) return "";
  const when = new Date(s.next_open_at);
  if (Number.isNaN(when.getTime())) return "";

  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: RODRIGUES_TZ, weekday: "long", hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(when).map((p) => [p.type, p.value]));

  const todayName = new Intl.DateTimeFormat("en-GB", { timeZone: RODRIGUES_TZ, weekday: "long" })
    .format(nowInRodrigues());

  const day = parts.weekday === todayName ? "today" : parts.weekday;
  return `Opens ${day} ${parts.hour}:${parts.minute}`;
}

/** A sensible starting week for a shop that has never set hours: Mon–Sat 08:00–17:00, Sunday closed. */
export function defaultWeek(): DaySchedule[] {
  return WEEK_ORDER.map((weekday) => ({
    weekday,
    is_closed: weekday === 0,
    opens_at: weekday === 0 ? null : "08:00",
    closes_at: weekday === 0 ? null : "17:00",
    delivery_opens_at: null,
    delivery_closes_at: null,
    delivery_closed: false,
    note: null,
  }));
}
