// ── ONE LIST, READ BY BOTH SIDES ────────────────────────────────────────────
//
// The visible "Before you book" panel and the FAQPage structured data on the
// same page must describe the SAME questions. Google's guideline is explicit
// that FAQ markup requires the content to be visible on the page carrying it,
// and the failure mode is silent: markup drifts, the panel changes, and the
// page is quietly claiming answers a visitor cannot read.
//
// So the selection lives here, in a plain module, and both import it. It is NOT
// in components/RentalConditions.tsx because that file is "use client" — a
// server component importing a constant from a client module is a build-time
// trap this codebase has hit before.

/** FAQ ids that answer "am I allowed to rent this, and what am I agreeing to".
 *  Ordered the way a renter asks them, not the way they sit in the FAQ. */
export const CONDITION_IDS = [
  "age",
  "license",
  "insurance",
  // The money question, asked as early as the licence one and answered
  // nowhere on the site until the owner supplied the figure on 2026-09-10.
  "deposit",
  "helmet",
  "fuel",
  "mileage",
  "delivery",
  "breakdown",
  "faq-min-duration",
] as const;

export const CONDITION_LABELS: Record<string, { en: string; fr: string; cr: string }> = {
  age: { en: "Minimum age", fr: "Âge minimum", cr: "Laz minimum" },
  license: { en: "Licence", fr: "Permis", cr: "Permi" },
  insurance: { en: "Insurance", fr: "Assurance", cr: "Lasirans" },
  helmet: { en: "Helmet", fr: "Casque", cr: "Kask" },
  fuel: { en: "Fuel", fr: "Carburant", cr: "Karburan" },
  delivery: { en: "Delivery", fr: "Livraison", cr: "Livrezon" },
  breakdown: { en: "If it breaks down", fr: "En cas de panne", cr: "Si li gagn pann" },
  deposit: { en: "Deposit", fr: "Caution", cr: "Kosyon" },
  mileage: { en: "Mileage", fr: "Kilométrage", cr: "Kilometraz" },
  "faq-min-duration": { en: "Minimum rental", fr: "Durée minimum", cr: "Dire minimum" },
};

export type ConditionItem = { id: string; question: string; answer: string };

/**
 * Conditions that only apply to a scooter.
 *
 * /browse/car answered "Do scooters come with a helmet?" — in the BEFORE YOU
 * BOOK panel directly above the car booking form, and inside the page's own
 * FAQPage structured data. A customer comparing cars read a scooter answer at
 * the moment of deciding, and an assistant asked about car hire on Rodrigues
 * was handed a helmet policy as a fact about it.
 *
 * Only the helmet is genuinely scooter-only. Age, licence, insurance, fuel,
 * delivery, breakdown and minimum duration all read correctly for a car, and
 * the owner wrote them for both — so this stays a set of one rather than
 * becoming two divergent lists.
 */
const SCOOTER_ONLY_IDS = new Set<string>(["helmet"]);

/**
 * Conditions that only apply to a car.
 *
 * The Rs 5,000 security deposit is the owner's figure and he gave it for CARS.
 * Nothing is known about a scooter deposit, so the row must not appear on
 * /browse/scooter quoting a number that was never said about a scooter — the
 * same mistake as the helmet, pointed the other way.
 *
 * Note this is NOT the `deposit` the booking engine computes. That one is a
 * PERCENTAGE of the rental (lib/booking-pricing.ts depositPct — 50% for cars)
 * and it is the part-payment that confirms the booking online. Rs 5,000 is a
 * security deposit against the vehicle. Two different sums with one word, so
 * the answer text says which is which.
 */
const CAR_ONLY_IDS = new Set<string>(["deposit"]);

/** The conditions, in CONDITION_IDS order, skipping any the owner has removed
 *  or left blank. Both the panel and the FAQPage schema call this, so the
 *  markup can never describe a question the page does not show. */
export function pickConditions(
  items: { id?: string; question?: string; answer?: string }[] | undefined,
  /** The rental category being shown. Defaulted, so every existing caller and
   *  every existing test keeps the full list unchanged; only a caller that
   *  says "this is a car page" drops the scooter-only rows. */
  category?: string,
): ConditionItem[] {
  const byId = new Map((items ?? []).map((i) => [i.id, i]));
  const exclude = !category
    ? null
    : category === "scooter"
      ? CAR_ONLY_IDS
      : SCOOTER_ONLY_IDS;
  const ids = exclude
    ? CONDITION_IDS.filter((id) => !exclude.has(id))
    : CONDITION_IDS;
  return ids.map((id) => byId.get(id))
    .filter((i): i is { id: string; question: string; answer: string } =>
      Boolean(i?.id && i?.question && i?.answer?.trim()),
    )
    .map((i) => ({ id: i.id, question: i.question, answer: i.answer }));
}

/**
 * The collapsed preview for one condition row.
 *
 * One sentence is usually exactly right — "You must be 18 or older." But an
 * answer that opens with a bare "No." collapsed the live row down to
 *
 *   Minimum rental      No.
 *
 * which tells a reader nothing and, under a noun-phrase label, reads as though
 * the vehicle cannot be rented at all. So keep taking sentences until there is
 * enough text to carry meaning.
 */
export function conditionPreview(answer: string, minChars = 24): string {
  const text = answer.trim();
  const sentences = text.match(/[^.!?]*[.!?]|[^.!?]+$/g);
  if (!sentences) return text;
  let out = "";
  for (const s of sentences) {
    out += s;
    if (out.trim().length >= minChars) break;
  }
  return out.trim() || text;
}
