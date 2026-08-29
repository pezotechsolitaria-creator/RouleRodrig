import type { Language } from "@/lib/i18n";

// ── /food WAS THE BEST OF THE FOUR AND STILL ANSWERED NOTHING (M152) ────────
//
// 3,476 characters — more than /taxi, /shop or /experiences — because it lists
// nine dishes with prices. But a list is not an answer, and "can you order
// food in Rodrigues", "does anywhere deliver", "is there vegetarian food on
// Rodrigues" are the questions people type. None had a sentence on the page.
//
// Every figure below was read off the live page rather than the database: Rs
// 80 is the Coconut Napolitaine, Rs 2,500 the Flame-Grilled Lobster Package,
// and 15-30 min is what every kitchen quotes. Deliberately no dish is named —
// seven of the nine belong to a kitchen marked DEMO and no_index, so naming
// them would put a listing into an answer engine that the site itself is
// keeping out of search.

import type { FaqItem } from "@/lib/experiences-faq";

const EN: FaqItem[] = [
  {
    question: "Can I order food online in Rodrigues?",
    answer:
      "Yes. Dishes from island kitchens are listed with their price and how long they take, and you order on the site — no phone call needed. Most kitchens quote 15 to 30 minutes.",
  },
  {
    question: "How much does a meal cost?",
    answer:
      "Dishes start at around Rs 80 for something small and run to Rs 2,500 for a whole flame-grilled lobster, with plates of curry, grilled fish and noodles in between. Every price is shown before you order.",
  },
  {
    question: "Can I collect instead of paying for delivery?",
    answer:
      "Yes. Choose Collect in person and there is no fee — you get a code to show at the kitchen when you arrive. Delivery is the other option where the kitchen offers it.",
  },
  {
    question: "Is there vegetarian, halal or gluten-free food?",
    answer:
      "The list filters by vegetarian, halal, gluten free and seafood, and each dish carries its own dietary labels and spice level so you can see before you order rather than after.",
  },
  {
    question: "How do I know a dish is actually available?",
    answer:
      "Only what a kitchen is cooking now is offered — dishes that have sold out or are outside their serving hours are marked, so the menu you see is the one you can actually order from.",
  },
];

const FR: FaqItem[] = [
  {
    question: "Peut-on commander à manger en ligne à Rodrigues ?",
    answer:
      "Oui. Les plats des cuisines de l'île sont proposés avec leur prix et leur temps de préparation, et vous commandez sur le site — sans appeler. La plupart des cuisines annoncent 15 à 30 minutes.",
  },
  {
    question: "Combien coûte un repas ?",
    answer:
      "Les plats démarrent autour de Rs 80 pour une petite portion et vont jusqu'à Rs 2 500 pour une langouste grillée entière, avec des caris, du poisson grillé et des nouilles entre les deux. Chaque prix est affiché avant la commande.",
  },
  {
    question: "Peut-on venir chercher sa commande au lieu de payer la livraison ?",
    answer:
      "Oui. Choisissez le retrait sur place : c'est sans frais, et vous recevez un code à présenter à la cuisine en arrivant. La livraison reste possible lorsque la cuisine la propose.",
  },
  {
    question: "Y a-t-il des plats végétariens, halal ou sans gluten ?",
    answer:
      "La liste se filtre par végétarien, halal, sans gluten et fruits de mer, et chaque plat porte ses propres mentions alimentaires ainsi que son niveau de piment — visibles avant de commander, pas après.",
  },
  {
    question: "Comment savoir qu'un plat est vraiment disponible ?",
    answer:
      "Seul ce qu'une cuisine prépare sur le moment est proposé : les plats épuisés ou hors de leurs heures de service sont signalés, donc le menu affiché est bien celui que vous pouvez commander.",
  },
];

/** Kreol falls back to French — see lib/taxi-faq.ts for the reasoning. */
export function foodFaq(language: Language): FaqItem[] {
  return language === "en" ? EN : FR;
}

export function foodFaqHeading(language: Language): string {
  return language === "en"
    ? "Ordering food in Rodrigues — common questions"
    : "Commander à manger à Rodrigues — questions fréquentes";
}
