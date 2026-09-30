import type { Language } from "@/lib/i18n";
import type { TransferPricing } from "@/lib/rides/transfer";
import { faqPageLd } from "@/lib/schema";
import {
  money,
  moneyFr,
  passengersCovered,
  passengersCoveredFr,
  portMathurin,
  timeSentences,
  timeSentencesFr,
  zoneFaresSentence,
  zoneFaresSentenceFr,
} from "@/lib/transfers-faq";

// ── WHAT THE TAXI PAGE NEVER SAID (M149) ────────────────────────────────────
//
// Fetched as Googlebot: /taxi served 1,109 characters of visible text under an
// h1 reading "Taxi & Transport". It answered none of the questions somebody
// actually types — what a taxi costs on Rodrigues, whether you can get one
// from the airport, whether you have to book ahead — even though the product
// answers all three.
//
// It goes at the FOOT of the page on purpose. The page's own comments record a
// 200-character subtitle being removed after measuring 114px of header on a
// page that already needed 607px of scrolling to reach one driver. Putting
// prose back above the fold would undo a decision somebody made with a ruler.
// Below the driver list it costs the booking flow nothing and is still indexed.
//
// Kept OUT of lib/i18n.ts deliberately. LanguageContext does
// `translations[language] as typeof translations.en`, a cast — so a key added
// to `en` alone is typed as present and is undefined at runtime for fr and cr,
// which crashes on .map(). A module with its own resolver cannot do that.
//
// Every answer below is checked against the code, not written to sound
// reassuring: the fare wording is tx.fareNote, the flight number is genuinely
// required for arrivals (BookRide's needsFlightRef) and genuinely reaches the
// driver (DriverHome renders job.flightRef), and the disclaimer is quoted.
//
// ── ONE PRICE ANSWER, IN TWO PARTS (SEO audit 2026-09-29 C2) ────────────────
// "Every driver sets their own fare, so there is no fixed price list" was
// true of a taxi and false of an airport transfer, which since M220 has fixed
// zone fares — published on /transfers, the best airport-fare table on the
// web, while the page Google trusts most for taxis said prices did not exist.
// So the answer is two parts everywhere: airport transfers at the zone fares
// read from the price sheet (never typed here), and every other ride at the
// driver's fare, confirmed before anything is agreed. With no sheet to read,
// the first part names the page instead of a number.

/** `link` renders after the answer; it is not part of the FAQPage text. */
export type TaxiFaqItem = {
  question: string;
  answer: string;
  link?: { href: string; label: string };
};

/** Where the airport fares live. Every price answer points at it. */
export const TRANSFERS_LINK = {
  en: { href: "/transfers", label: "Airport transfer prices, by zone" },
  fr: { href: "/transfers", label: "Tarifs des transferts aéroport, par zone" },
} as const;

function airportPartEn(p: TransferPricing | null): string {
  if (!p) {
    return "Airport transfers have fixed fares by zone, measured by road from Plaine Corail — the price list is on our airport transfers page.";
  }
  // One phrase for the passenger count, shared with /transfers (audit C2).
  const pax = passengersCovered(p);
  const extra = p.extraPassengerFee > 0 ? `; each extra passenger adds ${money(p.extraPassengerFee)}` : "";
  const pm = portMathurin(p);
  return [
    `Airport transfers have fixed fares by zone, by road from Plaine Corail: ${zoneFaresSentence(p)}, for ${pax}${extra}.`,
    pm ? `Port Mathurin is ${money(p.oneWay[pm.zone - 1])} one way.` : "",
    ...timeSentences(p),
  ]
    .filter(Boolean)
    .join(" ");
}

function airportPartFr(p: TransferPricing | null): string {
  if (!p) {
    return "Les transferts aéroport ont des tarifs fixes par zone, selon la distance par la route depuis Plaine Corail — la grille est sur notre page des transferts aéroport.";
  }
  const pax = passengersCoveredFr(p);
  const extra =
    p.extraPassengerFee > 0 ? ` ; chaque passager supplémentaire ajoute ${moneyFr(p.extraPassengerFee)}` : "";
  const pm = portMathurin(p);
  return [
    `Les transferts aéroport ont des tarifs fixes par zone, selon la distance par la route depuis Plaine Corail : ${zoneFaresSentenceFr(p)}, pour ${pax}${extra}.`,
    pm ? `Port Mathurin : ${moneyFr(p.oneWay[pm.zone - 1])} l'aller simple.` : "",
    ...timeSentencesFr(p),
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * "How much does a taxi cost on Rodrigues?", answered the same way on /taxi,
 * /fr/taxi-rodrigues and in /llms-full.txt. Refunds §10: taxi fares are paid
 * in cash directly to the driver.
 */
export function taxiPriceAnswer(language: Language, airport: TransferPricing | null): string {
  if (language === "en") {
    return `It depends on the ride. ${airportPartEn(airport)} Every other ride: each driver sets their own fare, and the price is confirmed with you before anything is agreed — there is no charge until you accept it. You pay the driver in cash; Roule Rodrigues never takes payment for a ride.`;
  }
  return `Cela dépend de la course. ${airportPartFr(airport)} Pour toute autre course, chaque chauffeur fixe son propre tarif : le prix vous est confirmé avant tout engagement — rien ne vous est facturé tant que vous n'avez pas accepté. Vous payez le chauffeur en espèces, et Roule Rodrigues ne prend jamais de paiement pour une course.`;
}

const EN = (airport: TransferPricing | null): TaxiFaqItem[] => [
  {
    question: "How much does a taxi cost on Rodrigues?",
    answer: taxiPriceAnswer("en", airport),
    link: TRANSFERS_LINK.en,
  },
  {
    question: "Can I book a taxi from Plaine Corail airport?",
    answer:
      "Yes. Choose Airport transfer and give your flight number. It goes on the driver's job sheet, so they know which arrival to meet and can allow for a delay.",
  },
  {
    question: "Do I need to book in advance?",
    answer:
      "No. You can call or message any driver on this page directly. Booking through the site instead puts your request to every available driver at once, and one accepts within a few minutes.",
  },
  {
    question: "Who are the drivers?",
    answer:
      "Independent local drivers, listed here for your convenience. Roule Rodrigues is not a transport operator and is not responsible for their service — outside the airport zone fares, the fare and the journey are agreed between you and the driver.",
  },
  {
    question: "Can I follow my ride once it is booked?",
    answer:
      "Yes. A booked ride has its own tracking link, so you can see the driver on the way to you.",
  },
];

const FR = (airport: TransferPricing | null): TaxiFaqItem[] => [
  {
    question: "Combien coûte un taxi à Rodrigues ?",
    answer: taxiPriceAnswer("fr", airport),
    link: TRANSFERS_LINK.fr,
  },
  {
    question: "Puis-je réserver un taxi depuis l'aéroport de Plaine Corail ?",
    answer:
      "Oui. Choisissez Transfert aéroport et indiquez votre numéro de vol. Il figure sur la fiche du chauffeur, qui sait donc quelle arrivée attendre et peut tenir compte d'un retard.",
  },
  {
    question: "Faut-il réserver à l'avance ?",
    answer:
      "Non. Vous pouvez appeler ou écrire directement à n'importe quel chauffeur de cette page. En passant par le site, votre demande part à tous les chauffeurs disponibles en même temps, et l'un d'eux accepte en quelques minutes.",
  },
  {
    question: "Qui sont les chauffeurs ?",
    answer:
      "Des chauffeurs locaux indépendants, listés ici pour votre commodité. Roule Rodrigues n'est pas un opérateur de transport et n'est pas responsable de leur service — hors tarifs fixes des transferts aéroport, le tarif et le trajet se conviennent entre vous et le chauffeur.",
  },
  {
    question: "Puis-je suivre ma course une fois réservée ?",
    answer:
      "Oui. Une course réservée dispose de son propre lien de suivi, qui vous montre le chauffeur en route.",
  },
];

/**
 * Kreol falls back to FRENCH, not English, and that is a deliberate choice
 * rather than an oversight: a Rodriguan reader who has switched to Kreol is far
 * likelier to read French than English, and the two languages are close. It is
 * a placeholder — replace CR with real Kreol wording when the owner supplies
 * it. The page's own history is the argument for caring: an earlier version
 * shipped hardcoded English into an otherwise translated page, and a Kreol
 * reader met "FASTEST WAY / Tell us where you're going" mid-sentence.
 *
 * `airport` is the price sheet from readTransferFares(), read on the server;
 * null prints no fare.
 */
export function taxiFaq(language: Language, airport: TransferPricing | null = null): TaxiFaqItem[] {
  return language === "en" ? EN(airport) : FR(airport);
}

/** Section heading, resolved the same way and for the same reasons. */
export function taxiFaqHeading(language: Language): string {
  return language === "en" ? "Taxis on Rodrigues — common questions" : "Le taxi à Rodrigues — questions fréquentes";
}

/** The same list, as FAQPage JSON-LD — via the shared builder in lib/schema.ts,
 *  so /taxi and /experiences cannot drift apart on how they describe an FAQ. */
export function taxiFaqLd(url: string, items: TaxiFaqItem[]) {
  return faqPageLd(url, items);
}

export function taxiServiceLd(siteUrl: string) {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    "@id": `${siteUrl}/taxi#service`,
    name: "Taxi and airport transfer booking on Rodrigues",
    serviceType: "Taxi booking",
    // The one business entity, not a second anonymous Organization (SEO audit
    // 2026-09-29 T9). The page carries sellerLd() so the pointer resolves.
    provider: { "@id": `${siteUrl}/#business` },
    areaServed: {
      "@type": "Place",
      name: "Rodrigues, Mauritius",
      address: {
        "@type": "PostalAddress",
        addressLocality: "Rodrigues",
        addressCountry: "MU",
      },
    },
    availableChannel: {
      "@type": "ServiceChannel",
      serviceUrl: `${siteUrl}/taxi/book`,
      name: "Book a ride",
    },
    description:
      "Request a ride on Rodrigues and it goes to every available driver at once. Airport transfers from Plaine Corail have fixed fares by zone; for other rides, independent drivers set their own fares and confirm the price before anything is agreed.",
  };
}
