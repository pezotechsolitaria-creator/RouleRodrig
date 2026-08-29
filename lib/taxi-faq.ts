import type { Language } from "@/lib/i18n";
import { faqPageLd } from "@/lib/schema";

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

export type TaxiFaqItem = { question: string; answer: string };

const EN: TaxiFaqItem[] = [
  {
    question: "How much does a taxi cost on Rodrigues?",
    answer:
      "Every driver sets their own fare, so there is no fixed price list. Tell us where you are going and the price is confirmed with you before anything is agreed — there is no charge until you accept it, and Roulé Rodrigues never takes payment for a ride.",
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
      "Independent local drivers, listed here for your convenience. Roulé Rodrigues is not a transport operator and is not responsible for their service — the fare and the journey are agreed between you and the driver.",
  },
  {
    question: "Can I follow my ride once it is booked?",
    answer:
      "Yes. A booked ride has its own tracking link, so you can see the driver on the way to you.",
  },
];

const FR: TaxiFaqItem[] = [
  {
    question: "Combien coûte un taxi à Rodrigues ?",
    answer:
      "Chaque chauffeur fixe son propre tarif : il n'y a pas de grille de prix. Dites-nous où vous allez et le prix vous est confirmé avant tout engagement — rien ne vous est facturé tant que vous n'avez pas accepté, et Roulé Rodrigues ne prend jamais de paiement pour une course.",
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
      "Des chauffeurs locaux indépendants, listés ici pour votre commodité. Roulé Rodrigues n'est pas un opérateur de transport et n'est pas responsable de leur service — le tarif et le trajet se conviennent entre vous et le chauffeur.",
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
 */
export function taxiFaq(language: Language): TaxiFaqItem[] {
  return language === "en" ? EN : FR;
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
    provider: {
      "@type": "Organization",
      name: "Roulé Rodrigues",
      url: siteUrl,
    },
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
      "Request a ride on Rodrigues and it goes to every available driver at once, including airport transfers from Plaine Corail. Drivers are independent, set their own fares, and confirm the price before anything is agreed.",
  };
}
