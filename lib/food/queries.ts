import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { withGalleries } from "@/lib/product-gallery";
import type {
  FoodBrowseResult,
  FoodDetail,
  FoodHome,
  FoodKitchenDetail,
  FoodSort,
} from "./types";
import { FOOD_SORTS } from "./types";
import { parseFoodQuery } from "./search";

// Server-side reads for /food.
//
// Every one of these is a single RPC call, because the SHAPE of a food card is
// defined once in the food_catalog view (M51) and this layer's only job is to
// ask for it. There is deliberately no assembly here: the moment TypeScript
// starts computing "is this orderable" or "which prep time wins", the database
// and the UI have two answers to the same question and one of them is wrong.

/** Everything the /food landing screen renders, in one round trip. */
export async function getFoodHome(supabase: SupabaseClient): Promise<FoodHome | null> {
  const { data, error } = await supabase.rpc("food_home");
  if (error) {
    console.error("food_home failed", error);
    return null;
  }
  const home = (data as FoodHome) ?? null;
  if (!home) return null;

  // The landing rails come from here, not from browseFood — so they need the
  // galleries attached too, or /food would be the one food surface still
  // showing a single photo per dish. One lookup covers every rail: the dishes
  // are flattened, fetched together, then handed back to their own rail.
  const flat = home.rails.flatMap((r) => r.items);
  const withPhotos = await withGalleries(supabase, flat);
  const byId = new Map(withPhotos.map((i) => [i.id, i]));
  return {
    ...home,
    rails: home.rails.map((r) => ({ ...r, items: r.items.map((i) => byId.get(i.id) ?? i) })),
  };
}

export type BrowseFoodOptions = {
  q?: string | null;
  category?: string | null;
  meal?: string | null;
  dietary?: string[];
  maxPrice?: number | null;
  orderableOnly?: boolean;
  sort?: string;
  limit?: number;
  offset?: number;
};

/**
 * Search / filter the island-wide dish catalog.
 *
 * The customer's raw text goes through parseFoodQuery() first, which pulls the
 * INTENTS out of it — "cheap dinner" is a price ceiling and a meal time, not
 * two words to match against dish names — and expands the rest through the
 * local/visitor synonym table. Filters passed explicitly by the UI (a tapped
 * category chip) always win over ones the text merely implied.
 */
export async function browseFood(
  supabase: SupabaseClient,
  opts: BrowseFoodOptions = {},
): Promise<FoodBrowseResult> {
  const parsed = parseFoodQuery(opts.q);
  const sort: FoodSort = (FOOD_SORTS as readonly string[]).includes(opts.sort ?? "")
    ? (opts.sort as FoodSort)
    : "recommended";

  // An explicit tap beats an inferred word: if the customer has selected the
  // "Breakfast" chip AND typed "dinner", the chip is the deliberate act.
  const dietary = [...new Set([...(opts.dietary ?? []), ...parsed.dietary])];

  const { data, error } = await supabase.rpc("browse_food", {
    p_q: parsed.q,
    p_category: opts.category || null,
    p_meal: opts.meal || parsed.meal || null,
    p_dietary: dietary.length ? dietary : null,
    p_max_price: opts.maxPrice ?? parsed.maxPrice ?? null,
    p_orderable_only: opts.orderableOnly ?? false,
    p_sort: sort,
    p_limit: opts.limit ?? 24,
    p_offset: opts.offset ?? 0,
  });

  if (error) {
    console.error("browse_food failed", error);
    return { total: 0, limit: opts.limit ?? 24, offset: opts.offset ?? 0, items: [] };
  }
  const result = data as FoodBrowseResult;
  return { ...result, items: await withGalleries(supabase, result.items) };
}


/** One dish, with its variants, images, kitchen and related strip. */
export async function getFoodItem(
  supabase: SupabaseClient,
  slug: string,
): Promise<FoodDetail | null> {
  const { data, error } = await supabase.rpc("food_item_detail", { p_slug: slug });
  if (error) {
    console.error("food_item_detail failed", error);
    return null;
  }
  return (data as FoodDetail) ?? null;
}

/**
 * Every dish slug, for the sitemap and for generateStaticParams.
 *
 * Reads the view through the RPC rather than the table so it can never list a
 * dish the catalog would refuse to show — a sitemap entry that 404s is worse
 * than a missing one.
 */
export async function listFoodSlugs(supabase: SupabaseClient): Promise<string[]> {
  const result = await browseFood(supabase, { limit: 60, sort: "newest" });
  return result.items.map((i) => i.slug);
}

/**
 * Dish photos for the homepage Restaurant card, newest first.
 *
 * Goes through browseFood() rather than reading product_media directly, so it
 * can only ever surface a photo belonging to a dish a customer could actually
 * open — a hero image for an unpublished dish would be an advert for a 404.
 * Returns an empty list on failure: the card falls back to its gradient, and
 * the homepage must never fail because a photo did not load.
 */
export async function foodCardImages(supabase: SupabaseClient, limit = 6): Promise<string[]> {
  const result = await browseFood(supabase, { limit: 24, sort: "recommended" });
  return result.items
    .map((i) => i.imageUrl)
    .filter((u): u is string => !!u)
    .slice(0, limit);
}

/**
 * One kitchen and its whole menu, for /food/k/[slug].
 *
 * Returns null for an unknown slug so the page can call notFound() rather than
 * render an empty restaurant, which reads as "this place has closed down"
 * instead of "this address is wrong".
 *
 * Galleries are attached here for the same reason getFoodHome does it: the
 * cards come out of food_catalog with a single image, and a kitchen page
 * showing one photo per dish while /food shows several is the kind of
 * inconsistency nobody reports and everybody notices.
 */
export async function getFoodKitchen(
  supabase: SupabaseClient,
  slug: string,
): Promise<FoodKitchenDetail | null> {
  const { data, error } = await supabase.rpc("food_kitchen", { p_slug: slug });
  if (error) {
    console.error("food_kitchen failed", error);
    return null;
  }
  const kitchen = (data as FoodKitchenDetail) ?? null;
  if (!kitchen) return null;
  return { ...kitchen, items: await withGalleries(supabase, kitchen.items ?? []) };
}
