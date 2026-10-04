import type { Language } from "@/lib/i18n";

// ── THE WORDS FOR RENTAL LINKS OUTSIDE THE RENTAL PAGES ─────────────────────
//
// Architecture review 2026-09-30, items 3 and 4: /shop and /explore translate
// in the browser (context/LanguageContext.tsx), so the links they gained to the
// rentals need EN/FR/CR. Kept here rather than in lib/i18n.ts, which every
// session shares. Pure strings, so a test can read exactly what is printed.
//
// Category names: the owner types them in English ("Scooters"). Only the two
// the site already translates elsewhere (components/WhatLookingFor.tsx) are
// translated here; any other falls back to the owner's own label rather than a
// guessed Creole word.

export type RentalLinkData = {
  id: string;
  label: string;
  href: string;
  /** Cheapest daily rate, or null — then no figure is printed at all. */
  fromPerDay: number | null;
};

const CATEGORY_NAME: Record<string, Record<Language, string>> = {
  scooter: { en: "Scooters", fr: "Scooters", cr: "Skooter" },
  car: { en: "Cars", fr: "Voitures", cr: "Loto" },
};

export function categoryName(c: Pick<RentalLinkData, "id" | "label">, lang: Language): string {
  return CATEGORY_NAME[c.id]?.[lang] ?? c.label;
}

/** "From Rs 1,899/day" in the reader's language, grouped as each writes it. */
export function fromPerDay(n: number, lang: Language): string {
  if (lang === "fr") return `À partir de Rs ${n.toLocaleString("fr-FR")}/jour`;
  if (lang === "cr") return `Apartir Rs ${n.toLocaleString("en-US")} par zour`;
  return `From Rs ${n.toLocaleString("en-US")}/day`;
}

/**
 * The question over the /shop card, naming only what is actually for rent.
 * "Renting a scooter or car?" over a page where cars are switched off would be
 * a promise the next tap breaks.
 */
export function rentalQuestion(ids: readonly string[], lang: Language): string {
  const set = new Set(ids);
  const onlyKnown = ids.every((id) => id === "scooter" || id === "car");
  const key = !onlyKnown
    ? "any"
    : set.has("scooter") && set.has("car")
      ? "both"
      : set.has("car")
        ? "car"
        : "scooter";
  const Q = {
    both: {
      en: "Renting a scooter or a car?",
      fr: "Louer un scooter ou une voiture ?",
      cr: "Ou anvi loue enn skooter ou enn loto?",
    },
    scooter: { en: "Renting a scooter?", fr: "Louer un scooter ?", cr: "Ou anvi loue enn skooter?" },
    car: { en: "Renting a car?", fr: "Louer une voiture ?", cr: "Ou anvi loue enn loto?" },
    any: {
      en: "Looking for a rental?",
      fr: "Vous cherchez une location ?",
      cr: "Ou pe rod enn lokasion?",
    },
  } as const;
  return Q[key][lang];
}

// The /deliver lines are /deliver's own words (lib/delivery/copy.i18n.ts
// `pageTitle` and the first of its `promises`), copied rather than imported so
// /explore does not ship that whole dictionary. It is a reverse auction: the
// line says drivers quote, never that one is coming.
export const RENTAL_COPY = {
  en: {
    allRentals: "All rentals",
    heading: "Rentals and deliveries",
    deliver: "Get anything moved on Rodrigues",
    deliverNote: "Drivers send their price — you choose.",
  },
  fr: {
    allRentals: "Toutes les locations",
    heading: "Locations et livraisons",
    deliver: "Faites transporter n’importe quoi à Rodrigues",
    deliverNote: "Les chauffeurs proposent leur prix — vous choisissez.",
  },
  cr: {
    allRentals: "Tou bann lokasion",
    heading: "Lokasion ek livrezon",
    deliver: "Fer transporte nenport ki zafer dan Rodrig",
    deliverNote: "Bann sofer propoz zot pri — ou swazir.",
  },
} as const satisfies Record<Language, Record<string, string>>;
