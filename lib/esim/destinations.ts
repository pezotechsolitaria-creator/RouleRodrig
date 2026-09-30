// ── Where the eSIM store sells ───────────────────────────────────────────────
//
// MAURITIUS & RODRIGUES FIRST, THE WORLD SECOND (owner, 30 Sep 2026: "mainly
// for Mauritius and Rodrigues but allows other countries"). Mauritius is the
// store's home shelf, curated by hand and bound by the Rodrigues network rule.
// Every other destination is a page of its own, stocked automatically from the
// wholesaler's catalogue (lib/esim/curate.ts) and bound only by margin.
//
// The list is CURATED, not "every country the wholesaler covers": these are
// the places Rodrigues' visitors come from, pass through, or go on to — the
// Indian Ocean neighbours, the layover hubs, the countries that fly here — and
// the handful of big destinations residents travel to. 160 thin country pages
// would be an index-bloat problem, not a feature. A destination only gets a
// live page once it has at least one plan listed (see public_esim_destinations).
//
// French needs its preposition ("à La Réunion", "aux Seychelles", "en
// France"); a template that wrote "en La Réunion" would read as a machine
// translation on exactly the French pages that rank best.

export type DestinationGroup = "home" | "indian-ocean" | "africa" | "europe" | "middle-east" | "asia" | "americas" | "oceania";

export type Destination = {
  /** ISO 3166-1 alpha-2, as the wholesaler writes it. */
  code: string;
  /** URL segment under /esim and /fr/esim. */
  slug: string;
  en: string;
  fr: string;
  /** "in France", "in the UK". */
  enIn: string;
  /** "en France", "à La Réunion", "aux Seychelles". */
  frIn: string;
  flag: string;
  group: DestinationGroup;
};

export const HOME_CODE = "MU";

export const DESTINATIONS: Destination[] = [
  { code: "MU", slug: "mauritius", en: "Mauritius & Rodrigues", fr: "Maurice et Rodrigues", enIn: "in Mauritius and Rodrigues", frIn: "à Maurice et Rodrigues", flag: "🇲🇺", group: "home" },
  // ── The Indian Ocean ──
  { code: "RE", slug: "reunion", en: "Réunion", fr: "La Réunion", enIn: "in Réunion", frIn: "à La Réunion", flag: "🇷🇪", group: "indian-ocean" },
  { code: "MG", slug: "madagascar", en: "Madagascar", fr: "Madagascar", enIn: "in Madagascar", frIn: "à Madagascar", flag: "🇲🇬", group: "indian-ocean" },
  { code: "SC", slug: "seychelles", en: "Seychelles", fr: "Seychelles", enIn: "in the Seychelles", frIn: "aux Seychelles", flag: "🇸🇨", group: "indian-ocean" },
  // ── Africa ──
  { code: "ZA", slug: "south-africa", en: "South Africa", fr: "Afrique du Sud", enIn: "in South Africa", frIn: "en Afrique du Sud", flag: "🇿🇦", group: "africa" },
  { code: "KE", slug: "kenya", en: "Kenya", fr: "Kenya", enIn: "in Kenya", frIn: "au Kenya", flag: "🇰🇪", group: "africa" },
  { code: "TZ", slug: "tanzania", en: "Tanzania", fr: "Tanzanie", enIn: "in Tanzania", frIn: "en Tanzanie", flag: "🇹🇿", group: "africa" },
  // ── Europe: where most visitors fly in from ──
  { code: "FR", slug: "france", en: "France", fr: "France", enIn: "in France", frIn: "en France", flag: "🇫🇷", group: "europe" },
  { code: "GB", slug: "uk", en: "United Kingdom", fr: "Royaume-Uni", enIn: "in the UK", frIn: "au Royaume-Uni", flag: "🇬🇧", group: "europe" },
  { code: "DE", slug: "germany", en: "Germany", fr: "Allemagne", enIn: "in Germany", frIn: "en Allemagne", flag: "🇩🇪", group: "europe" },
  { code: "IT", slug: "italy", en: "Italy", fr: "Italie", enIn: "in Italy", frIn: "en Italie", flag: "🇮🇹", group: "europe" },
  { code: "ES", slug: "spain", en: "Spain", fr: "Espagne", enIn: "in Spain", frIn: "en Espagne", flag: "🇪🇸", group: "europe" },
  { code: "PT", slug: "portugal", en: "Portugal", fr: "Portugal", enIn: "in Portugal", frIn: "au Portugal", flag: "🇵🇹", group: "europe" },
  { code: "CH", slug: "switzerland", en: "Switzerland", fr: "Suisse", enIn: "in Switzerland", frIn: "en Suisse", flag: "🇨🇭", group: "europe" },
  { code: "BE", slug: "belgium", en: "Belgium", fr: "Belgique", enIn: "in Belgium", frIn: "en Belgique", flag: "🇧🇪", group: "europe" },
  // ── The layover hubs ──
  { code: "AE", slug: "uae", en: "United Arab Emirates", fr: "Émirats arabes unis", enIn: "in the UAE", frIn: "aux Émirats arabes unis", flag: "🇦🇪", group: "middle-east" },
  { code: "QA", slug: "qatar", en: "Qatar", fr: "Qatar", enIn: "in Qatar", frIn: "au Qatar", flag: "🇶🇦", group: "middle-east" },
  // ── Asia ──
  { code: "IN", slug: "india", en: "India", fr: "Inde", enIn: "in India", frIn: "en Inde", flag: "🇮🇳", group: "asia" },
  { code: "CN", slug: "china", en: "China", fr: "Chine", enIn: "in China", frIn: "en Chine", flag: "🇨🇳", group: "asia" },
  { code: "TH", slug: "thailand", en: "Thailand", fr: "Thaïlande", enIn: "in Thailand", frIn: "en Thaïlande", flag: "🇹🇭", group: "asia" },
  { code: "SG", slug: "singapore", en: "Singapore", fr: "Singapour", enIn: "in Singapore", frIn: "à Singapour", flag: "🇸🇬", group: "asia" },
  { code: "MY", slug: "malaysia", en: "Malaysia", fr: "Malaisie", enIn: "in Malaysia", frIn: "en Malaisie", flag: "🇲🇾", group: "asia" },
  { code: "JP", slug: "japan", en: "Japan", fr: "Japon", enIn: "in Japan", frIn: "au Japon", flag: "🇯🇵", group: "asia" },
  // ── Further afield ──
  { code: "AU", slug: "australia", en: "Australia", fr: "Australie", enIn: "in Australia", frIn: "en Australie", flag: "🇦🇺", group: "oceania" },
  { code: "US", slug: "usa", en: "United States", fr: "États-Unis", enIn: "in the USA", frIn: "aux États-Unis", flag: "🇺🇸", group: "americas" },
  { code: "CA", slug: "canada", en: "Canada", fr: "Canada", enIn: "in Canada", frIn: "au Canada", flag: "🇨🇦", group: "americas" },
];

export const WORLD_DESTINATIONS = DESTINATIONS.filter((d) => d.code !== HOME_CODE);

export function destinationByCode(code: string | null | undefined): Destination | null {
  const c = (code ?? "").toUpperCase();
  return DESTINATIONS.find((d) => d.code === c) ?? null;
}

export function destinationBySlug(slug: string | null | undefined): Destination | null {
  return DESTINATIONS.find((d) => d.slug === slug) ?? null;
}

/** The page for a destination. Mauritius is the store's home, /esim itself. */
export function destinationPath(d: Destination, lang: "en" | "fr"): string {
  if (d.code === HOME_CODE) return lang === "en" ? "/esim" : "/fr/esim-maurice-rodrigues";
  return lang === "en" ? `/esim/${d.slug}` : `/fr/esim/${d.slug}`;
}

export const GROUP_LABEL: Record<Exclude<DestinationGroup, "home">, { en: string; fr: string }> = {
  "indian-ocean": { en: "Indian Ocean", fr: "Océan Indien" },
  africa: { en: "Africa", fr: "Afrique" },
  europe: { en: "Europe", fr: "Europe" },
  "middle-east": { en: "Layover hubs", fr: "Escales" },
  asia: { en: "Asia", fr: "Asie" },
  americas: { en: "Americas", fr: "Amériques" },
  oceania: { en: "Oceania", fr: "Océanie" },
};
