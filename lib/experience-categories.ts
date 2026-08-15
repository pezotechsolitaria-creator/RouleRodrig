import type { RecommendedPlace } from "./defaults";

// ── One taxonomy across every vertical ──────────────────────────────────────
//
// Until now an experience was filtered by SUBSTRING MATCH against its own free
// text: `matchesFilter` joined highlights + name + description and asked
// whether the chip's word appeared anywhere in it. That is why "family" matched
// a charter describing itself as a "family-run business", and why a listing had
// to be phrased a particular way to be findable at all.
//
// It also could not cross verticals. Fishing had its own chips, boat had its
// own, massage had its own — so "romantic" on a sunset cruise and "romantic" on
// a couples massage were unrelated strings that happened to look alike. There
// was no way to ask the catalogue a question like "what is romantic on this
// island", which is exactly the question a visitor has.
//
// So: a fixed vocabulary, assigned per listing, shared by every vertical. A
// listing carries MANY categories — a sunset charter is genuinely Ocean AND
// Romantic AND Photography — which is the whole point of the many-to-many.

export const EXPERIENCE_CATEGORIES = [
  { key: "ocean", emoji: "🌊", en: "Ocean & Water", fr: "Mer & lagon" },
  { key: "adventure", emoji: "🥾", en: "Adventure & Nature", fr: "Aventure & nature" },
  { key: "fishing", emoji: "🎣", en: "Fishing", fr: "Pêche" },
  { key: "food", emoji: "🍽️", en: "Food & Culture", fr: "Cuisine & culture" },
  { key: "wellness", emoji: "💆", en: "Wellness", fr: "Bien-être" },
  { key: "romantic", emoji: "💑", en: "Romantic", fr: "Romantique" },
  { key: "family", emoji: "👨‍👩‍👧", en: "Family", fr: "En famille" },
  { key: "premium", emoji: "✨", en: "Private & Premium", fr: "Privé & premium" },
  { key: "photo", emoji: "📸", en: "Photography", fr: "Photographie" },
  { key: "evening", emoji: "🌙", en: "Nightlife & Evening", fr: "Soirée" },
  { key: "local", emoji: "📍", en: "Local & Authentic", fr: "Local & authentique" },
] as const;

export type CategoryKey = (typeof EXPERIENCE_CATEGORIES)[number]["key"];

const KEYS = new Set<string>(EXPERIENCE_CATEGORIES.map((c) => c.key));

/**
 * Words that mean a category, for listings nobody has tagged yet.
 *
 * The fallback matches an untagged listing's own prose, and the category KEY is
 * almost never a word anybody writes: no charter describes itself as "ocean",
 * they say snorkelling, lagoon, sea trip. Matching on the bare key found
 * nothing and every chip disappeared — which is worse than the imprecise
 * filtering this replaces.
 *
 * These are deliberately generous, because a false positive on an UNTAGGED
 * listing costs a slightly wrong chip, while a false negative costs the
 * listing being unfindable. The moment the owner tags it, none of this applies
 * — tags win outright.
 */
const SYNONYMS: Record<CategoryKey, string[]> = {
  ocean: ["ocean", "sea", "lagoon", "snorkel", "snorkelling", "boat", "water", "island", "islet", "kayak", "dive", "swim"],
  adventure: ["adventure", "hike", "hiking", "trail", "trek", "walk", "nature", "mountain", "kite", "zip"],
  fishing: ["fishing", "fish", "peche", "pêche", "angling", "big game", "line"],
  food: ["food", "cuisine", "cooking", "tasting", "lunch", "dinner", "culture", "market", "rum", "honey"],
  wellness: ["massage", "wellness", "spa", "relax", "relaxation", "deep tissue", "therap"],
  romantic: ["romantic", "couple", "honeymoon", "sunset", "private dinner", "duo", "two"],
  family: ["family", "kids", "children", "child", "family-friendly"],
  premium: ["private", "premium", "exclusive", "vip", "charter", "luxury"],
  photo: ["photo", "photography", "sunset", "viewpoint", "scenic", "panorama"],
  evening: ["evening", "night", "sunset", "stargaz", "moon", "after dark"],
  local: ["local", "authentic", "traditional", "creole", "village", "artisan", "heritage"],
};

/** Is this a category we actually publish? Guards against stale saved keys. */
export function isCategoryKey(key: string): key is CategoryKey {
  return KEYS.has(key);
}

export function categoryLabel(key: string, lang: string): string {
  const c = EXPERIENCE_CATEGORIES.find((x) => x.key === key);
  if (!c) return key;
  return lang === "fr" ? c.fr : c.en;
}

/**
 * The categories a listing is actually in.
 *
 * Unknown keys are dropped rather than rendered: a category removed from the
 * vocabulary must not leave a bare slug on a card, and the owner's saved data
 * is not rewritten just because the list changed.
 */
export function categoriesOf(place: RecommendedPlace): CategoryKey[] {
  return (place.categories ?? []).filter(isCategoryKey);
}

/**
 * Does this listing belong in this category?
 *
 * TAGS FIRST, TEXT SECOND — and the fallback is the important half. Every
 * listing that predates this has no tags, and if tagging were required they
 * would all vanish from every filter the moment it shipped. So an untagged
 * listing keeps the old substring behaviour, and a tagged one is judged purely
 * on its tags. The owner converts the catalogue at their own pace, and the
 * filters get sharper listing by listing rather than all at once.
 */
export function inCategory(
  place: RecommendedPlace,
  key: string,
  fallback: (p: RecommendedPlace, k: string) => boolean,
): boolean {
  const tags = categoriesOf(place);
  if (tags.length > 0) return tags.includes(key as CategoryKey);
  // Untagged: try the category's synonyms against the listing's own prose,
  // because nobody writes "ocean" — they write "snorkelling".
  if (!isCategoryKey(key)) return false;
  return SYNONYMS[key].some((word) => fallback(place, word));
}

/**
 * Which categories are worth offering, given what is actually listed.
 *
 * A chip that returns nothing teaches people the filters are decorative, so
 * only categories with at least one listing behind them are shown — in the
 * vocabulary's own order, not the order the catalogue happens to be in, so the
 * chip row does not reshuffle itself every time the owner adds a listing.
 */
export function availableCategories(
  places: RecommendedPlace[],
  fallback: (p: RecommendedPlace, k: string) => boolean,
): CategoryKey[] {
  return EXPERIENCE_CATEGORIES.map((c) => c.key).filter((key) =>
    places.some((p) => inCategory(p, key, fallback)),
  );
}
