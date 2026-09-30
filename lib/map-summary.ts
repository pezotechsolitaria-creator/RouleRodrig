import type { MapLocation } from "@/lib/defaults";
import type { Language } from "@/lib/i18n";

// ── ONE SENTENCE THAT SAYS WHAT /map IS, COUNTED FROM THE MAP ───────────────
//
// SEO audit 2026-09-29 C10. /map ranks for about thirty "Rodrigues map"
// queries and its only prose was "Discover Rodrigues' hidden gems". This is
// the literal sentence those searches are looking for, and every number in it
// is counted from site_content.mapLocations at render — the same array the
// filter chips count, so "20 beaches" here and "Beach (20)" there cannot
// disagree. A category with nothing in it is left out rather than said as 0.

type Cat = MapLocation["category"];

/** Chip order in components/MapSection.tsx, so the sentence reads the same way. */
const ORDER: Cat[] = ["beach", "viewpoint", "restaurant", "landmark", "activity", "gas", "shop"];

// Kreol does not inflect plurals, so its forms are the same word twice.
const NOUN: Record<Language, Record<Cat, [string, string]>> = {
  en: {
    beach: ["beach", "beaches"],
    viewpoint: ["viewpoint", "viewpoints"],
    restaurant: ["restaurant", "restaurants"],
    landmark: ["landmark", "landmarks"],
    activity: ["activity", "activities"],
    gas: ["petrol station", "petrol stations"],
    shop: ["shop", "shops"],
  },
  fr: {
    beach: ["plage", "plages"],
    viewpoint: ["point de vue", "points de vue"],
    restaurant: ["restaurant", "restaurants"],
    landmark: ["site", "sites"],
    activity: ["activité", "activités"],
    gas: ["station-service", "stations-service"],
    shop: ["boutique", "boutiques"],
  },
  cr: {
    beach: ["laplaz", "laplaz"],
    viewpoint: ["pwin vi", "pwin vi"],
    restaurant: ["restoran", "restoran"],
    landmark: ["landmark", "landmark"],
    activity: ["aktivite", "aktivite"],
    gas: ["lestasion lesans", "lestasion lesans"],
    shop: ["laboutik", "laboutik"],
  },
};

const AND: Record<Language, string> = { en: "and", fr: "et", cr: "ek" };

function list(parts: string[], lang: Language): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} ${AND[lang]} ${parts[parts.length - 1]}`;
}

/** Null when there is nothing on the map — the section itself renders nothing then. */
export function mapSummary(locations: Pick<MapLocation, "category">[], lang: Language): string | null {
  const total = locations.length;
  if (total === 0) return null;

  const parts = ORDER.map((cat) => {
    const n = locations.filter((l) => l.category === cat).length;
    if (n === 0) return null;
    const [one, many] = NOUN[lang][cat];
    return `${n} ${n === 1 ? one : many}`;
  }).filter((p): p is string => p !== null);

  const breakdown = parts.length ? ` — ${list(parts, lang)} —` : ",";

  if (lang === "fr") {
    return `Carte de l'île Rodrigues avec ${total} ${total === 1 ? "lieu" : "lieux"}${breakdown} chacun avec l'itinéraire depuis votre position.`;
  }
  if (lang === "cr") {
    return `Kart zil Rodrig ar ${total} plas${breakdown} sakenn ar direksion depi kot ou ete.`;
  }
  return `Map of Rodrigues Island with ${total} ${total === 1 ? "place" : "places"}${breakdown} each with directions from where you are.`;
}
