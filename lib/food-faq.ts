import type { Language } from "@/lib/i18n";

// ── /food WAS THE BEST OF THE FOUR AND STILL ANSWERED NOTHING (M152) ────────
//
// 3,476 characters — more than /taxi, /shop or /experiences — because it lists
// nine dishes with prices. But a list is not an answer, and "can you order
// food in Rodrigues", "does anywhere deliver", "is there vegetarian food on
// Rodrigues" are the questions people type. None had a sentence on the page.
//
// Every figure below was read off the live page rather than the database: Rs
// 80 is the Coconut Napolitaine, Rs 2,500 the Flame-Grilled Lobster Package.
// Deliberately no dish is named — seven of the nine belong to a kitchen marked
// DEMO and no_index, so naming them would put a listing into an answer engine
// that the site itself is keeping out of search.
//
// ── "MOST KITCHENS QUOTE 15 TO 30 MINUTES" STOPPED BEING TRUE (M216) ────────
// On 23 Sept 2026 Chez Banane — the one kitchen on /food — became pre-order
// only: at least 24 hours' notice, up to two days ahead, cash on collection
// (M201). The answers below said a meal takes half an hour and that only what
// a kitchen is cooking NOW is offered; this page's own JSON-LD was telling
// answer engines both. They now say what the checkout does: some kitchens cook
// on the spot, some need a day's notice, and the customer picks the day and
// time. Chez Banane is named because the payment rule is its own, and a rule
// with no kitchen attached would read as the platform's.

import type { FaqItem } from "@/lib/experiences-faq";

const EN: FaqItem[] = [
  {
    question: "Can I order food online in Rodrigues?",
    answer:
      "Yes. Dishes from island kitchens are listed with their price, and you order on the site — no phone call needed. Each dish says how far ahead to order: a kitchen that cooks to order needs a day’s notice. At checkout you choose when you want it — the day and the time.",
  },
  {
    question: "How much does a meal cost?",
    answer:
      "Right now dishes run from Rs 1,000 up to Rs 2,500 for flame-grilled lobster, cooked to order by the beach. Every price is shown before you order, and you pay the kitchen in cash when you collect.",
  },
  {
    question: "Can I collect instead of paying for delivery?",
    answer:
      "Yes. Choose Collect in person and there is no fee — you get a code to show at the kitchen when you arrive. You pay the kitchen, not the site: Chez Banane takes cash when you collect. Delivery is the other option where the kitchen offers it.",
  },
  {
    question: "Is there vegetarian, halal or gluten-free food?",
    answer:
      "The list filters by vegetarian, halal, gluten free and seafood, and each dish carries its own dietary labels and spice level so you can see before you order rather than after.",
  },
  {
    question: "How do I know a dish is actually available?",
    answer:
      "Every dish says whether you can order it: sold-out dishes and ones off the menu are marked, and a kitchen that cooks to order says how far ahead to book. The collection times offered at checkout are only ones the kitchen can actually cook for — Chez Banane asks for at least 24 hours.",
  },
];

const FR: FaqItem[] = [
  {
    question: "Peut-on commander à manger en ligne à Rodrigues ?",
    answer:
      "Oui. Les plats des cuisines de l’île sont proposés avec leur prix, et vous commandez sur le site — sans appeler. Chaque plat indique combien de temps à l’avance le commander : une cuisine qui cuisine à la commande demande un jour de préavis. Au moment de commander, vous choisissez quand vous le voulez — le jour et l’heure.",
  },
  {
    question: "Combien coûte un repas ?",
    answer:
      "Aujourd’hui, les plats vont de Rs 1 000 à Rs 2 500 pour la langouste grillée, cuisinée à la commande au bord de la plage. Chaque prix est affiché avant la commande, et vous payez la cuisine en espèces au retrait.",
  },
  {
    question: "Peut-on venir chercher sa commande au lieu de payer la livraison ?",
    answer:
      "Oui. Choisissez le retrait sur place : c'est sans frais, et vous recevez un code à présenter à la cuisine en arrivant. Vous payez la cuisine, pas le site : Chez Banane se règle en espèces au retrait. La livraison reste possible lorsque la cuisine la propose.",
  },
  {
    question: "Y a-t-il des plats végétariens, halal ou sans gluten ?",
    answer:
      "La liste se filtre par végétarien, halal, sans gluten et fruits de mer, et chaque plat porte ses propres mentions alimentaires ainsi que son niveau de piment — visibles avant de commander, pas après.",
  },
  {
    question: "Comment savoir qu'un plat est vraiment disponible ?",
    answer:
      "Chaque plat indique s’il peut être commandé : les plats épuisés ou retirés de la carte sont signalés, et une cuisine qui prépare à la commande précise combien de temps à l’avance réserver. Les heures de retrait proposées au moment de commander sont uniquement celles où la cuisine peut vraiment préparer le plat — Chez Banane demande au moins 24 heures.",
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
