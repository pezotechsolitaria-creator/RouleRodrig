// ── When somebody needs the thing moved ─────────────────────────────────────
//
// The mirror of compute_delivery_window() in M152. The SERVER decides the real
// window — the client sends a choice, never a timestamp — but the screen still
// has to know the same rules, for one reason: it must not offer a slot the
// server is going to refuse. Being told "that time has already passed" AFTER
// tapping Continue is the worst version of this feature.
//
// So SLOT_HOURS below is the same table as the one in the migration, and a test
// asserts they agree. If they ever drift, a screen is offering something
// dispatch will not take.
//
// ── EVERYTHING HERE IS IN Indian/Mauritius, NEVER IN THE DEVICE'S ZONE ─────
// This is not pedantry on an island with one timezone. Roulé Rodrigues sells to
// tourists: somebody planning a delivery from Réunion, France or a plane is on a
// device set to somewhere else, and `new Date().getHours()` would then decide
// whether "this morning" is still available using the wrong clock. A visitor in
// Paris at 09:00 is at 11:00 in Rodrigues, and the morning slot has an hour left
// — their phone would say four.

import type { Language } from "@/lib/i18n";

export const ZONE = "Indian/Mauritius";

export type ScheduleKind = "asap" | "today" | "tomorrow" | "date";
export type TimeSlot = "any" | "morning" | "afternoon" | "evening";

export const SCHEDULE_KINDS: ScheduleKind[] = ["asap", "today", "tomorrow", "date"];
export const TIME_SLOTS: TimeSlot[] = ["any", "morning", "afternoon", "evening"];

/**
 * The same four rows as the `values` list in compute_delivery_window().
 *
 * Evening stops at 20:00 rather than midnight because it describes Rodrigues:
 * most roads are unlit, sunset sits between roughly 17:30 and 18:30 all year,
 * and a driver asked to find an unnumbered house up a track at 22:00 declines
 * or arrives badly. A slot nobody quotes on is worse than no slot.
 */
export const SLOT_HOURS: Record<TimeSlot, { from: number; to: number }> = {
  any: { from: 8, to: 20 },
  morning: { from: 8, to: 12 },
  afternoon: { from: 12, to: 17 },
  evening: { from: 17, to: 20 },
};

/** How far ahead a request may be booked. Mirrors the SQL horizon. */
export const MAX_DAYS_AHEAD = 90;

/** ASAP's tail, so an ASAP job stops being ASAP. Mirrors the SQL. */
export const ASAP_HOURS = 4;

// ── Reading the clock in Rodrigues, whatever the device thinks ─────────────

/** The local date on the island, as YYYY-MM-DD. */
export function islandDate(now: Date = new Date()): string {
  // en-CA gives ISO order; the timeZone option does the actual work. The same
  // trick lib/booking-pricing.ts already uses.
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONE }).format(now);
}

/** Hour of day on the island, 0–23, as a float so 14:30 is 14.5. */
export function islandHour(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  // "24" appears at midnight in some engines' 2-digit h23/h24 handling.
  return (h % 24) + m / 60;
}

/** YYYY-MM-DD, n days after the island's today. */
export function islandDatePlus(days: number, now: Date = new Date()): string {
  const [y, m, d] = islandDate(now).split("-").map(Number);
  // Built in UTC so no local-zone shift can move the date under us.
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

/** The latest date the server will accept. */
export function maxBookableDate(now: Date = new Date()): string {
  return islandDatePlus(MAX_DAYS_AHEAD, now);
}

/**
 * Is this slot still choosable for TODAY?
 *
 * The server refuses a window that has already ended. This is the same test,
 * run early enough to grey the chip instead of failing the submit.
 */
export function slotAvailableToday(slot: TimeSlot, now: Date = new Date()): boolean {
  return islandHour(now) < SLOT_HOURS[slot].to;
}

/** The slots still worth offering for a given choice. */
export function slotsFor(kind: ScheduleKind, now: Date = new Date()): TimeSlot[] {
  if (kind === "asap") return [];
  if (kind !== "today") return TIME_SLOTS;
  return TIME_SLOTS.filter((s) => slotAvailableToday(s, now));
}

/**
 * Is "today" worth offering at all?
 *
 * After 20:00 every slot has closed, so the choice would be a dead chip. The
 * form drops it rather than showing something that cannot be tapped.
 */
export function todayIsStillPossible(now: Date = new Date()): boolean {
  return slotsFor("today", now).length > 0;
}

// ── Saying it back ─────────────────────────────────────────────────────────

const SLOT_LABEL: Record<Language, Record<TimeSlot, string>> = {
  en: {
    any: "Any time",
    morning: "Morning",
    afternoon: "Afternoon",
    evening: "Evening",
  },
  fr: {
    any: "N’importe quand",
    morning: "Matin",
    afternoon: "Après-midi",
    evening: "Soir",
  },
  cr: {
    any: "Nenport ler",
    morning: "Gramatin",
    afternoon: "Apremidi",
    evening: "Aswar",
  },
};

export function slotLabel(slot: TimeSlot, lang: Language): string {
  return SLOT_LABEL[lang][slot];
}

/** "08:00 – 12:00", in island time. */
export function slotHoursLabel(slot: TimeSlot): string {
  const { from, to } = SLOT_HOURS[slot];
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(from)}:00 – ${pad(to)}:00`;
}

const RELATIVE: Record<Language, { today: string; tomorrow: string; now: string }> = {
  en: { today: "Today", tomorrow: "Tomorrow", now: "As soon as possible" },
  fr: { today: "Aujourd’hui", tomorrow: "Demain", now: "Dès que possible" },
  cr: { today: "Zordi", tomorrow: "Demen", now: "Pli vit posib" },
};

/**
 * The window, as a person reads it: "Tomorrow · 12:00 – 17:00".
 *
 * Takes the ISO strings the server returned rather than re-deriving from the
 * choice, so what is shown is what was actually stored.
 */
export function formatWindow(
  windowStart: string | null,
  windowEnd: string | null,
  scheduleKind: string | null,
  timeSlot: string | null,
  lang: Language,
  now: Date = new Date(),
): string {
  if (scheduleKind === "asap") return RELATIVE[lang].now;
  if (!windowStart) return "";

  const startDay = new Intl.DateTimeFormat("en-CA", { timeZone: ZONE }).format(
    new Date(windowStart),
  );
  const slot = (TIME_SLOTS as string[]).includes(timeSlot ?? "")
    ? (timeSlot as TimeSlot)
    : "any";

  let day: string;
  if (startDay === islandDate(now)) day = RELATIVE[lang].today;
  else if (startDay === islandDatePlus(1, now)) day = RELATIVE[lang].tomorrow;
  else {
    day = new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "fr-FR", {
      timeZone: ZONE,
      weekday: "short",
      day: "numeric",
      month: "short",
    }).format(new Date(windowStart));
  }

  const hours = windowEnd
    ? `${clock(windowStart)} – ${clock(windowEnd)}`
    : slotHoursLabel(slot);
  return `${day} · ${hours}`;
}

function clock(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

// ── How urgent, for the driver's board ─────────────────────────────────────

export type Urgency = "now" | "today" | "tomorrow" | "later";

/**
 * Which bucket a job falls in, for the badge on a driver's card.
 *
 * This is a LABEL, not the sort. The sort lives in SQL (M153) where it can use
 * an index and cannot disagree with itself between two clients.
 */
export function urgencyOf(windowStart: string | null, now: Date = new Date()): Urgency {
  if (!windowStart) return "later";
  const start = new Date(windowStart);
  if (start <= now) return "now";
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: ZONE }).format(start);
  if (day === islandDate(now)) return "today";
  if (day === islandDatePlus(1, now)) return "tomorrow";
  return "later";
}

const URGENCY_LABEL: Record<Language, Record<Urgency, string>> = {
  en: { now: "Needed now", today: "Today", tomorrow: "Tomorrow", later: "Later" },
  fr: { now: "Tout de suite", today: "Aujourd’hui", tomorrow: "Demain", later: "Plus tard" },
  cr: { now: "Bizin la mem", today: "Zordi", tomorrow: "Demen", later: "Pli tar" },
};

export function urgencyLabel(u: Urgency, lang: Language): string {
  return URGENCY_LABEL[lang][u];
}
