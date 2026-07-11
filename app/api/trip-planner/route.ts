import { NextRequest, NextResponse } from 'next/server';
import { getContent } from '@/lib/content';
import { DEFAULT_CONTENT, type PlannerActivity, type MapLocation } from '@/lib/defaults';

// ── Rodrigues activity knowledge base ───────────────────────────────────────
// The pool of places is now editable from the admin dashboard (Trip Planner
// section). The day-by-day sequencing below stays automatic — the admin
// controls the real places, photos and descriptions; the planner arranges them.

type Activity = PlannerActivity;

const FALLBACK_ACTIVITIES: Activity[] = [
  // Beaches
  { id: 'grand-baie', name: 'Grand Baie Beach', emoji: '🏖️', type: 'beach', slot: 'morning', duration: '2–3 hrs', description: 'Wide sandy beach with crystal-clear water, perfect for swimming and snorkelling. A Rodrigues classic.', tip: 'Arrive before 9am for the calmest water. Bring snorkel gear — the reef is stunning.' },
  { id: 'saint-francois', name: 'Saint-François Lagoon', emoji: '🌊', type: 'beach', slot: 'morning', duration: '2–3 hrs', description: 'One of the Indian Ocean\'s most beautiful lagoons. Turquoise water, white sand, and untouched reef.', tip: 'Best before noon — the light on the water is magical. Combine with a ride along the eastern road.' },
  { id: 'trou-argent', name: 'Trou d\'Argent Beach', emoji: '🏝️', type: 'beach', slot: 'morning', duration: '2 hrs', description: 'Rodrigues\' most secluded beach — accessible only on foot via a cliffside path. Absolutely breathtaking.', tip: 'Park near Pointe Cotton and walk down (10 min). Go early — locals say it\'s the most beautiful beach in the whole Indian Ocean.' },
  { id: 'anse-mourouk', name: 'Anse Mourouk', emoji: '🌴', type: 'beach', slot: 'afternoon', duration: '2 hrs', description: 'A southern beach surrounded by dramatic coastal scenery. Quiet, wild, and very Rodriguan.', tip: 'Combine with a coastal ride through the south — the cliffs and views along the way are unforgettable.' },
  { id: 'riviere-banane', name: 'Rivière Banane Beach', emoji: '🌿', type: 'beach', slot: 'morning', duration: '1.5 hrs', description: 'A quiet, local beach near a river mouth. Great for a relaxed swim away from the tourist trail.', tip: 'Ask locals for the best spot to enter the water. Very peaceful on weekday mornings.' },
  { id: 'anse-quitor', name: 'Anse Quitor', emoji: '🐚', type: 'beach', slot: 'afternoon', duration: '1.5 hrs', description: 'A small, sheltered cove popular with local families. Great for snorkelling along the rocky edges.', tip: 'Bring your own supplies — no facilities here. The isolation is the whole point.' },

  // Culture & Landmarks
  { id: 'caverne-patate', name: 'Caverne Patate', emoji: '🪨', type: 'culture', slot: 'morning', duration: '2 hrs', description: 'Rodrigues\' most impressive limestone cave system with guided tours through underground chambers, stalagmites and stalactites.', tip: 'Book in advance — tours fill up. Wear closed shoes. The guide\'s storytelling is excellent.' },
  { id: 'market', name: 'Port Mathurin Saturday Market', emoji: '🛒', type: 'culture', slot: 'morning', duration: '2 hrs', description: 'The heart of Rodrigues life. Fresh produce, handmade crafts, street food, and the genuine soul of the island.', tip: 'Only on Saturdays, from 6am. Go early for the best pickled salads and freshly squeezed juices.' },
  { id: 'francois-leguat', name: 'François Leguat Giant Tortoise Reserve', emoji: '🐢', type: 'culture', slot: 'afternoon', duration: '2 hrs', description: 'Walk among thousands of giant tortoises and explore the reserve\'s unique caves. A wonderful nature experience for all ages.', tip: 'Allow extra time — you\'ll want to stay longer than planned. The caves inside are also fascinating.' },
  { id: 'port-mathurin', name: 'Port Mathurin Town Walk', emoji: '🏛️', type: 'culture', slot: 'morning', duration: '1.5 hrs', description: 'Stroll the colourful capital, visit St Gabriel Church, the market hall, and waterfront. Feel the island\'s French Creole character.', tip: 'The waterfront at sunrise is serene. Stop at a local bakery for a pain beurre before exploring.' },

  // Adventure
  { id: 'grand-montagne', name: 'Grande Montagne Nature Reserve', emoji: '🦜', type: 'adventure', slot: 'morning', duration: '2–3 hrs', description: 'Hike through endemic forest with incredible birdlife. Home to the rare Rodrigues warbler and fody.', tip: 'Start at 7am before the heat builds. The trail markers are clear and the birdlife is extraordinary in the early morning.' },
  { id: 'gombrani', name: 'Île Gombrani', emoji: '🤿', type: 'adventure', slot: 'morning', duration: '3–4 hrs', description: 'Boat trip to a small uninhabited islet surrounded by pristine coral reef. Some of the best snorkelling in Rodrigues.', tip: 'Book from Port Mathurin waterfront. Bring your own mask for a better fit — and sunscreen.' },
  { id: 'saint-francois-pt', name: 'Pointe Cotton to Saint-François', emoji: '🌊', type: 'adventure', slot: 'afternoon', duration: '2–3 hrs', description: 'The most spectacular coastal stretch on the island — dramatic cliffs and open lagoons between Pointe Cotton and Saint-François.', tip: 'Stop wherever looks good along the eastern road — the views are unforgettable.' },

  // Viewpoints
  { id: 'pointe-cotton', name: 'Pointe Cotton Cliffs', emoji: '🌅', type: 'viewpoint', slot: 'afternoon', duration: '1 hr', description: 'The most dramatic cliffs on the island. Sheer drops into the Indian Ocean with 180-degree views.', tip: 'Go in the afternoon for golden light on the cliffs. Wind can be strong — hold on to your hat.' },
  { id: 'roche-bon-dieu', name: 'Roche Bon Dieu at Sunset', emoji: '🌇', type: 'viewpoint', slot: 'evening', duration: '1 hr', description: 'The best sunset viewpoint on the island. Panoramic views over Port Mathurin and the lagoon turning gold.', tip: 'Arrive 30 minutes before sunset and bring a picnic. The colours are extraordinary on clear evenings.' },
  { id: 'mont-lubin', name: 'Mont Lubin Summit', emoji: '⛰️', type: 'viewpoint', slot: 'morning', duration: '1–2 hrs', description: 'The highest point of Rodrigues at 393m. On clear days you can see Mauritius on the horizon.', tip: 'Start early before clouds gather at the peak. The scooter ride up is part of the adventure.' },
  { id: 'plaine-corail', name: 'Plaine Corail Viewpoint', emoji: '✈️', type: 'viewpoint', slot: 'afternoon', duration: '45 min', description: 'The airstrip viewpoint where you can watch small planes arrive. Unique views across the southern plateau.', tip: 'A quick stop on the way south. Doubles as a great photography spot — the wide open plateau is striking.' },

  // Food & Evenings
  { id: 'lunch-local', name: 'Local Rodriguan Lunch', emoji: '🍛', type: 'food', slot: 'lunch', duration: '1 hr', description: 'Try octopus curry, smoked marlin, heart of palm salad and fresh tropical fruit juice. Rodriguan cuisine is unforgettable.', tip: 'Ask your guesthouse host where to eat — the best local places are always word-of-mouth and rarely online.' },
  { id: 'lunch-port', name: 'Lunch at Port Mathurin', emoji: '🥘', type: 'food', slot: 'lunch', duration: '1 hr', description: 'Grab lunch at one of the small restaurants around the market. Fresh fish, Creole stews, and local pickles.', tip: 'The fish is caught the same morning. Try the "carry poisson" — spiced tuna stew served over rice.' },
  { id: 'seafood-dinner', name: 'Fresh Seafood Dinner', emoji: '🦞', type: 'food', slot: 'evening', duration: '1.5 hrs', description: 'End your day with grilled lobster, calamari or reef fish caught that morning. The freshest seafood in the Indian Ocean.', tip: 'Many guesthouses serve dinner on request with produce from local fishers. Ask your host for tonight\'s catch.' },
  { id: 'rum-tasting', name: 'Local Rhum Arrangé Tasting', emoji: '🍹', type: 'food', slot: 'evening', duration: '1 hr', description: 'Sample Rodrigues\' famous fruit-infused rums — passion fruit, vanilla, ginger, and seasonal island fruits.', tip: 'Look for small home-producers who blend their own — far more interesting than shop bottles. Your host may have some.' },
  { id: 'sunset-drink', name: 'Sunset Drinks by the Lagoon', emoji: '🌅', type: 'food', slot: 'evening', duration: '1 hr', description: 'Find a quiet spot by the lagoon with a cold Dodo beer or local fruit punch as the sun sets over the Indian Ocean.', tip: 'The lagoon at Saint-François changes colour spectacularly at dusk. Pack drinks from the local shop.' },
];

// ── Island-guide locations → planner activities ─────────────────────────────
// Fold the map/island-guide places (which carry real photos + coordinates) into
// the activity pool so itineraries are richer, photo-rich and less repetitive.
const LOC_TYPE: Record<MapLocation["category"], Activity["type"] | null> = {
  beach: "beach",
  viewpoint: "viewpoint",
  restaurant: "food",
  landmark: "culture",
  activity: "adventure",
  gas: null, // petrol stations aren't attractions
};
const LOC_SLOT: Record<Activity["type"], Activity["slot"]> = {
  beach: "morning",
  culture: "morning",
  adventure: "afternoon",
  viewpoint: "afternoon",
  food: "lunch",
};
const LOC_EMOJI: Record<MapLocation["category"], string> = {
  beach: "🏖️", viewpoint: "🌅", restaurant: "🍽️", landmark: "🏛️", activity: "🤿", gas: "⛽",
};

function mapLocationsToActivities(locs: MapLocation[]): Activity[] {
  const out: Activity[] = [];
  for (const l of locs) {
    const type = LOC_TYPE[l.category];
    if (!type) continue;
    const image = l.images?.[0] || l.image;
    out.push({
      id: `loc-${l.id}`,
      name: l.name,
      emoji: LOC_EMOJI[l.category] ?? "📍",
      type,
      slot: LOC_SLOT[type],
      duration: type === "food" ? "1 hr" : "1–2 hrs",
      description: l.description || "A beautiful Rodrigues spot worth discovering.",
      tip: "Tap the map link for live directions and distance from where you are.",
      ...(image ? { image } : {}),
      mapsUrl: `https://www.google.com/maps/dir/?api=1&destination=${l.lat},${l.lng}`,
    });
  }
  return out;
}

// Day themes based on itinerary composition
const DAY_THEMES = [
  'Coastal Discovery',
  'Island Explorer',
  'Hidden Rodrigues',
  'Culture & Coast',
  'Wild & Wonderful',
  'Southern Adventure',
  'Perfect Last Day',
];

function pickUnused(pool: Activity[], used: Set<string>): Activity | undefined {
  const available = pool.filter((a) => !used.has(a.id));
  if (available.length === 0) return pool[Math.floor(Math.random() * pool.length)];
  return available[Math.floor(Math.random() * available.length)];
}

type Pace = "relaxed" | "balanced" | "packed";

// Google Maps helpers — one-tap navigation for every stop and the whole day.
// IMPORTANT: use a DIRECTIONS link (routes to the place), never a search link.
// A `/maps/search/?query=<name>` lists nearby *businesses* — which for names
// like "…Scooter Ride" surfaces competitor rental shops. Directions don't.
const mapsQuery = (name: string) =>
  `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(name + ", Rodrigues, Mauritius")}`;
function dayRouteUrl(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return mapsQuery(names[0]);
  const enc = (s: string) => encodeURIComponent(s + ", Rodrigues");
  const destination = enc(names[names.length - 1]);
  const waypoints = names.slice(0, -1).map(enc).join("|");
  return `https://www.google.com/maps/dir/?api=1&destination=${destination}&waypoints=${waypoints}`;
}

function buildItinerary(days: number, interests: string[], ACTIVITIES: Activity[], pace: Pace = "balanced") {
  const used = new Set<string>();
  const wantBeach = interests.includes('beach') || interests.includes('all');
  const wantCulture = interests.includes('culture') || interests.includes('all');
  const wantAdventure = interests.includes('adventure') || interests.includes('all');
  const wantFood = interests.includes('food') || interests.includes('all');

  const beaches = ACTIVITIES.filter((a) => a.type === 'beach');
  const cultures = ACTIVITIES.filter((a) => a.type === 'culture');
  const adventures = ACTIVITIES.filter((a) => a.type === 'adventure');
  const viewpoints = ACTIVITIES.filter((a) => a.type === 'viewpoint');
  const lunches = ACTIVITIES.filter((a) => a.slot === 'lunch');
  const evenings = ACTIVITIES.filter((a) => a.slot === 'evening');

  const itinerary = [];

  for (let d = 0; d < days; d++) {
    // Morning: bias toward beach if interested, else adventure/culture rotation
    let morningPool: Activity[];
    if (wantBeach && d % 2 === 0) {
      morningPool = beaches.filter((a) => a.slot === 'morning');
    } else if (wantAdventure && d % 3 === 1) {
      morningPool = adventures.filter((a) => a.slot === 'morning');
    } else if (wantCulture) {
      morningPool = cultures.filter((a) => a.slot === 'morning');
    } else {
      morningPool = [
        ...beaches.filter((a) => a.slot === 'morning'),
        ...cultures.filter((a) => a.slot === 'morning'),
      ];
    }
    if (morningPool.length === 0)
      morningPool = ACTIVITIES.filter((a) => a.slot === 'morning');

    const morning = pickUnused(morningPool, used);
    if (morning) used.add(morning.id);

    // Lunch
    const lunch = pickUnused(lunches, used);
    if (lunch) used.add(lunch.id);

    // Afternoon: culture, viewpoint, or adventure
    let afternoonPool: Activity[];
    if (wantCulture && d % 3 !== 2) {
      afternoonPool = [
        ...cultures.filter((a) => a.slot === 'afternoon'),
        ...viewpoints.filter((a) => a.slot === 'afternoon'),
      ];
    } else if (wantAdventure) {
      afternoonPool = adventures.filter((a) => a.slot === 'afternoon');
    } else {
      afternoonPool = [
        ...viewpoints.filter((a) => a.slot === 'afternoon'),
        ...beaches.filter((a) => a.slot === 'afternoon'),
      ];
    }
    if (afternoonPool.length === 0)
      afternoonPool = ACTIVITIES.filter((a) => a.slot === 'afternoon');

    const afternoon = pickUnused(afternoonPool, used);
    if (afternoon) used.add(afternoon.id);

    // Evening: always a viewpoint sunset or nice dinner
    let eveningPool: Activity[];
    if (d % 2 === 0) {
      eveningPool = viewpoints.filter((a) => a.slot === 'evening');
      if (eveningPool.length === 0) eveningPool = evenings;
    } else {
      eveningPool = wantFood ? evenings : viewpoints.filter((a) => a.slot === 'evening');
      if (eveningPool.length === 0) eveningPool = evenings;
    }

    const evening = pickUnused(eveningPool, used);
    if (evening) used.add(evening.id);

    // Packed days get one extra stop (a viewpoint or adventure) in the late
    // afternoon; relaxed days drop the evening to leave the day breathing room.
    let extra: Activity | undefined;
    if (pace === "packed") {
      const extraPool = [
        ...viewpoints.filter((a) => a.slot === "afternoon"),
        ...adventures.filter((a) => a.slot === "afternoon"),
        ...ACTIVITIES.filter((a) => a.slot === "afternoon"),
      ];
      extra = pickUnused(extraPool, used);
      if (extra) used.add(extra.id);
    }

    const slotted = [
      morning   ? { ...morning,   slot: "Morning" }        : null,
      lunch     ? { ...lunch,     slot: "Lunch" }          : null,
      afternoon ? { ...afternoon, slot: "Afternoon" }      : null,
      pace === "packed" && extra ? { ...extra, slot: "Late afternoon" } : null,
      pace === "relaxed" ? null : (evening ? { ...evening, slot: "Evening" } : null),
    ].filter(Boolean) as Activity[];

    // Attach one-tap navigation to each stop (prefer the place's own precise
    // Google reference) + a full-day route link.
    const activities = slotted.map((a) => ({ ...a, mapsUrl: a.mapsUrl || mapsQuery(a.name) }));

    itinerary.push({
      day: d + 1,
      theme: DAY_THEMES[d % DAY_THEMES.length],
      mapsUrl: dayRouteUrl(activities.map((a) => a.name)),
      activities,
    });
  }

  return itinerary;
}

export async function POST(req: NextRequest) {
  try {
    const { days = 3, interests = ['all'], pace = 'balanced' } = await req.json() as {
      days: number;
      interests: string[];
      pace?: Pace;
    };

    const clampedDays = Math.max(1, Math.min(7, days));
    const safePace: Pace = pace === 'relaxed' || pace === 'packed' ? pace : 'balanced';

    // Pull the admin-managed places (real info + photos); fall back to built-ins
    let base: Activity[] = FALLBACK_ACTIVITIES;
    let fromMap: Activity[] = [];
    try {
      const content = await getContent();
      if (content.plannerActivities && content.plannerActivities.length > 0) {
        base = content.plannerActivities;
      }
      // Enrich with the island-guide locations (real photos + coordinates).
      fromMap = mapLocationsToActivities(content.mapLocations || []);
    } catch {
      base = FALLBACK_ACTIVITIES.length ? FALLBACK_ACTIVITIES : DEFAULT_CONTENT.plannerActivities;
    }

    // Merge, de-duped by name (copy first — never mutate the shared const pool).
    const activities: Activity[] = [...base];
    const seen = new Set(activities.map((a) => a.name.trim().toLowerCase()));
    for (const la of fromMap) {
      const key = la.name.trim().toLowerCase();
      if (!seen.has(key)) {
        activities.push(la);
        seen.add(key);
      }
    }

    const itinerary = buildItinerary(clampedDays, interests, activities, safePace);

    return NextResponse.json({ itinerary });
  } catch {
    return NextResponse.json({ error: 'Failed to generate itinerary' }, { status: 500 });
  }
}
