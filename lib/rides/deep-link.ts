import type { Language } from "@/lib/i18n";

// ── ONE DEFINITION OF "TAKE ME THERE" ───────────────────────────────────────
//
// The island guide shows every place twice: as a pin on the map, and as a row
// in the list under it. The list is the half most people actually scroll — a
// phone shows one map and then twenty rows — so a booking link that exists only
// in the map popup is a link most visitors never see.
//
// Both surfaces now build the URL here rather than each writing their own. The
// receiving end, app/taxi/book/page.tsx, validates every part of it, and the
// two ends drifting apart is exactly the failure a shared builder prevents:
// nothing warns you when a query parameter is renamed on one side only.

/**
 * "Get a taxi here" — the wording matters in all three.
 *
 * "Here" is load-bearing: the link books a ride to THIS place, not a taxi in
 * general, and a label that loses that reads as a link to the taxi page.
 */
export const TAXI_HERE_LABEL: Record<Language, string> = {
  en: "Get a taxi here",
  fr: "Un taxi jusqu’ici",
  cr: "Enn taxi ziska isi",
};

/**
 * A booking link that arrives with the destination already answered.
 *
 * `name` must be the LOCALIZED name — the string the reader actually saw on
 * screen. Sending the English row behind it would book a French visitor to a
 * place they never read.
 *
 * Encoded because real Rodriguan place names break a query string: "Trou
 * d'Argent" carries an apostrophe and "Baie aux Huîtres" a circumflex.
 */
export function taxiToPlaceHref(
  name: string,
  lat: number,
  lng: number,
): string {
  const q = new URLSearchParams({
    service: "taxi",
    to: name,
    toLat: String(lat),
    toLng: String(lng),
  });
  return `/taxi/book?${q.toString()}`;
}
