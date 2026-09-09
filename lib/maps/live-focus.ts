// ── SENDING THE DESK'S MAP TO A JOB ─────────────────────────────────────────
//
// The dispatch screens knew where a job was and could only hand it to Google.
// Google shows the spot and nothing else — not which of your drivers is two
// minutes away from it, which is the actual question a dispatcher is asking.
//
// So a location on the desk now opens /admin/live focused on that point, and
// the operator sees the job pin sitting among the fleet.
//
// The contract lives here rather than in either screen because BOTH ends have
// to agree on it: the link that is built, and the page that reads it back. One
// file, one set of parameter names, and a test that round-trips them.

/** A point worth putting on the map, with whatever the row called it. */
export type FocusPoint = { lat: number; lng: number; label: string | null };

export type MapFocus = {
  pickup: FocusPoint | null;
  dropoff: FocusPoint | null;
};

/** Rodrigues, generously bounded. A coordinate outside this is a bug in the
 *  caller or a hand-edited URL, and framing the map on the Atlantic helps
 *  nobody — so it is dropped rather than drawn. */
const BOUNDS = { minLat: -20.2, maxLat: -19.2, minLng: 62.9, maxLng: 63.9 };

function usable(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    // 0,0 is the Gulf of Guinea — always a missing value that survived a `?? 0`.
    !(lat === 0 && lng === 0) &&
    lat >= BOUNDS.minLat &&
    lat <= BOUNDS.maxLat &&
    lng >= BOUNDS.minLng &&
    lng <= BOUNDS.maxLng
  );
}

/** "lat,lng" -> a point, or null. Tolerant of spaces, strict about the rest. */
function parsePoint(raw: string | null | undefined, label: string | null): FocusPoint | null {
  const text = (raw ?? "").trim();
  if (!text) return null;
  const [a, b] = text.split(",");
  const lat = Number((a ?? "").trim());
  const lng = Number((b ?? "").trim());
  if (!usable(lat, lng)) return null;
  return { lat, lng, label: label?.trim() || null };
}

/**
 * Build the href a dispatch row links to.
 *
 * Returns null when there is nothing to show, so a caller can fall back to
 * plain text rather than rendering a link to an empty map.
 */
export function liveMapHref(input: {
  lat?: number | null;
  lng?: number | null;
  label?: string | null;
  toLat?: number | null;
  toLng?: number | null;
  toLabel?: string | null;
}): string | null {
  const p = new URLSearchParams();
  const hasFrom =
    input.lat != null && input.lng != null && usable(input.lat, input.lng);
  const hasTo =
    input.toLat != null && input.toLng != null && usable(input.toLat, input.toLng);
  if (!hasFrom && !hasTo) return null;

  if (hasFrom) {
    p.set("at", `${input.lat},${input.lng}`);
    if (input.label?.trim()) p.set("label", input.label.trim().slice(0, 80));
  }
  if (hasTo) {
    p.set("to", `${input.toLat},${input.toLng}`);
    if (input.toLabel?.trim()) p.set("toLabel", input.toLabel.trim().slice(0, 80));
  }
  return `/admin/live?${p.toString()}`;
}

/**
 * Read it back on the page.
 *
 * Takes the raw searchParams shape Next hands a server component, so the page
 * does no parsing of its own. Never throws: a hand-edited or truncated URL
 * yields nulls and the map simply opens as it always did.
 */
export function readMapFocus(
  sp: Record<string, string | string[] | undefined> | undefined,
): MapFocus {
  const one = (k: string): string | null => {
    const v = sp?.[k];
    return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
  };
  return {
    pickup: parsePoint(one("at"), one("label")),
    dropoff: parsePoint(one("to"), one("toLabel")),
  };
}

/** Is there anything to draw? The map uses this to decide whether to render
 *  itself even when no driver is sharing a position. */
export function hasFocus(f: MapFocus | null | undefined): boolean {
  return Boolean(f?.pickup || f?.dropoff);
}
