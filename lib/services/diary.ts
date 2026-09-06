import { RODRIGUES_TZ } from "@/lib/schedule";

// ── The vocabulary of a booked day ──────────────────────────────────────────
//
// The owner: "now build the booked slots and calendar for services."
//
// The DECISION half — which times are free, whether a booking may be taken —
// lives in Postgres (service_slots and book_service_slot), for the reason
// lib/schedule.ts states at the top of itself: anything that could change
// whether a booking is accepted belongs in SQL, or the UI and the database
// drift and only one of them is right. This module is the presentation half.
//
// ── WHY A SERVICE DIARY IS NOT AN ORDER LIST ───────────────────────────────
// An order is a thing that happened. A booking is a promise about a moment that
// has not arrived, and the only question a provider asks of it is "what does
// Thursday look like". So everything here is organised by DAY, and a day knows
// three things an order queue never has to: whether they are open, how much of
// the day is already promised, and what is left.

export const BOOKING_STATUSES = ["booked", "done", "cancelled", "no_show"] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export type StatusVocab = {
  label: string;
  /** What the provider presses to put a booking into this state. */
  action: string;
  /**
   * Does this booking still hold time? Only `booked` does. A cancellation
   * gives the slot straight back, and that is enforced in service_slots by
   * counting `status = 'booked'` alone — this flag must agree with it.
   */
  holdsTime: boolean;
};

export const STATUS_VOCAB: Record<BookingStatus, StatusVocab> = {
  booked: { label: "Booked", action: "Put back", holdsTime: true },
  done: { label: "Done", action: "Done", holdsTime: false },
  cancelled: { label: "Cancelled", action: "Cancel", holdsTime: false },
  // Not the same as a cancellation, and worth its own word: a customer who
  // does not turn up has cost the provider the slot anyway, and a provider who
  // cannot tell the two apart cannot decide whether to ask for a deposit.
  no_show: { label: "Did not come", action: "No-show", holdsTime: false },
};

/** Why a day offered nothing. Mirrors the `reason` column of service_slots. */
export const SLOT_REASON: Record<string, string> = {
  no_hours: "No opening hours set for this day yet.",
  closed: "Closed.",
  full: "Fully booked.",
};

export type DiaryBooking = {
  id: string;
  service: string;
  startsAt: string;
  endsAt: string;
  status: BookingStatus;
  customerName: string;
  customerPhone: string;
  note: string | null;
  source: "provider" | "customer" | "admin";
};

export type DiaryDay = {
  date: string;
  isClosed: boolean;
  opensAt: string | null;
  closesAt: string | null;
  bookings: DiaryBooking[];
  /** Minutes committed by bookings that still hold time. */
  bookedMinutes: number;
};

export type Diary = {
  from: string;
  days: number;
  concurrentJobs: number;
  slotMinutes: number;
  trade: string;
  calendar: DiaryDay[];
};

/** Minutes between two "HH:MM[:SS]" wall-clock times, or null if either is absent. */
export function minutesBetween(opensAt: string | null, closesAt: string | null): number | null {
  if (!opensAt || !closesAt) return null;
  const toMin = (t: string) => {
    const [h, m] = t.split(":");
    const hours = Number(h);
    const mins = Number(m);
    return Number.isFinite(hours) && Number.isFinite(mins) ? hours * 60 + mins : null;
  };
  const a = toMin(opensAt);
  const b = toMin(closesAt);
  if (a == null || b == null) return null;
  return b > a ? b - a : null;
}

/**
 * How full a day is, 0..1, or null when the question does not apply.
 *
 * CAPACITY IS OPEN MINUTES TIMES BAYS. A car wash with two bays open for nine
 * hours has eighteen hours to sell, and measuring against nine would show a
 * normal Saturday as 140% booked — a bar that reads "over capacity" on a day
 * the provider is coping fine is a bar they will learn to ignore.
 *
 * A closed day returns null rather than 0. They are not the same fact, and a
 * closed Sunday drawn as an empty bar reads as a day nobody wanted.
 */
export function dayLoad(day: DiaryDay, concurrentJobs: number): number | null {
  if (day.isClosed) return null;
  const open = minutesBetween(day.opensAt, day.closesAt);
  if (open == null || open <= 0) return null;
  const capacity = open * Math.max(1, concurrentJobs);
  return Math.min(1, day.bookedMinutes / capacity);
}

/** "09:00" for a timestamp, in Rodrigues wall-clock time. */
export function clockAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: RODRIGUES_TZ,
  });
}

/** "09:00 – 09:30". The range, because a duration is the point of a booking. */
export function clockRange(startsAt: string, endsAt: string): string {
  const a = clockAt(startsAt);
  const b = clockAt(endsAt);
  return a && b ? `${a} – ${b}` : a || b;
}

/**
 * "1 h 30" rather than "90 min". A provider reads the diary in hours once a job
 * passes an hour, and 180 min is a number you have to stop and divide.
 */
export function durationText(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`;
}

/** "Mon 8 Sep" — the label on a day chip. */
export function dayLabel(date: string): string {
  // A bare date is midnight UTC; Rodrigues is UTC+4, so formatting it back in
  // Rodrigues time is safe, while formatting a UTC-midnight in a NEGATIVE
  // offset zone would show the day before. Pinned to the island either way.
  const d = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: RODRIGUES_TZ,
  });
}

/** Today's date on the island, as "YYYY-MM-DD". */
export function todayOnIsland(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: RODRIGUES_TZ });
}
