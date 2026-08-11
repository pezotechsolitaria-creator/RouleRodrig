import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ensurePlatformFoodMerchant } from "./platform-merchant";

// The write side of Food Operations.
//
// Every function here expects a SERVICE-ROLE client. That is not laziness about
// RLS — it is the same two-admin-identities situation documented on
// /api/admin/delivery-zones: /admin authenticates with a signed password
// cookie and has no Supabase user, so is_platform_admin() can never be true for
// it and the `..._admin_write` policies are unreachable from this surface. The
// cookie check in the route IS the security boundary; the service role is how
// the write lands.
//
// A useful side effect: enforce_active_subscription() bypasses when auth.uid()
// is null, so the platform Food merchant never needs a subscription row to
// publish a dish. Verified against the trigger body, not assumed.

/** URL-safe, accent-stripped, collapsed. The basis for every generated slug. */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70) || "dish";
}

/**
 * A slug nothing else is using.
 *
 * Dish slugs are island-unique (food_items.slug is UNIQUE) precisely so the URL
 * can be /food/octopus-curry with no kitchen in it — but two kitchens both
 * cooking ourite is completely normal, so collisions are the expected case, not
 * an error to surface. The suffix is appended until the database agrees.
 */
export async function uniqueSlug(
  admin: SupabaseClient,
  table: "food_items" | "food_categories",
  desired: string,
  ignoreId?: string,
): Promise<string> {
  const base = slugify(desired);
  const idColumn = table === "food_items" ? "product_id" : "id";

  for (let n = 0; n < 40; n++) {
    const candidate = n === 0 ? base : `${base}-${n + 1}`;
    let query = admin.from(table).select(idColumn).eq("slug", candidate).limit(1);
    if (ignoreId) query = query.neq(idColumn, ignoreId);
    const { data, error } = await query;
    if (error) throw new Error(`Could not check that web address: ${error.message}`);
    if (!data || data.length === 0) return candidate;
  }
  // Forty collisions on one name means something is wrong with the input, not
  // with the menu. A random tail is still a working URL.
  return `${base}-${crypto.randomUUID().slice(0, 6)}`;
}

/** Store slugs live in the marketplace's own namespace and are checked there. */
export async function uniqueStoreSlug(
  admin: SupabaseClient,
  desired: string,
  ignoreId?: string,
): Promise<string> {
  const base = slugify(desired);
  for (let n = 0; n < 40; n++) {
    const candidate = n === 0 ? base : `${base}-${n + 1}`;
    let query = admin.from("stores").select("id").eq("slug", candidate).limit(1);
    if (ignoreId) query = query.neq("id", ignoreId);
    const { data, error } = await query;
    if (error) throw new Error(`Could not check that web address: ${error.message}`);
    if (!data || data.length === 0) return candidate;
  }
  return `${base}-${crypto.randomUUID().slice(0, 6)}`;
}

export type KitchenInput = {
  name: string;
  slug?: string;
  tagline?: string;
  address?: string;
  phone?: string;
  lat?: number | null;
  lng?: number | null;
  prepMinutesMin: number;
  prepMinutesMax: number;
  pickupHint?: string;
  position?: number;
  cookerName?: string;
  cookerPhone?: string;
  cookerNotes?: string;
  status?: "draft" | "active" | "paused";
  offersRrDelivery?: boolean;
};

/**
 * Create a kitchen: one store under the platform Food merchant, plus its food
 * extension and its private cooker record.
 *
 * Ordering matters and is not arbitrary. The store must exist before
 * food_kitchens can point at it, and food_kitchens must exist before the store
 * is made active — because the moment a store goes active it is publicly
 * visible, and a store that is active WITHOUT its food_kitchens row is a store
 * that browse_stores() will happily list in /shop. That window is the M42 leak,
 * and closing it is a matter of doing these two writes in this order.
 */
export async function createKitchen(admin: SupabaseClient, input: KitchenInput): Promise<string> {
  const { merchantId } = await ensurePlatformFoodMerchant(admin);
  const slug = await uniqueStoreSlug(admin, input.slug || input.name);

  const { data: store, error: storeError } = await admin
    .from("stores")
    .insert({
      merchant_id: merchantId,
      name: input.name,
      slug,
      tagline: input.tagline?.trim() || null,
      address: input.address?.trim() || null,
      phone: input.phone?.trim() || null,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      // Always born as a draft, whatever was asked for. It is switched on at
      // the end of this function, after the kitchen row exists.
      status: "draft",
      category_hint: "food",
    })
    .select("id")
    .single();

  if (storeError || !store) {
    throw new Error(`Could not create that kitchen: ${storeError?.message ?? "unknown error"}`);
  }
  const storeId = store.id as string;

  const { error: kitchenError } = await admin.from("food_kitchens").insert({
    store_id: storeId,
    prep_minutes_min: input.prepMinutesMin,
    prep_minutes_max: input.prepMinutesMax,
    pickup_hint: input.pickupHint?.trim() || null,
    position: input.position ?? 0,
  });
  if (kitchenError) {
    // Roll the store back rather than leaving an orphan that /shop would list.
    await admin.from("stores").delete().eq("id", storeId);
    throw new Error(`Could not create that kitchen: ${kitchenError.message}`);
  }

  await admin.from("food_kitchen_ops").insert({
    store_id: storeId,
    cooker_name: input.cookerName?.trim() || null,
    cooker_phone: input.cookerPhone?.trim() || null,
    cooker_notes: input.cookerNotes?.trim() || null,
  });

  // Cash by default and bank transfer off: exactly the marketplace's rule, and
  // the honest one for food on this island. Cards remain rentals-only.
  await admin.from("store_payment_settings").upsert({
    store_id: storeId,
    accepts_cash: true,
    accepts_bank_transfer: false,
    offers_pickup: true,
    offers_rr_delivery: input.offersRrDelivery ?? true,
  });

  if ((input.status ?? "active") !== "draft") {
    await admin.from("stores").update({ status: input.status ?? "active" }).eq("id", storeId);
  }

  return storeId;
}

export type DishVariantInput = {
  id?: string;
  name?: string;
  price: number;
  stock: number;
  position?: number;
  isActive?: boolean;
};

export type DishInput = {
  kitchenId: string;
  name: string;
  slug?: string;
  descriptor?: string;
  descriptorFr?: string;
  descriptorCr?: string;
  description?: string;
  allergens?: string;
  categories?: string[];
  dietary?: string[];
  mealTimes?: string[];
  spiceLevel?: number;
  serves?: number | null;
  prepMinutesMin?: number | null;
  prepMinutesMax?: number | null;
  isSignature?: boolean;
  position?: number;
  availableDays?: number[] | null;
  availableFrom?: string | null;
  availableUntil?: string | null;
  dailyCapacity?: number | null;
  status?: "draft" | "active" | "archived";
  variants: DishVariantInput[];
  images?: string[];
};

/** Create a dish: a product, its variants, its food extension and its media. */
export async function createDish(admin: SupabaseClient, input: DishInput): Promise<string> {
  const foodSlug = await uniqueSlug(admin, "food_items", input.slug || input.name);
  // products.slug is only unique PER STORE, so reusing the island-unique dish
  // slug here is always safe and keeps the two readable side by side.
  const { data: product, error: productError } = await admin
    .from("products")
    .insert({
      store_id: input.kitchenId,
      name: input.name,
      slug: foodSlug,
      description: input.description?.trim() || null,
      status: input.status ?? "active",
      has_variants: input.variants.length > 1,
    })
    .select("id")
    .single();

  if (productError || !product) {
    throw new Error(`Could not create that dish: ${productError?.message ?? "unknown error"}`);
  }
  const productId = product.id as string;

  try {
    await writeVariants(admin, productId, input.variants);

    const { error: foodError } = await admin.from("food_items").insert({
      product_id: productId,
      slug: foodSlug,
      descriptor: input.descriptor?.trim() || null,
      descriptor_fr: input.descriptorFr?.trim() || null,
      descriptor_cr: input.descriptorCr?.trim() || null,
      allergens: input.allergens?.trim() || null,
      spice_level: input.spiceLevel ?? 0,
      dietary: input.dietary ?? [],
      meal_times: input.mealTimes ?? [],
      serves: input.serves ?? null,
      prep_minutes_min: input.prepMinutesMin ?? null,
      prep_minutes_max: input.prepMinutesMax ?? null,
      is_signature: input.isSignature ?? false,
      position: input.position ?? 0,
      available_days: input.availableDays?.length ? input.availableDays : null,
      available_from: input.availableFrom ?? null,
      available_until: input.availableUntil ?? null,
      daily_capacity: input.dailyCapacity ?? null,
    });
    if (foodError) throw new Error(foodError.message);

    await writeCategories(admin, productId, input.categories ?? []);
    await writeImages(admin, productId, input.images ?? []);
  } catch (err) {
    // A product with no food_items row is invisible to /food AND visible to
    // /shop — the worst of both. Remove it rather than leave it half-made.
    await admin.from("products").delete().eq("id", productId);
    throw err instanceof Error ? err : new Error("Could not create that dish.");
  }

  return productId;
}

/**
 * Replace a dish's variants.
 *
 * Stock is moved through the inventory ledger, never written directly, so the
 * count stays auditable and the existing t_inventory_apply trigger remains the
 * only thing that touches product_variants.stock_quantity. A variant the
 * operator removed is DEACTIVATED rather than deleted — order_items references
 * it, and a hard delete would either fail on the foreign key or erase what a
 * customer actually bought.
 */
export async function writeVariants(
  admin: SupabaseClient,
  productId: string,
  variants: DishVariantInput[],
): Promise<void> {
  const { data: existing } = await admin
    .from("product_variants")
    .select("id, stock_quantity")
    .eq("product_id", productId);

  const keptIds = new Set<string>();

  for (const [index, v] of variants.entries()) {
    const payload = {
      product_id: productId,
      name: v.name?.trim() || null,
      price: v.price,
      position: v.position ?? index,
      is_active: v.isActive ?? true,
    };

    if (v.id) {
      keptIds.add(v.id);
      const { error } = await admin.from("product_variants").update(payload).eq("id", v.id);
      if (error) throw new Error(`Could not save a size: ${error.message}`);
      const current = existing?.find((e) => e.id === v.id)?.stock_quantity ?? 0;
      await adjustStock(admin, v.id, v.stock - current, "Menu edit");
    } else {
      // Created at zero, then moved to the requested count through the ledger,
      // so even the first portions of a brand-new dish have a movement row.
      const { data: created, error } = await admin
        .from("product_variants")
        .insert({ ...payload, stock_quantity: 0 })
        .select("id")
        .single();
      if (error || !created) throw new Error(`Could not save a size: ${error?.message ?? "unknown"}`);
      keptIds.add(created.id as string);
      await adjustStock(admin, created.id as string, v.stock, "New dish");
    }
  }

  for (const row of existing ?? []) {
    if (!keptIds.has(row.id as string)) {
      await admin.from("product_variants").update({ is_active: false }).eq("id", row.id);
    }
  }

  await admin
    .from("products")
    .update({ has_variants: variants.length > 1 })
    .eq("id", productId);
}

/** Move stock by a delta through the ledger. A zero delta writes nothing. */
export async function adjustStock(
  admin: SupabaseClient,
  variantId: string,
  delta: number,
  note: string,
): Promise<void> {
  if (!Number.isFinite(delta) || delta === 0) return;
  const { error } = await admin.from("inventory_movements").insert({
    variant_id: variantId,
    delta,
    // 'restock' when adding, 'adjustment' when removing: the ledger should read
    // like what happened in the kitchen, not like one generic verb.
    reason: delta > 0 ? "restock" : "adjustment",
    note,
  });
  if (error) throw new Error(`Could not update the portions left: ${error.message}`);
}

/** Replace a dish's categories. Unknown slugs are ignored, not invented. */
export async function writeCategories(
  admin: SupabaseClient,
  productId: string,
  slugs: string[],
): Promise<void> {
  await admin.from("food_item_categories").delete().eq("product_id", productId);
  if (slugs.length === 0) return;

  const { data: cats } = await admin.from("food_categories").select("id, slug").in("slug", slugs);
  const rows = (cats ?? []).map((c) => ({ product_id: productId, category_id: c.id as string }));
  if (rows.length) await admin.from("food_item_categories").insert(rows);
}

/**
 * Replace a dish's images, in the given order.
 *
 * Position is the array index, so reordering in the admin is a re-save rather
 * than a drag-and-drop protocol — and position 0 is what every card in the
 * catalog shows, which makes "which photo is the hero" an ordinary edit.
 */
export async function writeImages(
  admin: SupabaseClient,
  productId: string,
  urls: string[],
): Promise<void> {
  await admin.from("product_media").delete().eq("product_id", productId);
  const rows = urls
    .map((url) => url.trim())
    .filter(Boolean)
    .map((url, position) => ({ product_id: productId, kind: "image", url, position }));
  if (rows.length) await admin.from("product_media").insert(rows);
}
