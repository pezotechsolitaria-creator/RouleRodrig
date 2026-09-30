// ── WHAT THE SITE SAYS IT IS ────────────────────────────────────────────────
//
// Two sentences that describe the whole business, kept here as pure functions
// because the files that print them cannot be tested directly: the homepage is
// a server component that reads Supabase, and a root layout may only export
// what Next allows.
//
//   · homeDescription — the homepage's visible `about` block AND the #business
//     AutoRental description in its JSON-LD. What an AI Overview paraphrases
//     when asked "what is Roule Rodrigues".
//   · defaultMetaDescription — the root layout's fallback meta description, for
//     every page that does not write its own.
//
// SEO audit 2026-09-29 C4: the old description gave no base, no car price and
// no way to book or pay. It now answers WHO, WHERE, HOW MUCH, HOW TO PAY and
// WHEN, and every figure comes from the caller's live data — the fleet, the
// contact block. A value that is missing prints no number rather than a
// remembered one: the Rs 599 the layout used to publish while every page showed
// Rs 699 is the drift this is built to prevent.

import type { SiteContent } from "@/lib/defaults";
import { isSeedContent } from "@/lib/llms-txt";
import { categoryFrom } from "@/lib/browse-copy";

/**
 * The cheapest priced scooter and car a day, over the vehicle categories the
 * homepage hub shows (enabled ones — the numbers its tiles print), or null.
 *
 * Null for both when the fleet is the seed. getContent() never throws on a
 * failed read: it answers DEFAULT_CONTENT, whose fleet says "From Rs 800" and
 * "From Rs 600" — prices nobody is charged — so without this guard a DB hiccup
 * published "from Rs 600/day" as the homepage snippet, under the real Rs 699
 * (SEO audit 2026-09-29 C4). isSeedContent is the check lib/llms-data.ts
 * already applies to the same fleet for llms.txt. The per-category figure is
 * lib/browse-copy.ts's categoryFrom, the one /browse prints.
 */
export function rentalFromPrices(
  content: Pick<SiteContent, "fleet" | "vehicleCategories">,
): { scooterFrom: number | null; carFrom: number | null } {
  const fleet = content.fleet ?? [];
  if (isSeedContent({ fleet })) return { scooterFrom: null, carFrom: null };
  const cats = content.vehicleCategories ?? [];
  return {
    scooterFrom: categoryFrom(fleet, "scooter", cats),
    carFrom: categoryFrom(fleet, "car", cats),
  };
}

/** The lower of the two, for the one-figure default description; or null. */
export function cheapestDailyRate(
  content: Pick<SiteContent, "fleet" | "vehicleCategories">,
): number | null {
  const { scooterFrom, carFrom } = rentalFromPrices(content);
  const rates = [scooterFrom, carFrom].filter((n): n is number => n != null);
  return rates.length ? Math.min(...rates) : null;
}

export type HomeFacts = {
  /** The village, from content.contact.location ("Baie Aux Huîtres,Rodrigues"). */
  locality?: string | null;
  /** Cheapest priced scooter a day, whole rupees; null when none is priced. */
  scooterFrom?: number | null;
  /** Cheapest priced car a day, whole rupees; null when none is priced. */
  carFrom?: number | null;
  /** content.contact.hours, exactly as the owner typed it. */
  hours?: string | null;
  /** The food catalogue has at least one dish on sale. */
  foodOnSale?: boolean;
  /** content.foodConcierge.enabled — /food/concierge still books tables. */
  conciergeEnabled?: boolean;
};

const rs = (n: number) => `Rs ${n.toLocaleString("en-US")}`;

/** A sentence the owner typed, closed with one full stop. */
const sentence = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);

/** "scooters from Rs 699 and cars from Rs 1,899 a day" — or fewer figures, never a guessed one. */
function whatWeRent(scooterFrom?: number | null, carFrom?: number | null): string {
  const s = scooterFrom && scooterFrom > 0 ? scooterFrom : null;
  const c = carFrom && carFrom > 0 ? carFrom : null;
  if (s && c) return `scooters from ${rs(s)} and cars from ${rs(c)} a day`;
  if (s) return `scooters from ${rs(s)} a day, and cars`;
  if (c) return `cars from ${rs(c)} a day, and scooters`;
  return "scooters and cars";
}

export function homeDescription(f: HomeFacts): string {
  const village = (f.locality ?? "").trim();
  // "based in Rodrigues on Rodrigues Island" says nothing; only a real village.
  const where =
    village && village.toLowerCase() !== "rodrigues"
      ? `based in ${village} on Rodrigues Island (Mauritius)`
      : "on Rodrigues Island (Mauritius)";

  // Payment, per lib/bookings/in-person.ts and the manage-booking page: online
  // once the dates are confirmed, or cash in person when the owner agrees it
  // (M220). Asking for cash is a request, so it is worded as one.
  const rent =
    `Roule Rodrigues, ${where}, rents ${whatWeRent(f.scooterFrom, f.carFrom)}, ` +
    "delivered to where you stay, with no minimum rental. " +
    "You request your dates online and we confirm them; you then pay online to confirm — " +
    "by bank transfer, MCB Juice or PayPal — or, when we agree it, in cash in person.";

  const hours = f.hours?.trim() ? ` ${sentence(f.hours.trim())}` : "";

  const guide =
    " It is also a free island guide: a trip planner, an interactive map of beaches and " +
    "viewpoints, recommended places to stay and things to do, and Ti Roulé — an AI island " +
    "guide answering in English, French and Creole.";

  // The concierge still exists and still books tables (/food/concierge), so it
  // stays — beside the food that is actually sold on the site now, which the
  // old sentence never mentioned. Each clause only while it is true.
  const food =
    f.foodOnSale && f.conciergeEnabled
      ? " You can order food from a local kitchen ahead of time, paid in cash, or ask our WhatsApp food concierge to book you a table."
      : f.foodOnSale
        ? " You can order food from a local kitchen ahead of time, paid in cash."
        : f.conciergeEnabled
          ? " A WhatsApp food concierge books your table."
          : "";

  return `${rent}${hours}${guide}${food}`;
}

/**
 * The root layout's default meta description, at most 155 characters.
 *
 * It printed FLEET_PRICE_FALLBACK — a constant, not the fleet — and ran to 159.
 * The layout already reads site content for its share image, so the real
 * cheapest daily rate costs no extra round trip.
 */
export function defaultMetaDescription(f: {
  fromPrice?: number | null;
  conciergeEnabled?: boolean;
}): string {
  const from = f.fromPrice && f.fromPrice > 0 ? ` from ${rs(f.fromPrice)}/day` : "";
  const extras = f.conciergeEnabled
    ? "a free island guide, trip planner and WhatsApp food concierge"
    : "a free island guide and trip planner";
  return `Scooter and car rental in Rodrigues${from}, no minimum. Plus ${extras}.`;
}
