// The shapes the food surface speaks in.
//
// These mirror the `card` jsonb built inside the food_catalog view (M51) — the
// view is the single source of what a dish IS, and this file is its TypeScript
// declaration, not a second opinion. If a field is added there, add it here;
// never compute a field here that the view could have computed, or the two
// start describing the same dish differently.

/** Why a dish cannot be ordered right now. Null when it can. */
export type FoodUnavailableReason =
  | "sold_out"
  | "wrong_day"
  | "wrong_time"
  | "off_menu"
  | "kitchen_closed"
  | "missing";

export type FoodCard = {
  /** products.id */
  id: string;
  /** Island-unique dish slug — the /food/[slug] path segment. */
  slug: string;
  name: string;
  descriptor: string | null;
  descriptorFr: string | null;
  descriptorCr: string | null;
  /** Minor units (cents of MUR), like every other price in this system. */
  price: number;
  currency: string;
  imageUrl: string | null;
  /**
   * Every photo of this dish, cover first — so the card cycles rather than
   * hiding the kitchen's other shots behind a tap. Attached after the browse
   * RPC (see withGalleries in lib/food/queries.ts). Optional because that
   * lookup is best-effort: the card must still work from `imageUrl` alone.
   */
  imageUrls?: string[];
  prepMin: number | null;
  prepMax: number | null;
  /** 0 none · 1 mild · 2 hot · 3 very hot */
  spiceLevel: number;
  dietary: string[];
  mealTimes: string[];
  isSignature: boolean;
  serves: number | null;
  stock: number;
  /**
   * Non-null only when the dish has exactly ONE sellable variant, which is what
   * makes one-tap add possible. Null means the customer has a real choice to
   * make and the UI must open the chooser — that is correct, not a fallback.
   */
  variantId: string | null;
  variantCount: number;
  /** The kitchen is metadata. It scopes the cart; it is never a destination. */
  kitchenId: string;
  kitchenName: string;
  kitchenOpen: boolean;
  /**
   * Halal certification is held by the KITCHEN, so it travels with every dish
   * that kitchen makes rather than being repeated on each recipe. The dish-level
   * `dietary` tag still means what it always meant — this ingredient list is
   * halal — and the two are shown differently, because "we say so" and
   * "somebody certified it" are not the same promise.
   */
  kitchenHalalCertified: boolean;
  kitchenHalalCertifier: string | null;
  categories: string[];
  /**
   * CAN GO IN THE BASKET (M216). For a walk-up kitchen that is still "cookable
   * right now"; for a kitchen that needs notice it stays true while the kitchen
   * is closed, because the order is for a later slot and food_pickup_slots()
   * re-checks the dish at every time it offers.
   */
  orderable: boolean;
  reason: FoodUnavailableReason | null;
  /**
   * Hours ahead this kitchen must be booked (M216, kitchen_notice_hours()).
   * 0 = walk-up. Above 0 the customer must pick a slot at checkout — ASAP is
   * refused — so prepMin/prepMax describe the cooking once it starts, never
   * when the food can be had, and no surface may show them as a promise.
   */
  minNoticeHours: number;
  /**
   * Cookable RIGHT NOW (M216): M161's old meaning of `orderable`. Always false
   * for a notice kitchen. "Ready now" and "Ready to order now" read this.
   */
  readyNow: boolean;
};

export type FoodVariant = {
  id: string;
  name: string | null;
  price: number;
  compareAt: number | null;
  stock: number;
  options: Record<string, unknown>;
};

export type FoodDetail = FoodCard & {
  description: string | null;
  allergens: string | null;
  images: string[];
  variants: FoodVariant[];
  related: FoodCard[];
  pickupHint: string | null;
  /** The kitchen's address and exact pin. Null pin = no pin; say so, never guess. */
  kitchenAddress: string | null;
  kitchenLat: number | null;
  kitchenLng: number | null;
  kitchenSlug: string;
  /**
   * The kitchen's own public WhatsApp (M95), falling back to its phone.
   *
   * Since M89 every order is a bank transfer, which a visitor holding a
   * foreign card cannot make — for that customer this link is the only route
   * from "I want this" to "I ate it". It is also who you call at 20:00 when an
   * order goes wrong.
   */
  kitchenWhatsapp: string | null;
  kitchenPhone: string | null;
};

export type FoodCategory = {
  slug: string;
  name: string;
  nameFr: string | null;
  nameCr: string | null;
  emoji: string | null;
  imageUrl: string | null;
  count: number;
};

export type FoodRail = { key: string; title: string; items: FoodCard[] };

/**
 * A kitchen as the /food seller rail shows it (M168).
 *
 * Derived from food_catalog, never from food_kitchens directly, so a kitchen
 * appears here only while at least one of its dishes is already visible on
 * /food. That is what stops the rail advertising a shop the catalogue hides.
 */
export type FoodKitchenSummary = {
  slug: string;
  name: string;
  logoUrl: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  /** Inside its opening hours right now — an hours fact, not "ready now". */
  isOpen: boolean;
  /** Hours ahead it must be booked (M216). 0 = walk-up. */
  minNoticeHours: number;
  dishCount: number;
  pickupHint: string | null;
  halal: boolean;
  ratingAvg: number | null;
  ratingCount: number | null;
};

/** One kitchen and its whole menu, for /food/k/[slug]. */
export type FoodKitchenDetail = FoodKitchenSummary & {
  coverUrl: string | null;
  description: string | null;
  phone: string | null;
  whatsapp: string | null;
  /** Cooking time once started. Not a promise when minNoticeHours > 0. */
  prepMin: number | null;
  prepMax: number | null;
  halalCertifier: string | null;
  items: FoodCard[];
};

export type FoodHome = {
  meal: "breakfast" | "lunch" | "dinner" | "snack";
  rails: FoodRail[];
  categories: FoodCategory[];
  /** The seller layer (M168). Open kitchens first, then by menu size. */
  kitchens: FoodKitchenSummary[];
  /**
   * Kitchens inside their opening hours — NOT kitchens that can feed anybody
   * now. Since M216 an open kitchen may be booking for tomorrow; "N cooking
   * now" and the "Ready now" chip use walkUpKitchensServingNow(kitchens).
   */
  kitchensOpen: number;
  dishCount: number;
  deliveryEnabled: boolean;
  /** Cheapest active delivery zone fee, minor units. Null when none is active. */
  deliveryFeeFrom: number | null;
};

export type FoodBrowseResult = {
  total: number;
  limit: number;
  offset: number;
  items: FoodCard[];
};

/** Sort keys accepted by browse_food(). Anything else falls back to recommended. */
export const FOOD_SORTS = ["recommended", "price_asc", "price_desc", "fastest", "newest"] as const;
export type FoodSort = (typeof FOOD_SORTS)[number];

export const MEAL_TIMES = ["breakfast", "lunch", "dinner", "snack"] as const;
export type MealTime = (typeof MEAL_TIMES)[number];

// The dietary vocabulary is a plain string[] in the database on purpose (an
// enum change is a migration, and a menu's vocabulary moves faster than that).
// This is the list the ADMIN offers and the filter bar renders — extending it
// is a one-line change here, and an unknown tag already in the data keeps
// working because nothing validates against a closed set at read time.
export const DIETARY_TAGS = [
  "vegetarian",
  "vegan",
  "seafood",
  "contains_pork",
  "contains_nuts",
  "gluten_free",
  "halal",
  "spicy",
] as const;
export type DietaryTag = (typeof DIETARY_TAGS)[number];

export const DIETARY_LABEL: Record<string, string> = {
  vegetarian: "Vegetarian",
  vegan: "Vegan",
  seafood: "Seafood",
  contains_pork: "Contains pork",
  contains_nuts: "Contains nuts",
  gluten_free: "Gluten free",
  halal: "Halal",
  spicy: "Spicy",
};

/** What to tell the customer, per reason. Short — it sits on a card. */
export const UNAVAILABLE_LABEL: Record<FoodUnavailableReason, string> = {
  sold_out: "Sold out today",
  wrong_day: "Not cooked today",
  wrong_time: "Not served now",
  off_menu: "Off the menu",
  kitchen_closed: "Kitchen closed",
  missing: "Unavailable",
};
