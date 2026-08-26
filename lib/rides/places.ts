// ── THE PLACES PEOPLE ACTUALLY ASK TO BE TAKEN TO ───────────────────────────
//
// Rodrigues is not a city, and this is the design decision that follows from
// that. A drag-a-pin map would be the wrong tool: there are perhaps forty places
// anyone names, every local knows them by name, and a tourist dragging a pin
// around a coastline they have never seen will drop it in the lagoon.
//
// A named list is faster on a slow connection, works for somebody who has never
// used a map app, and — the part that matters technically — yields EXACT
// coordinates, which is what pricing and driver ranking need. A free-text address
// gives neither.
//
// ── WHERE THESE COORDINATES COME FROM ───────────────────────────────────────
// Public landmarks: the airport, the ferry terminal, the villages and the beaches
// that appear on every map of the island. They are approximate to a few hundred
// metres, which is the right precision for a fare and a pickup — a driver
// collecting from "Pointe Coton" does not need six decimal places, they need the
// name their passenger will say out loud.
//
// This list is deliberately code rather than a table: it changes about once a
// year, it must work when the database is slow, and an owner does not want to
// maintain a gazetteer. Anything missing still books through "somewhere else",
// which prices on request instead of refusing the customer.

export type RidePlace = {
  id: string;
  name: string;
  /** The village or coast, to disambiguate two beaches with similar names. */
  area: string;
  lat: number | null;
  lng: number | null;
  /** Extra words somebody might type — old names, French spellings, misspellings. */
  aka?: string[];
};

export const RIDE_PLACES: RidePlace[] = [
  // ── The two that matter most: every transfer starts or ends at one ────────
  {
    id: "airport",
    name: "Plaine Corail Airport",
    area: "Plaine Corail · SZR",
    lat: -19.7577,
    lng: 63.361,
    aka: [
      "airport",
      "aeroport",
      "aéroport",
      "szr",
      "plaine corail",
      "sir gaetan duval",
    ],
  },
  {
    id: "ferry",
    name: "Port Mathurin ferry terminal",
    area: "Port Mathurin",
    lat: -19.6829,
    lng: 63.4189,
    aka: ["ferry", "boat", "bateau", "mauritius trochetia", "terminal", "port"],
  },

  // ── Towns and villages ───────────────────────────────────────────────────
  {
    id: "port-mathurin",
    name: "Port Mathurin",
    area: "Town centre",
    lat: -19.6836,
    lng: 63.4186,
    aka: ["town", "market", "bazar", "centre"],
  },
  {
    id: "mont-lubin",
    name: "Mont Lubin",
    area: "Centre of the island",
    lat: -19.7139,
    lng: 63.4126,
  },
  {
    id: "la-ferme",
    name: "La Ferme",
    area: "West",
    lat: -19.7247,
    lng: 63.3838,
  },
  {
    id: "riviere-cocos",
    name: "Rivière Cocos",
    area: "South west",
    lat: -19.7511,
    lng: 63.3861,
    aka: ["riviere coco", "rivière coco"],
  },
  {
    id: "baie-du-nord",
    name: "Baie du Nord",
    area: "North",
    lat: -19.6742,
    lng: 63.4394,
  },
  {
    id: "oyster-bay",
    name: "Baie aux Huîtres",
    area: "North west",
    lat: -19.6875,
    lng: 63.3975,
    aka: ["oyster bay", "baie aux huitres"],
  },
  {
    id: "grand-baie",
    name: "Grand Baie",
    area: "North east",
    lat: -19.6706,
    lng: 63.4653,
  },
  {
    id: "riviere-banane",
    name: "Rivière Banane",
    area: "East",
    lat: -19.6853,
    lng: 63.4736,
    aka: ["riviere banane"],
  },
  {
    id: "port-sud-est",
    name: "Port Sud-Est",
    area: "South east",
    lat: -19.7419,
    lng: 63.4514,
    aka: ["port sud est", "portsudest"],
  },
  {
    id: "graviers",
    name: "Graviers",
    area: "East",
    lat: -19.7014,
    lng: 63.4794,
  },
  {
    id: "st-francois",
    name: "Saint François",
    area: "East",
    lat: -19.6947,
    lng: 63.4831,
    aka: ["saint francois", "st francois"],
  },
  {
    id: "petit-gabriel",
    name: "Petit Gabriel",
    area: "Centre",
    lat: -19.7061,
    lng: 63.4225,
  },
  {
    id: "brulee",
    name: "Brûlée",
    area: "South",
    lat: -19.7431,
    lng: 63.4181,
    aka: ["brulee"],
  },
  {
    id: "quatre-vents",
    name: "Quatre Vents",
    area: "South east",
    lat: -19.7286,
    lng: 63.4636,
  },
  {
    id: "anse-quitor",
    name: "Anse Quitor",
    area: "South west",
    lat: -19.7539,
    lng: 63.3703,
  },
  {
    id: "citron-donis",
    name: "Citron Donis",
    area: "East",
    lat: -19.7181,
    lng: 63.4761,
  },
  {
    id: "roche-bon-dieu",
    name: "Roche Bon Dieu",
    area: "Centre",
    lat: -19.7106,
    lng: 63.4361,
  },

  // ── Beaches and places a visitor asks for by name ────────────────────────
  {
    id: "pointe-coton",
    name: "Pointe Coton",
    area: "East coast",
    lat: -19.6786,
    lng: 63.4864,
    aka: ["point coton", "cotton point"],
  },
  {
    id: "trou-dargent",
    name: "Trou d'Argent",
    area: "East coast",
    lat: -19.6994,
    lng: 63.4881,
    aka: ["trou d argent", "trou dargent"],
  },
  {
    id: "anse-ally",
    name: "Anse Ally",
    area: "North east",
    lat: -19.6708,
    lng: 63.4589,
    aka: ["anse alli"],
  },
  {
    id: "st-francois-beach",
    name: "Saint François beach",
    area: "East coast",
    lat: -19.6903,
    lng: 63.4869,
  },
  {
    id: "mourouk",
    name: "Mourouk",
    area: "South east",
    lat: -19.7594,
    lng: 63.4408,
    aka: ["mouruk", "mourouk ebony"],
  },
  {
    id: "anse-bouteille",
    name: "Anse Bouteille",
    area: "South east",
    lat: -19.7539,
    lng: 63.4589,
  },
  {
    id: "gravier-beach",
    name: "Graviers beach",
    area: "East coast",
    lat: -19.7031,
    lng: 63.4839,
  },
  {
    id: "caverne-patate",
    name: "Caverne Patate",
    area: "South west",
    lat: -19.7597,
    lng: 63.3789,
    aka: ["cave", "caverne", "patate"],
  },
  {
    id: "francois-leguat",
    name: "François Leguat tortoise reserve",
    area: "South west",
    lat: -19.7561,
    lng: 63.3894,
    aka: ["tortoise", "tortue", "leguat", "francois leguat"],
  },
  {
    id: "ile-aux-cocos",
    name: "Île aux Cocos jetty",
    area: "West · boat departure",
    lat: -19.6906,
    lng: 63.3778,
    aka: ["cocos", "ile aux cocos", "coco island"],
  },
  {
    id: "montagne-malgache",
    name: "Montagne Malgache",
    area: "Centre",
    lat: -19.7017,
    lng: 63.4028,
  },
  {
    id: "grande-montagne",
    name: "Grande Montagne reserve",
    area: "Centre east",
    lat: -19.7133,
    lng: 63.4525,
  },
  {
    id: "jardin-5-sens",
    name: "Jardin des 5 Sens",
    area: "Montagne Charlot",
    lat: -19.7192,
    lng: 63.4022,
    aka: ["jardin 5 sens", "five senses"],
  },
  {
    id: "hospital",
    name: "Queen Elizabeth Hospital",
    area: "Crève Cœur",
    lat: -19.6989,
    lng: 63.4133,
    aka: ["hospital", "hopital", "clinic", "queen elizabeth"],
  },
];

/** Strip accents and punctuation so "riviere" finds "Rivière". */
function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Places matching what has been typed so far.
 *
 * An empty query returns the whole list rather than nothing: on a first visit the
 * list IS the interface, and a blank screen with a search box teaches nobody what
 * their options are.
 */
export function searchPlaces(query: string, limit = 40): RidePlace[] {
  const q = norm(query);
  if (!q) return RIDE_PLACES.slice(0, limit);

  const scored = RIDE_PLACES.map((p) => {
    const name = norm(p.name);
    const area = norm(p.area);
    const aka = (p.aka ?? []).map(norm);
    // Ranked, not merely filtered: somebody typing "port" means Port Mathurin,
    // not Pointe Coton — so a name that STARTS with the query beats one that
    // merely contains it.
    let score = 0;
    if (name.startsWith(q)) score = 100;
    else if (aka.some((a) => a.startsWith(q))) score = 90;
    else if (name.includes(q)) score = 70;
    else if (aka.some((a) => a.includes(q))) score = 60;
    else if (area.includes(q)) score = 40;
    return { p, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.p.name.localeCompare(b.p.name));

  return scored.slice(0, limit).map((x) => x.p);
}

/** A place by id, for pre-filling a fixed destination. */
export function placeById(id: string): RidePlace | null {
  return RIDE_PLACES.find((p) => p.id === id) ?? null;
}

/**
 * The handful worth showing before anybody types.
 *
 * SIX, not eight. Eight is four rows of chips and measured 56px more than the
 * open picker could afford on a 812px phone — and the shortlist exists to make
 * the COMMONEST answers instant, not to be a gazetteer. Grand Baie and the
 * hospital came off; both are still one letter of typing away, which is all
 * the seventh and eighth entries ever were.
 *
 * ── WHY A SHORTLIST AND NOT THE WHOLE LIST ────────────────────────────────
 * searchPlaces("") returns all 35, which is right for a ride — a visitor is
 * browsing where they could go. A delivery is not browsing: it starts or ends
 * at the place you live, and thirty-five rows of beaches and viewpoints is a
 * list you have to READ before you can answer, which is the single slowest
 * moment on the form.
 *
 * These eight are chosen on one rule: WHERE PEOPLE ARE, not where people visit.
 * The town and the market, the centre of the island, the four inhabited coasts,
 * and the hospital — which is not a landmark here but one of the commonest real
 * destinations for somebody sending something to a relative.
 *
 * Everything else is still one letter of typing away, and anything not on the
 * list at all still goes through as free text. This ORDERS the list; it does
 * not shorten it.
 *
 * ── THE GAP THIS DOES NOT CLOSE ───────────────────────────────────────────
 * 35 named places against 182 localities in the 2022 census, and NO SHOPS AT
 * ALL. A shortcut list makes the existing entries faster to reach; it cannot
 * invent the ones that are missing. That list is the owner's to write.
 */
export const COMMON_PLACE_IDS = [
  "port-mathurin",
  "mont-lubin",
  "la-ferme",
  "oyster-bay",
  "riviere-cocos",
  "port-sud-est",
] as const;

export function commonPlaces(): RidePlace[] {
  // Mapped through placeById rather than filtered, so the ORDER above is the
  // order on screen — a filter would silently re-sort them into file order.
  return COMMON_PLACE_IDS.map(placeById).filter(
    (p): p is RidePlace => p !== null,
  );
}
