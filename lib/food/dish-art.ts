// ── What a dish looks like when nobody has photographed it ─────────────────
//
// FoodCard's own header says it plainly: "the photograph — on a phone it IS the
// product; everything else is a caption." That is the right hierarchy, and it
// has one failure mode nobody had seen until the restaurants went live with 17
// of 19 dishes carrying no image. The fallback was a 26px grey cutlery icon
// centred in a 4:3 box, so the whole surface rendered as a grid of near-empty
// dark rectangles — a page that looks unfinished rather than a page that looks
// like dinner.
//
// The honest fix is photographs, and the owner should take them. But "upload 17
// photos" is not something a customer browsing tonight benefits from, and the
// empty state has to hold the design on its own until then. So a dish with no
// photo gets a deliberate one: a warm gradient tile with a large glyph chosen
// from what the dish actually is.
//
// TWO RULES THIS FOLLOWS.
//
// 1. DETERMINISTIC. The hash is over the dish slug, so a dish looks the same on
//    every render, on the server and the client, forever. Math.random() here
//    would be a hydration mismatch AND a grid that reshuffles its own colours
//    on every navigation.
// 2. IT DISAPPEARS. The moment a real photo is uploaded this code stops running
//    for that dish. It is scaffolding for a missing asset, not a house style,
//    and it must never compete with a real photograph.

/** Deep, food-warm pairs that all sit correctly on `bg-dark`. */
const PALETTE: readonly (readonly [string, string])[] = [
  ["#3A2410", "#1A1208"], // roasted / grilled
  ["#3B1B14", "#180D0A"], // rougaille, tomato, chilli
  ["#123028", "#0A1712"], // herbs, greens, salads
  ["#33260C", "#171105"], // curry, turmeric, fried
  ["#122A38", "#0A1620"], // fish, seafood, ocean
  ["#2E1630", "#150A16"], // dessert, sweet, coconut
] as const;

/**
 * Keyword → glyph, in the vocabulary the /food category chips already use, and
 * ordered most-specific first: "grilled fish" must read as fish, not as grill,
 * and "ourite" (octopus) is the island word a Rodriguan dish is actually
 * named with.
 */
const GLYPHS: readonly (readonly [RegExp, string, number])[] = [
  [/ourite|octopus|calamar|squid/i, "🐙", 4],
  [/poisson|fish|thon|tuna|dorade|capitaine|seafood|crevette|shrimp|crab|cari.*mer/i, "🐟", 4],
  [/napolitain|dessert|gateau|cake|sweet|coco|coconut|glace|ice/i, "🍰", 5],
  [/mine|noodle|nouille|bol renversé|chow|fried rice/i, "🍜", 3],
  [/boulette|dumpling|siomai|samosa|gato|snack|piment/i, "🥟", 3],
  [/curry|cari|rougaille|masala|vindaye|daube/i, "🥘", 1],
  [/grill|bbq|barbec|rôti|roti|braise/i, "🔥", 0],
  [/salade|salad|legume|vegetable|veg\b|bredes/i, "🥗", 2],
  [/poulet|chicken|beef|boeuf|porc|pork|mouton|lamb|viande/i, "🍖", 0],
  [/riz|rice|briani|biryani/i, "🍛", 3],
  [/soupe|soup|bouillon|broth/i, "🍲", 2],
] as const;

/** Stable, tiny, and never negative — the only property this hash needs. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export type DishArt = { from: string; to: string; glyph: string };

/**
 * The look for a dish with no photograph.
 *
 * `text` should be everything known about the dish (name + descriptor): a dish
 * called "Catch of the day" is only identifiable as fish from its description,
 * and matching on the name alone sends it to the generic plate.
 */
export function dishArt(slug: string, text: string): DishArt {
  let glyph = "🍽️";
  let paletteIndex: number | null = null;

  for (const [re, g, palette] of GLYPHS) {
    if (re.test(text)) {
      glyph = g;
      paletteIndex = palette;
      break;
    }
  }

  // An unrecognised dish still gets a stable colour rather than one flat
  // default, so a menu of unusual names is varied instead of uniform.
  const idx = paletteIndex ?? hash(slug) % PALETTE.length;
  const [from, to] = PALETTE[idx];
  return { from, to, glyph };
}
