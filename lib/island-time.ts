// ── THE CLOCK ON THE ISLAND ─────────────────────────────────────────────────
//
// Every time a customer types into this site is a time on RODRIGUES. They are
// booking a taxi that will collect them from a road on this island; the clock
// they mean is the one on the wall at the pickup, never the one their phone
// happens to be set to.
//
// ── THE BUG THIS EXISTS FOR ─────────────────────────────────────────────────
//
// `<input type="datetime-local">` hands back a bare wall-clock string —
// "2026-10-01T14:30" — with no zone attached. `new Date(that).toISOString()`
// resolves it in the BROWSER'S zone, which for this site's actual audience is
// usually somewhere else entirely:
//
//   phone on Rodrigues time  14:30 -> 10:30Z -> driver told 14:30   correct
//   phone still on Paris     14:30 -> 12:30Z -> driver told 16:30   two hours late
//   phone still on London    14:30 -> 13:30Z -> driver told 17:30   three hours late
//
// A tourist who lands in the morning and books an afternoon transfer without
// having changed their phone clock gets a driver at the wrong hour, and every
// screen in the system agrees with the driver — because the stored instant IS
// the wrong one. Nothing downstream can detect it.
//
// ── WHY THE OFFSET IS COMPUTED AND NOT WRITTEN DOWN ─────────────────────────
//
// Mauritius is UTC+4 with no daylight saving, so `+ 4h` would be correct
// today. It has not always been: DST ran over the 2008-2009 summer and was
// abandoned. Asking Intl for the offset AT THAT INSTANT costs nothing, needs
// no maintenance, and is right through any future change to the tz database.

export const ISLAND_TZ = "Indian/Mauritius";

/** The zone's offset from UTC, in milliseconds, at a given instant. */
function offsetMsAt(instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ISLAND_TZ,
    hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(instant);

  const at = Object.fromEntries(
    parts.filter((p) => p.type !== "literal").map((p) => [p.type, Number(p.value)]),
  ) as Record<string, number>;

  // "24" is how hour12:false spells midnight in some ICU versions.
  const asIfUtc = Date.UTC(
    at.year, at.month - 1, at.day, at.hour % 24, at.minute, at.second,
  );
  return asIfUtc - instant.getTime();
}

/**
 * A wall-clock string the visitor typed → the instant it names ON THE ISLAND.
 *
 * Takes "YYYY-MM-DDTHH:mm" exactly as `<input type="datetime-local">` produces
 * it, and returns an ISO instant — never touching the device's own zone.
 *
 * Returns null for anything it cannot parse, so a caller can tell "no time
 * given" from "midnight UTC", which is the other way this goes wrong.
 */
export function islandIsoFromLocal(local: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(local.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;

  // Treat the wall clock as UTC, then step back by the island's offset. Done
  // twice because the offset itself depends on the instant: the first pass
  // lands close enough to read the right offset, the second applies it. With
  // no DST both passes agree; across a transition the second is the correct
  // one, and that is the whole reason for the second.
  const naive = Date.UTC(y, mo - 1, d, h, mi);
  let guess = naive - offsetMsAt(new Date(naive));
  guess = naive - offsetMsAt(new Date(guess));
  return new Date(guess).toISOString();
}

/**
 * Today on the island, as an ISO date.
 *
 * NOT `new Date().toISOString().slice(0, 10)`. The island is UTC+4, so between
 * midnight and 04:00 local that spelling returns YESTERDAY.
 */
export function islandDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ISLAND_TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

/**
 * The inverse: an instant → the wall clock a `datetime-local` input wants,
 * read on the island.
 *
 * The naive version builds the string from getFullYear()/getHours(), which are
 * the DEVICE'S wall clock — so an edit form opened on a phone in another zone
 * shows a different time from the one that was saved, and saving it back moves
 * the event.
 */
export function islandLocalFromIso(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // sv-SE formats as "YYYY-MM-DD HH:mm", one space from what the input wants.
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: ISLAND_TZ, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  }).format(d).replace(" ", "T");
}
