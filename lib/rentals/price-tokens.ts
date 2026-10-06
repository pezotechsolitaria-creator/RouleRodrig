import { extractDailyPrice, scooterRates, vehicleDayRate } from "@/lib/booking-pricing";
import type { SiteContent } from "@/lib/defaults";

// ── PRICES IN THE OWNER'S OWN WORDS, KEPT CURRENT (6 Oct 2026) ──────────────
//
// The owner: "this is the prices for scooter now ... it should be auto". The
// scooter list lives on the Scooters category in /admin and every page reads
// it — but the FAQ is prose the owner writes, and a figure typed into prose is
// out of date the day the list changes. So a FAQ answer can name a price by
// placeholder instead:
//
//   {scooter_1_day}    one day                   "Rs 1,699"
//   {scooter_2_days}   two days, in all          "Rs 1,798"
//   {scooter_per_day}  per day, 3 days or more   "Rs 799"
//   {car_from}         cheapest car, per day     "Rs 1,899"
//
// Filled after the content cache (lib/content.ts getContent), so every reader
// of the public content — the FAQ accordion, the FAQPage JSON-LD, llms-full —
// gets the figure, and /admin (which reads the raw row) keeps the placeholder
// the owner typed. French answers are grouped the French way ("Rs 1 699").

export const PRICE_TOKENS = ["scooter_1_day", "scooter_2_days", "scooter_per_day", "car_from"] as const;
export type PriceToken = (typeof PRICE_TOKENS)[number];

const TOKEN_RE = /\{(scooter_1_day|scooter_2_days|scooter_per_day|car_from)\}/g;

/** The figure behind each placeholder, from the content itself. */
export function priceTokenValues(
  content: Pick<SiteContent, "fleet" | "vehicleCategories">,
): Record<PriceToken, number | null> {
  const sr = scooterRates(content.vehicleCategories);
  const carsOn = (content.vehicleCategories ?? []).some((c) => c.id === "car" && c.enabled);
  const carRates = carsOn
    ? (content.fleet ?? [])
        .filter((f) => f.category === "car" && extractDailyPrice(f.price ?? "") > 0)
        .map((f) => vehicleDayRate({ price: f.price, category: "car" }, content.vehicleCategories))
        .filter((n) => n > 0)
    : [];
  return {
    scooter_1_day: sr.oneDay,
    scooter_2_days: sr.twoDays * 2,
    scooter_per_day: sr.threePlus,
    car_from: carRates.length ? Math.min(...carRates) : null,
  };
}

/** Replace every placeholder in `text`; an unknown figure reads "Rs —". */
export function fillPriceTokens(
  text: string,
  values: Record<PriceToken, number | null>,
  lang: "en" | "fr" | "cr" = "en",
): string {
  if (!text || !text.includes("{")) return text;
  const locale = lang === "fr" ? "fr-FR" : "en-US";
  return text.replace(TOKEN_RE, (_, key: PriceToken) => {
    const n = values[key];
    return n == null ? "Rs —" : `Rs ${n.toLocaleString(locale)}`;
  });
}

/** The public content with every FAQ placeholder filled. Pure; unchanged
 *  content comes back as the same object. */
export function withPriceTokens(content: SiteContent): SiteContent {
  const items = content.faq?.items;
  if (!items?.length) return content;
  const has = (s: unknown) => typeof s === "string" && s.includes("{");
  if (!items.some((q) => has(q.answer) || has(q.answerFr) || has(q.answerCr))) return content;
  const values = priceTokenValues(content);
  return {
    ...content,
    faq: {
      ...content.faq,
      items: items.map((q) => ({
        ...q,
        answer: fillPriceTokens(q.answer, values, "en"),
        ...(q.answerFr != null ? { answerFr: fillPriceTokens(q.answerFr, values, "fr") } : {}),
        ...(q.answerCr != null ? { answerCr: fillPriceTokens(q.answerCr, values, "cr") } : {}),
      })),
    },
  };
}
