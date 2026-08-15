// ── Day and night as a property of the EXPERIENCE, not a theme ──────────────
//
// A stargazing trip is not a night-themed version of a lagoon trip; it is a
// different thing that only exists after dark. So this is a content dimension
// the owner sets per listing, and the switch on the page filters real inventory
// rather than recolouring the same list.
//
// Pure, so the island clock and the matching rules can be tested without a
// browser — the one thing that is genuinely easy to get wrong here is the time
// zone, and it is invisible when wrong from anywhere except Rodrigues.

export type TimeOfDay = "day" | "night" | "both";
export type Mode = "day" | "night";

/** Rodrigues does not observe DST, so the island is a fixed UTC+4. */
export const RODRIGUES_UTC_OFFSET_HOURS = 4;

/**
 * The hour of the day in Rodrigues, 0–23.
 *
 * Computed from the UTC clock rather than the visitor's, deliberately: a
 * traveller browsing from Paris before they fly should see the island's
 * evening, not their own afternoon. The whole point of the default is "what is
 * happening THERE right now".
 */
export function rodriguesHour(now: Date = new Date()): number {
  return (now.getUTCHours() + RODRIGUES_UTC_OFFSET_HOURS) % 24;
}

/**
 * Which mode to open in.
 *
 * 06:00–17:59 is day; 18:00–05:59 is night. Rodrigues sits at 19°S, so sunset
 * moves by roughly an hour across the year — this is deliberately a simple
 * boundary rather than a solar calculation, because the cost of being wrong is
 * one tap on a control that is always visible, and a sunrise table is a lot of
 * machinery to save that tap.
 */
export function defaultMode(now: Date = new Date()): Mode {
  const h = rodriguesHour(now);
  return h >= 6 && h < 18 ? "day" : "night";
}

/**
 * Does this listing belong in the mode being shown?
 *
 * `both` and an UNSET value always match. Unset is the important one: every
 * listing that existed before this feature has no value, and they must not all
 * vanish the moment the switch appears. The owner opts a listing INTO being
 * night-only; nothing is hidden by default.
 */
export function matchesMode(value: TimeOfDay | null | undefined, mode: Mode): boolean {
  if (!value || value === "both") return true;
  return value === mode;
}

/**
 * The cue shown beside the switch, so the default never looks like a bug.
 *
 * Somebody arriving to a dark page at 8pm should be told why. Without this the
 * page just looks like it picked a theme at random.
 */
export function modeCue(mode: Mode, lang: "en" | "fr" | "cr" = "en"): string {
  if (lang === "fr") {
    return mode === "night"
      ? "Il fait nuit à Rodrigues — voici ce qui se passe ce soir"
      : "Il fait jour à Rodrigues";
  }
  if (lang === "cr") {
    return mode === "night"
      ? "Fer nwar Rodrigues — ala seki ena aswar"
      : "Fer zour Rodrigues";
  }
  return mode === "night"
    ? "It's night in Rodrigues — here's what's on after dark"
    : "It's daytime in Rodrigues";
}

/**
 * How many listings each mode would show.
 *
 * Used to keep the switch honest: a Night button that leads to an empty page is
 * worse than no button, so the caller can label or disable it when a mode has
 * nothing in it.
 */
export function countByMode<T>(
  items: T[],
  read: (item: T) => TimeOfDay | null | undefined,
): { day: number; night: number } {
  return {
    day: items.filter((i) => matchesMode(read(i), "day")).length,
    night: items.filter((i) => matchesMode(read(i), "night")).length,
  };
}
