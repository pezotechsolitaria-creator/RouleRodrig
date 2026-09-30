import type { Language } from "@/lib/i18n";
import { IN_PERSON_SENTENCE } from "./experiences";

// ── WHAT /experiences NEVER SAID OUT LOUD (M151) ────────────────────────────
//
// The hub carried a breadcrumb, an ItemList and a reciprocal hreflang — good
// structure around 1,683 characters that answered none of the questions
// someone planning a trip actually asks. "What is there to do on Rodrigues" is
// the query, and an answer engine had nothing here to quote.
//
// Same construction as lib/taxi-faq.ts and for the same reason: kept out of
// lib/i18n.ts because LanguageContext reads that dictionary through a cast, so
// a key added to `en` alone is typed as present and undefined at runtime for
// fr and cr — a crash on .map(), not a fallback.
//
// Every figure is from the live listings — and the cost answer now DERIVES its
// two, because they drifted. It said "from around Rs 700 ... to Rs 2,000 for
// the Ile aux Cocos excursion" while the card grid directly above showed
// "Sunrise hike from Anse aux Anglais - Rs 2,500 per person" and Ile aux Cocos
// at "Rs 1999/Person". The page contradicted itself in the one paragraph a
// price-shopping visitor reads, and the same text was emitted as FAQPage
// schema. The booking answer
// describes the availability-first flow the API actually implements: a request
// is created, the owner confirms availability, and only an approved booking
// gets a payment deadline.

export type FaqItem = { question: string; answer: string };

/**
 * The cheapest and dearest experience currently listed, in whole rupees, and
 * optionally WHICH listing sits at each end.
 *
 * The names exist because the answer used to describe the ends itself: "from
 * Rs 700 for an hour on the water to Rs 2,500 for a full day out". The Rs 2,500
 * was the sunrise hike (about four hours); the actual full day, Île aux Cocos,
 * is cheaper. A derived figure beside a hand-written label is still a false
 * sentence, so the label is now the listing's own name, or nothing at all
 * (SEO audit 2026-09-29 C1).
 */
export type PriceRange = { min: number; max: number; minName?: string; maxName?: string };

/**
 * Used only when the caller has no listings to measure. The caller that
 * matters — the hub itself — has them and passes the real ones.
 */
export const FALLBACK_RANGE: PriceRange = { min: 700, max: 2500 };

const rs = (n: number) => `Rs ${n.toLocaleString("en-US")}`;

/** " (Balade en mer)" — the listing at that end of the range, when known. */
const named = (name?: string) => (name?.trim() ? ` (${name.trim()})` : "");

/**
 * The range and the listing at each end, from the prices the cards print
 * (placePrice() in the caller). For the hub, so the answer under the grid can
 * name what it prices. Null when nothing is priced; the caller keeps its
 * fallback.
 */
export function priceRangeOf(
  places: { name: string; price: number | null }[],
): PriceRange | null {
  const priced = places.filter(
    (p): p is { name: string; price: number } => typeof p.price === "number" && p.price > 0,
  );
  if (!priced.length) return null;
  const lo = priced.reduce((a, b) => (b.price < a.price ? b : a));
  const hi = priced.reduce((a, b) => (b.price > a.price ? b : a));
  return { min: lo.price, max: hi.price, minName: lo.name.trim(), maxName: hi.name.trim() };
}

const EN = (range: PriceRange): FaqItem[] => [
  {
    question: "What is there to do on Rodrigues?",
    answer:
      "Boat trips out to Île aux Cocos and its bird sanctuary, snorkelling over the coral at Rivière Banane, traditional fishing in the lagoon, walking the island with a guide who grew up on it, and massage and wellness. Each listing shows the price per person and, where the provider sets one, how long it lasts.",
  },
  {
    question: "How much does an experience cost?",
    answer:
      `Prices are per person and shown on every listing — from ${rs(range.min)}${named(range.minName)} to ${rs(range.max)}${named(range.maxName)}. Nothing is added on top: you pay the provider's price.`,
  },
  {
    question: "Do I pay straight away when I book?",
    // The last sentence is the booking form's cash option (M220), worded as the
    // request it is and shared with lib/experiences.ts (SEO audit 2026-09-29 C4).
    answer:
      `No. You send a request first and we check the date with the provider. Only once availability is confirmed do you get a payment link and a deadline — if the date cannot be held, you are told and offered alternatives instead. ${IN_PERSON_SENTENCE}`,
  },
  {
    question: "Who runs the trips?",
    answer:
      "Independent Rodriguan skippers, guides and therapists. You book through Roule Rodrigues, but the trip is theirs — which is why the price, the boat and the day are agreed with the person actually taking you out.",
  },
  {
    question: "Can I visit Île aux Cocos?",
    answer:
      "Yes. It is a protected islet and bird sanctuary in the lagoon, reached by boat, and the excursion is listed here with a local guide. It is the trip most visitors to Rodrigues come for.",
  },
];

const FR = (range: PriceRange): FaqItem[] => [
  {
    question: "Que faire à Rodrigues ?",
    answer:
      "Des sorties en bateau vers l'Île aux Cocos et sa réserve d'oiseaux, la plongée en apnée sur le corail à Rivière Banane, la pêche traditionnelle dans le lagon, des randonnées avec un guide né sur l'île, et le massage et bien-être. Chaque annonce indique le prix par personne et, lorsque le prestataire l'a renseignée, la durée.",
  },
  {
    question: "Combien coûte une activité ?",
    answer:
      `Les prix sont par personne et figurent sur chaque annonce — à partir de ${rs(range.min)}${named(range.minName)}, jusqu'à ${rs(range.max)}${named(range.maxName)}. Rien n'est ajouté : vous payez le prix du prestataire.`,
  },
  {
    question: "Faut-il payer immédiatement à la réservation ?",
    // The same cash option as the English, in the form's own French wording
    // (placeBooking.inPersonNote).
    answer:
      "Non. Vous envoyez d'abord une demande et nous vérifions la date auprès du prestataire. Ce n'est qu'une fois la disponibilité confirmée que vous recevez un lien de paiement et une échéance — si la date ne peut pas être retenue, on vous le dit et on vous propose d'autres options. Vous pouvez aussi demander à payer sur place, en espèces : nous vous disons si c'est possible ou s'il faut payer en ligne.",
  },
  {
    question: "Qui organise les sorties ?",
    answer:
      "Des skippers, guides et thérapeutes rodriguais indépendants. Vous réservez via Roule Rodrigues, mais la sortie est la leur — c'est pourquoi le prix, le bateau et la journée se conviennent avec la personne qui vous emmène.",
  },
  {
    question: "Peut-on visiter l'Île aux Cocos ?",
    answer:
      "Oui. C'est un îlot protégé et une réserve d'oiseaux au milieu du lagon, que l'on rejoint en bateau, et l'excursion est proposée ici avec un guide local. C'est la sortie pour laquelle la plupart des visiteurs viennent à Rodrigues.",
  },
];

/** Kreol falls back to FRENCH, not English — see lib/taxi-faq.ts for why, and
 *  replace with real Kreol wording when the owner supplies it. */
export function experiencesFaq(
  language: Language,
  range: PriceRange = FALLBACK_RANGE,
): FaqItem[] {
  return language === "en" ? EN(range) : FR(range);
}

export function experiencesFaqHeading(language: Language): string {
  return language === "en"
    ? "Experiences on Rodrigues — common questions"
    : "Les activités à Rodrigues — questions fréquentes";
}
