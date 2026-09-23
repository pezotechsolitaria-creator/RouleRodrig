// ── "FRIDAY 25 SEPTEMBER, 12:00–12:30" — ONE WAY TO SAY IT (M216) ───────────
//
// A booked food order carries orders.pickup_slot, a 30-minute tstzrange. Until
// M216 nothing downstream ever showed it: the cook's board, the emails, the
// customer's order page and the owner's alerts all printed the 7-day cash hold
// instead ("reserved until Wed 30 Sep"). With Chez Banane taking orders one to
// two days ahead, the day is the whole message — so every surface formats it
// here, the same way, instead of each inventing its own.
//
// The slot reaches the app in two shapes, and both are handled:
//   · PostgREST range text  ["2026-09-25 08:00:00+00","2026-09-25 08:30:00+00")
//   · RPC jsonb bounds       "2026-09-25T08:00:00+00:00"
// The first defeated components/merchant/home/WorkQueue.tsx: it replaced the
// space with "T" and V8 cannot parse a "+00" offset with no minutes, so the
// label silently vanished. Nothing had ever had a slot, so nobody saw it.
//
// Rodrigues keeps UTC+4 all year (no daylight saving), so local time is a fixed
// offset — no Intl time-zone data, and the same answer on the server, in a
// browser set to Paris, and in a test.

import type { Language } from "@/lib/i18n";

export type SlotWindow = { from: Date; to: Date };

const OFFSET_MS = 4 * 60 * 60 * 1000; // Indian/Mauritius, UTC+4, no DST

/** A timestamp in either shape Postgres hands us, or null. */
export function parseInstant(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  let s = raw.trim().replace(/^"|"$/g, "");
  // "2026-09-25 08:00:00+00" → "2026-09-25T08:00:00+00:00"
  s = s.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** A PostgREST tstzrange string, or null. */
export function parseSlotRange(range: string | null | undefined): SlotWindow | null {
  if (!range) return null;
  const parts = range.match(/[[(]"?([^",)\]]+)"?\s*,\s*"?([^",)\]]+)"?[)\]]/);
  if (!parts) return null;
  return slotFromBounds(parts[1], parts[2]);
}

/** Two ISO bounds (kitchen_dashboard, lookup_order), or null. */
export function slotFromBounds(from: string | null | undefined, to: string | null | undefined): SlotWindow | null {
  const f = parseInstant(from);
  if (!f) return null;
  const t = parseInstant(to) ?? new Date(f.getTime() + 30 * 60 * 1000);
  return { from: f, to: t };
}

/** The Rodrigues calendar date of an instant, "YYYY-MM-DD". */
export function rodriguesDay(d: Date): string {
  return new Date(d.getTime() + OFFSET_MS).toISOString().slice(0, 10);
}

function hm(d: Date): string {
  const l = new Date(d.getTime() + OFFSET_MS);
  return `${String(l.getUTCHours()).padStart(2, "0")}:${String(l.getUTCMinutes()).padStart(2, "0")}`;
}

const WORDS: Record<Language, {
  today: string;
  tomorrow: string;
  weekdays: readonly string[];
  months: readonly string[];
}> = {
  en: {
    today: "Today",
    tomorrow: "Tomorrow",
    weekdays: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    months: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  },
  fr: {
    today: "Aujourd’hui",
    tomorrow: "Demain",
    weekdays: ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"],
    months: ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"],
  },
  cr: {
    today: "Zordi",
    tomorrow: "Demin",
    weekdays: ["Dimans", "Lindi", "Mardi", "Merkredi", "Zedi", "Vandredi", "Samdi"],
    months: ["Zanvie", "Fevriye", "Mars", "Avril", "Me", "Zin", "Zilye", "Out", "Septam", "Oktob", "Novam", "Desam"],
  },
};

/** "Friday 25 September" / "vendredi 25 septembre" / "Vandredi 25 Septam". */
export function slotDayWords(d: Date, lang: Language = "en"): string {
  const w = WORDS[lang] ?? WORDS.en;
  const l = new Date(d.getTime() + OFFSET_MS);
  return `${w.weekdays[l.getUTCDay()]} ${l.getUTCDate()} ${w.months[l.getUTCMonth()]}`;
}

/** "12:00–12:30". */
export function slotTimes(w: SlotWindow): string {
  return `${hm(w.from)}–${hm(w.to)}`;
}

/**
 * "Friday 25 September, 12:00–12:30".
 *
 * With `now`, today and tomorrow are named as such — "Tomorrow, 12:00–12:30"
 * — and every other day keeps its weekday AND date, because "Friday" alone is
 * ambiguous a week out and a customer walking to a beach deserves no guessing.
 * Without `now` (an email that may be read days later) the date is always
 * spelled out.
 */
export function formatSlot(w: SlotWindow, lang: Language = "en", now?: Date): string {
  const words = WORDS[lang] ?? WORDS.en;
  let day = slotDayWords(w.from, lang);
  if (now) {
    const d = rodriguesDay(w.from);
    if (d === rodriguesDay(now)) day = words.today;
    else if (d === rodriguesDay(new Date(now.getTime() + 24 * 60 * 60 * 1000))) day = words.tomorrow;
  }
  return `${day}, ${slotTimes(w)}`;
}

/**
 * formatSlot for the MIDDLE of a sentence: "Booked for tomorrow, 12:00–12:30",
 * not "Booked for Tomorrow". Only the relative words change case — a weekday
 * keeps whatever capital its language gives it.
 */
export function formatSlotInSentence(w: SlotWindow, lang: Language = "en", now?: Date): string {
  const s = formatSlot(w, lang, now);
  const words = WORDS[lang] ?? WORDS.en;
  for (const rel of [words.today, words.tomorrow]) {
    if (s.startsWith(rel)) return rel.toLowerCase() + s.slice(rel.length);
  }
  return s;
}

/** Is the slot's Rodrigues date today? */
export function isSlotToday(w: SlotWindow, now: Date = new Date()): boolean {
  return rodriguesDay(w.from) === rodriguesDay(now);
}

/** Is the slot on a LATER Rodrigues date than today? */
export function isSlotLaterDay(w: SlotWindow, now: Date = new Date()): boolean {
  return rodriguesDay(w.from) > rodriguesDay(now);
}
