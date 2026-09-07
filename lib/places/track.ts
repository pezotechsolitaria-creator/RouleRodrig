// ── Telling the server somebody looked ──────────────────────────────────────
//
// Fire-and-forget, and it must stay that way: the popup opens from a tap on a
// map pin, and nothing about drawing that popup may wait on a network call from
// a phone with one bar in Rodrigues.
//
// sendBeacon first, because a "get directions" press NAVIGATES AWAY — a fetch
// started in that click is cancelled when the page unloads, which is exactly
// the signal worth the most and the one most likely to be lost.

export type PlaceEventKind = "view" | "directions" | "save" | "share";

/** Per-tab memory, so re-opening the same popup does not count twice. */
const seen = new Set<string>();

export function trackPlace(placeId: string, kind: PlaceEventKind): void {
  if (typeof window === "undefined" || !placeId) return;

  // A view is deduplicated for the life of the tab; an intent (directions,
  // save, share) is not, because pressing it twice IS two decisions.
  if (kind === "view") {
    const key = `${placeId}:${kind}`;
    if (seen.has(key)) return;
    seen.add(key);
  }

  const body = JSON.stringify({ placeId, kind });
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/places/event", new Blob([body], { type: "application/json" }));
      return;
    }
  } catch {
    /* fall through to fetch */
  }
  try {
    void fetch("/api/places/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* a counter is never worth an error on a visitor's screen */
  }
}
