// Fleet ID → display name.
//
// The bookings table stores the fleet ID ("burgman") because availability
// checks and asset assignment match on it, so the column must stay an ID.
// Nobody outside the database should ever see that slug though — customers get
// "BURGMAN 125cc" in their emails, and the owner gets it in WhatsApp alerts.
//
// Cached briefly because the nightly cron resolves a whole batch in one run.
import { getContent } from "./content";

let cache: { map: Record<string, string>; at: number } | null = null;
const TTL = 60_000;

async function fleetMap(): Promise<Record<string, string>> {
  if (cache && Date.now() - cache.at < TTL) return cache.map;
  const content = await getContent();
  const map: Record<string, string> = {};
  for (const f of content.fleet) if (f.id && f.name) map[f.id] = f.name;
  cache = { map, at: Date.now() };
  return map;
}

/** Resolve a fleet ID to its display name. Returns the input unchanged if it's
 *  already a name, is unknown, or if content can't be loaded — a slightly ugly
 *  message always beats a message that never sends. */
export async function vehicleName(idOrName: string): Promise<string> {
  if (!idOrName) return idOrName;
  try {
    return (await fleetMap())[idOrName] ?? idOrName;
  } catch {
    return idOrName;
  }
}

/** Same, for an object carrying a `scooter` field. */
export async function withVehicleName<T extends { scooter: string }>(b: T): Promise<T> {
  const name = await vehicleName(b.scooter);
  return name === b.scooter ? b : { ...b, scooter: name };
}
