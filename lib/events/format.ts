// Event date/availability wording, shared by the listing, the detail page and
// (later) the ticket. One place, because "Sat 22 Aug · 19:00" appearing three
// slightly different ways is how a product starts to feel amateur.

/**
 * Island time, always.
 *
 * The venue is in Rodrigues; the buyer frequently is not. A tourist booking
 * from Europe must read the door time as the ISLAND will experience it, not as
 * their own phone would render it — otherwise they arrive four hours out. The
 * event's IANA zone is stored per event (events.timezone) precisely so this can
 * be honoured rather than assumed.
 */
export function eventDateTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short", day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit", hour12: false, timeZone,
  }).format(new Date(iso));
}

export function eventDateOnly(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long", day: "numeric", month: "long", timeZone,
  }).format(new Date(iso));
}

export function eventTimeOnly(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit", minute: "2-digit", hour12: false, timeZone,
  }).format(new Date(iso));
}

/**
 * Honest scarcity.
 *
 * The brief is explicit: communicate scarcity truthfully, never manufacture
 * urgency and never invent viewer counts. So every string below is a direct
 * statement of `remaining`, and the only judgement is at what point a number
 * becomes more useful phrased as a warning. Nothing here can say "almost gone"
 * about an event with 300 seats left.
 */
export function availabilityLabel(remaining: number, capacity: number): {
  text: string;
  tone: "gone" | "low" | "ok";
} {
  if (remaining <= 0) return { text: "Sold out", tone: "gone" };
  if (remaining === 1) return { text: "Last ticket", tone: "low" };
  if (remaining <= 5) return { text: `Last ${remaining} tickets`, tone: "low" };
  // Only call it "almost sold out" when it genuinely is, by proportion AND by
  // count — 20 left out of 5,000 is not the same story as 20 out of 25.
  if (remaining <= 20 && capacity > 0 && remaining / capacity <= 0.1) {
    return { text: `Only ${remaining} left`, tone: "low" };
  }
  return { text: `${remaining} tickets remaining`, tone: "ok" };
}

/** "in 3 days" / "today" / "tomorrow" — for the card, next to the real date. */
export function countdownLabel(iso: string, now = Date.now()): string | null {
  const diff = new Date(iso).getTime() - now;
  if (diff <= 0) return null;
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days <= 14) return `In ${days} days`;
  return null;
}
