// Food search: the vocabulary layer.
//
// ── WHY THIS IS TYPESCRIPT AND NOT SQL ──────────────────────────────────────
// browse_food() does the MATCHING — full-text over the product vector, plus a
// literal fallback across the descriptor, the category slugs and the dietary
// tags. What it deliberately does NOT do is decide what words mean, because on
// this island that question has a specific and moving answer:
//
//   a visitor types "octopus"    · the menu says "ourite"
//   a French visitor types "poulet" · the menu says "chicken"
//   a local types "ourit"        · the menu says "ourite"
//   anyone types "cheap"         · that is a PRICE, not a word in any dish name
//
// Keeping the vocabulary here means it is testable, it is reviewable in a diff,
// and the owner's next correction ("nobody calls it that") is a one-line change
// rather than a migration. The day this wants to be a real semantic search,
// this is the only file that has to change: browse_food() already accepts an
// OR'd websearch query and would not notice.
//
// ── WHAT IT DOES NOT DO ─────────────────────────────────────────────────────
// No fake AI. There is no model here, no embedding and no LLM call — just a
// synonym table and two intent rules that are honest about being rules. A
// natural-language layer that guesses would be worse than a lookup that is
// right, and it would cost money per search on a site that has to stay free to
// run.

/** A parsed query: words to match on, plus the intents pulled out of it. */
export type FoodQuery = {
  /** The OR'd term list to hand browse_food(), or null for "no text filter". */
  q: string | null;
  /** Rs ceiling in minor units, when the query expressed a budget. */
  maxPrice: number | null;
  /** Meal time, when the query named one ("breakfast", "dinner"). */
  meal: string | null;
  /** Dietary tags the query implied ("vegetarian", "vegan"). */
  dietary: string[];
};

// Local ⇄ visitor vocabulary. Keys and values are all lower case; the expansion
// is symmetric (every group expands to the whole group), so it does not matter
// which word the customer happens to know.
const SYNONYM_GROUPS: string[][] = [
  ["ourite", "ourit", "octopus", "pieuvre", "poulpe"],
  ["fish", "poisson", "pwason"],
  ["chicken", "poulet", "pouler"],
  ["beef", "boeuf", "bef"],
  ["pork", "porc", "kochon"],
  ["prawn", "prawns", "shrimp", "crevette", "crevettes", "camaron"],
  ["crab", "crabe", "krab"],
  ["curry", "cari", "kari"],
  ["rougaille", "rougay"],
  ["boulettes", "boulette", "dumpling", "dumplings"],
  ["achard", "achards", "pickle", "pickles"],
  ["rice", "riz", "diri"],
  ["noodles", "mine", "mien", "nouilles"],
  ["salad", "salade", "salad"],
  // ── ACCENTS THE MENU HAS AND THE SEARCH BOX DOES NOT ──────────────────────
  // normalize() strips accents from what the customer types, but the product
  // search_vector is to_tsvector('simple', ...), which keeps them. So the menu
  // spelling "Mine Frite Légumes" indexes as `frite` and `légumes` while a
  // customer's "mine frit legume" arrives as `frit` and `legume` — three near
  // misses in one dish name. Correcting the menu's French would have quietly
  // made that dish unfindable by the word it is named after.
  //
  // Fixed HERE rather than by keeping the misspelling, because this is the file
  // whose whole job is that the customer's word and the menu's word do not have
  // to be the same word. Note "veg" is absent on purpose: DIETARY_WORDS claims
  // it as a vegetarian filter before synonyms are ever consulted.
  ["vegetable", "vegetables", "legume", "legumes", "légumes", "bredes"],
  ["fried", "frit", "frite", "frits", "frites"],
  ["sandwich", "sandwiches", "burger", "burgers"],
  ["cake", "gateau", "gato"],
  ["juice", "jus", "dilo"],
  ["honey", "miel", "dimiel"],
  ["chilli", "chili", "piment", "pima"],
  ["lemon", "citron", "limon"],
  ["coconut", "coco", "kokonat"],
  ["breakfast", "petit-dejeuner", "gramatin"],
  ["dessert", "desserts", "deser", "sweet", "sweets"],
];

const SYNONYMS: Map<string, string[]> = (() => {
  const m = new Map<string, string[]>();
  for (const group of SYNONYM_GROUPS) for (const word of group) m.set(word, group);
  return m;
})();

// Words that carry an INTENT rather than naming a dish. Left in the term list
// they match nothing and drag the whole query to zero results, so they are
// consumed here and turned into a real filter instead.
const MEAL_WORDS: Record<string, string> = {
  breakfast: "breakfast",
  "petit-dejeuner": "breakfast",
  gramatin: "breakfast",
  morning: "breakfast",
  lunch: "lunch",
  dejeuner: "lunch",
  midi: "lunch",
  dinner: "dinner",
  diner: "dinner",
  supper: "dinner",
  evening: "dinner",
  tonight: "dinner",
  snack: "snack",
  snacks: "snack",
};

const DIETARY_WORDS: Record<string, string> = {
  vegetarian: "vegetarian",
  vegetarien: "vegetarian",
  veggie: "vegetarian",
  veg: "vegetarian",
  vegan: "vegan",
  // Both spellings are in everyday use in Mauritius, and somebody searching for
  // food they are allowed to eat should not have to guess ours.
  halal: "halal",
  halaal: "halal",
  hallal: "halal",
  "gluten-free": "gluten_free",
  glutenfree: "gluten_free",
  spicy: "spicy",
  hot: "spicy",
  pimente: "spicy",
};

// "cheap", "budget", "bon marché" — a real and common way to search that names
// no dish at all. Mapped to a ceiling rather than dropped, so the query does
// something instead of returning nothing. Rs 250 is a deliberate island figure:
// a plate of local food, not a Mauritius-mainland restaurant price.
const CHEAP_WORDS = new Set(["cheap", "budget", "affordable", "bomarse", "pas cher", "pascher"]);
const CHEAP_CEILING_MINOR = 25_000;

const NOISE = new Set([
  "a", "an", "the", "some", "something", "anything", "for", "with", "and", "or",
  "me", "i", "want", "wanna", "like", "eat", "food", "to", "of", "in", "on",
  "please", "du", "de", "la", "le", "les", "un", "une", "je", "veux", "manger",
  // The words that INTRODUCE a budget. The number itself is already consumed by
  // the price regex above, but "under" was surviving as a search term — and a
  // term that matches no dish name drags the entire query to zero results, so
  // "under 300" returned nothing at all while the ceiling it set went unused.
  // Caught by a test, not in production.
  "under", "below", "less", "than", "max", "maximum", "moins", "sous", "rs", "rupees",
]);

/** Strip accents and punctuation so "poulet grillé!" and "poulet grille" agree. */
function normalize(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Turn what the customer typed into what browse_food() should be asked.
 *
 * Intent words become FILTERS and leave the term list; everything else is
 * expanded through the synonym table and OR'd, because websearch_to_tsquery
 * treats a bare space as AND and "grilled fish" would otherwise require both
 * words in one dish name.
 */
export function parseFoodQuery(raw: string | null | undefined): FoodQuery {
  const empty: FoodQuery = { q: null, maxPrice: null, meal: null, dietary: [] };
  const text = normalize(raw ?? "");
  if (!text) return empty;

  let maxPrice: number | null = null;
  let meal: string | null = null;
  const dietary = new Set<string>();

  // "under 300", "less than 250", "300 rs" — an explicit budget beats the
  // "cheap" default, and is read before tokenising so the number is not left
  // behind as a term that matches no dish.
  const underMatch = text.match(/(?:under|below|less than|max|moins de|sous)\s*(?:rs\.?\s*)?(\d{2,5})/);
  const rsMatch = text.match(/(?:rs\.?\s*)(\d{2,5})/);
  const amount = underMatch?.[1] ?? rsMatch?.[1];
  if (amount) {
    const rupees = parseInt(amount, 10);
    if (Number.isFinite(rupees) && rupees > 0) maxPrice = rupees * 100;
  }

  const terms = new Set<string>();
  for (const token of text.split(" ")) {
    if (!token || NOISE.has(token) || /^\d+$/.test(token)) continue;

    if (MEAL_WORDS[token]) { meal ??= MEAL_WORDS[token]; continue; }
    if (DIETARY_WORDS[token]) { dietary.add(DIETARY_WORDS[token]); continue; }
    if (CHEAP_WORDS.has(token)) { maxPrice ??= CHEAP_CEILING_MINOR; continue; }

    // A word too short to be a dish name is almost always a fragment of one
    // ("bo", "gr"). Matching on it returns the whole menu.
    if (token.length < 3) continue;

    for (const word of SYNONYMS.get(token) ?? [token]) terms.add(word);
  }

  return {
    // Quoted so a multi-word synonym ("petit-dejeuner") survives as one term
    // rather than being re-split by websearch_to_tsquery.
    q: terms.size ? [...terms].map((t) => `"${t}"`).join(" OR ") : null,
    maxPrice,
    meal,
    dietary: [...dietary],
  };
}

/**
 * Does this query express anything at all? A search of only noise words
 * ("something to eat") should show the ordinary catalog rather than an empty
 * result — it is a hungry customer, not a failed query.
 */
export function isEmptyFoodQuery(q: FoodQuery): boolean {
  return q.q === null && q.maxPrice === null && q.meal === null && q.dietary.length === 0;
}
