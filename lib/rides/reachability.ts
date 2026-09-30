// ── WILL ANY DRIVER HEAR ABOUT THIS RIDE? ───────────────────────────────────
//
// Asked once, when the booking arrives, because that is when the answer is
// cheapest to act on. RR-0E90AD was booked on 25 Sep 2026 for an airport
// pickup on the 30th. The only driver who takes airport runs had no WhatsApp
// alerts and no phone alerts, so the outcome was certain from the first
// second — and nothing said so until the ride gave up, 23 hours before the
// customer landed, with a message blaming the driver for not accepting.
//
// Pure: give it the roster and who is reachable, it gives back one line for
// the owner's booking alert, or null when there is nothing to warn about.

export type RosterDriver = {
  id: string;
  name: string | null;
  active: boolean | null;
  handles_taxi?: boolean | null;
  handles_airport?: boolean | null;
  handles_transfer?: boolean | null;
};

/**
 * Does this driver take this kind of ride at all? The same three rules
 * ride_candidates applies (M109: 'no airport runs', 'no transfers', 'no town
 * taxi'), so the warning and the engine cannot disagree about who is eligible.
 * A flag left null counts as yes, as it does in the engine's defaults.
 */
export function takesService(d: RosterDriver, service: string): boolean {
  if (service === "airport") return d.handles_airport !== false;
  if (service === "taxi") return d.handles_taxi !== false;
  if (service === "hotel" || service === "private" || service === "ferry") return d.handles_transfer !== false;
  return true;
}

function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * One line for the owner, or null.
 *
 * Availability is deliberately NOT considered: "Not today" is the owner's
 * switch and changes by the day, and the roster alarm already speaks for it
 * when a round finds nobody working. This is about the one thing that makes a
 * driver deaf no matter what day it is.
 */
export function bookingReachLine(
  drivers: RosterDriver[],
  reachable: Set<string>,
  service: string,
): string | null {
  const takers = drivers.filter((d) => takesService(d, service));
  const able = takers.filter((d) => d.active !== false);
  if (able.length === 0) {
    // Two different fixes, so two different sentences: switch somebody back
    // on, or tick "Takes" for this kind of ride.
    const off = [...new Set(takers.map((d) => (d.name ?? "").trim() || "A driver"))];
    return off.length > 0
      ? `⚠️ Every driver who takes this kind of ride is switched off (${listNames(off)}). Switch one back on, or ring a driver yourself.`
      : "⚠️ No driver on the list takes this kind of ride. Ring one yourself.";
  }
  if (able.some((d) => reachable.has(d.id))) return null;
  const names = [...new Set(able.map((d) => (d.name ?? "").trim() || "A driver"))];
  return (
    `⚠️ No driver will hear about this: ${listNames(names)} ${names.length === 1 ? "has" : "have"} ` +
    "no WhatsApp or phone alerts set up. Ring a driver, or send them their link " +
    "(rides page → Drivers → Send link)."
  );
}
