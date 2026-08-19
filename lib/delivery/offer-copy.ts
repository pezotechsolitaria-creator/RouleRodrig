// ── The words a driver reads when a job is offered ──────────────────────────
//
// Extracted from lib/delivery/notify.ts for the reason escalation-copy.ts was:
// notify.ts imports the privileged Supabase client, so nothing in it can be
// unit tested — and this string decides how far a customer's location travels,
// which is not a decision that should sit inline in a fan-out function.
//
// ── WHERE THE LOCATION GOES, AND WHY ───────────────────────────────────────
// The offer carries BOTH the drop-off note and the map pin. That is the
// owner's explicit decision, made after being shown the trade-off, and it is
// recorded here because the trade-off is real and the next person to read this
// file deserves to know it was weighed rather than missed:
//
//   FOR — a driver cannot judge a job without knowing where it ends. The note
//         alone is optional and null more often than not (checkout collects a
//         GPS pin and says so; the text box beside it is skippable), so an
//         offer carrying only the note would frequently carry no location at
//         all. driver_dashboard's offers block ALREADY returns dropoff_note to
//         every driver holding a live offer, and /driver renders it
//         pre-acceptance — so the note was never withheld, the message was
//         simply less useful than the page it links to.
//
//   AGAINST — the offer fans out to several drivers and only one wins. The
//         losing drivers' offer SCREEN expires and disappears the moment
//         somebody accepts; a WhatsApp does not. It sits on the handset,
//         forwards in two taps, and is searchable long after that driver has
//         left the platform. A 5-decimal pin is a doorstep to about a metre.
//
// The owner chose reach over that. Recorded, not re-litigated.

export type DeliveryOfferFacts = {
  shop: string;
  /** "Rs 120", or null when the earning is not set. */
  pay?: string | null;
  /** deliveries.dropoff_note — the customer's own words. OPTIONAL. */
  dropoffNote?: string | null;
  /** A ready-made maps URL, or null when there is no usable pin. Built by the
   *  caller so this module stays free of link-shape knowledge. */
  mapUrl?: string | null;
  driverPageUrl: string;
};

/** Shared by the push notification and the WhatsApp, so the two cannot drift. */
export function deliveryOfferTitle(f: DeliveryOfferFacts): string {
  return f.pay ? `New delivery — ${f.pay}` : "New delivery available";
}

export function deliveryOfferLines(f: DeliveryOfferFacts): string[] {
  const note = f.dropoffNote?.trim();
  const map = f.mapUrl?.trim();
  return [
    `Pick up from ${f.shop}.`,
    // The whole line goes or none of it. A bare "Drop-off:" reads as a bug,
    // and with an optional note it would be the common case.
    note ? `Drop-off: ${note}` : null,
    // "Map", not "Address": the column is a free-text note and the checkout box
    // is labelled "Landmark or directions", so calling either one an address
    // would misdescribe what the customer actually typed.
    map ? `Map: ${map}` : null,
    "Open the driver page to accept — first to accept gets it.",
    f.driverPageUrl,
  ].filter((l): l is string => Boolean(l));
}
