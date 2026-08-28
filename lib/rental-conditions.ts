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
  "helmet",
  "fuel",
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
  "faq-min-duration": { en: "Minimum rental", fr: "Durée minimum", cr: "Dire minimum" },
};

export type ConditionItem = { id: string; question: string; answer: string };

/** The conditions, in CONDITION_IDS order, skipping any the owner has removed
 *  or left blank. Both the panel and the FAQPage schema call this, so the
 *  markup can never describe a question the page does not show. */
export function pickConditions(
  items: { id?: string; question?: string; answer?: string }[] | undefined,
): ConditionItem[] {
  const byId = new Map((items ?? []).map((i) => [i.id, i]));
  return CONDITION_IDS.map((id) => byId.get(id))
    .filter((i): i is { id: string; question: string; answer: string } =>
      Boolean(i?.id && i?.question && i?.answer?.trim()),
    )
    .map((i) => ({ id: i.id, question: i.question, answer: i.answer }));
}
