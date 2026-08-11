import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardFoodAdmin, readJson, failed } from "@/lib/food/guard";
import { foodItemSchema, foodItemPatchSchema } from "@/lib/schemas/food";
import { createDish, uniqueSlug, writeVariants, writeCategories, writeImages } from "@/lib/food/admin";

// The dish catalog.
//
// The admin reads the RAW tables rather than the food_catalog view, and that is
// deliberate: the view only shows what a CUSTOMER may see (active products of
// visible kitchens), which is precisely the wrong set for the screen whose job
// is to find the draft dish you forgot to publish.

export async function GET(req: NextRequest) {
  const gate = await guardFoodAdmin(req);
  if (gate instanceof NextResponse) return gate;
  const { admin } = gate;

  const url = new URL(req.url);
  const kitchenId = url.searchParams.get("kitchenId");
  const q = (url.searchParams.get("q") ?? "").trim();

  // Filtering happens in JS below rather than in the query: the kitchen and the
  // dish name live two embeds apart, and PostgREST cannot filter on an embedded
  // relation without turning the join into an inner one — which would silently
  // drop any dish whose kitchen row is missing, i.e. exactly the broken record
  // this screen exists to find. The menu is dozens of rows, not thousands.
  const query = admin
    .from("food_items")
    .select(
      "product_id, slug, descriptor, spice_level, dietary, meal_times, allergens, serves, " +
        "prep_minutes_min, prep_minutes_max, is_signature, position, available_days, " +
        "available_from, available_until, daily_capacity, sold_out_until, sold_out_reason, " +
        "products(id, name, description, status, store_id, min_price, currency, " +
        "stores(id, name, status), " +
        "product_variants(id, name, price, stock_quantity, is_active, position), " +
        "product_media(url, position))",
    )
    .order("position");

  const { data, error } = await query;
  if (error) return failed(error, "Failed to load the menu.");

  type Row = Record<string, unknown> & { products: Record<string, unknown> | Record<string, unknown>[] | null };
  const one = (v: unknown) => (Array.isArray(v) ? (v[0] ?? null) : v);
  const list = (v: unknown) => (Array.isArray(v) ? v : v ? [v] : []);

  const { data: categoryLinks } = await admin
    .from("food_item_categories")
    .select("product_id, food_categories(slug)");
  const catsByProduct = new Map<string, string[]>();
  for (const link of (categoryLinks ?? []) as { product_id: string; food_categories: unknown }[]) {
    const cat = one(link.food_categories) as { slug?: string } | null;
    if (!cat?.slug) continue;
    catsByProduct.set(link.product_id, [...(catsByProduct.get(link.product_id) ?? []), cat.slug]);
  }

  const items = ((data ?? []) as unknown as Row[])
    .map((r) => {
      const p = one(r.products) as Record<string, unknown> | null;
      const store = one(p?.stores) as Record<string, unknown> | null;
      const variants = (list(p?.product_variants) as Record<string, unknown>[])
        .slice()
        .sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0));
      const images = (list(p?.product_media) as Record<string, unknown>[])
        .slice()
        .sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0))
        .map((m) => String(m.url));

      return {
        productId: r.product_id as string,
        slug: r.slug as string,
        name: (p?.name as string) ?? "Dish",
        description: (p?.description as string | null) ?? null,
        status: (p?.status as string) ?? "draft",
        price: (p?.min_price as number) ?? 0,
        currency: (p?.currency as string) ?? "MUR",
        kitchenId: (p?.store_id as string) ?? "",
        kitchenName: (store?.name as string) ?? "",
        kitchenStatus: (store?.status as string) ?? "draft",
        descriptor: r.descriptor as string | null,
        spiceLevel: r.spice_level as number,
        dietary: (r.dietary as string[]) ?? [],
        mealTimes: (r.meal_times as string[]) ?? [],
        allergens: r.allergens as string | null,
        serves: r.serves as number | null,
        prepMinutesMin: r.prep_minutes_min as number | null,
        prepMinutesMax: r.prep_minutes_max as number | null,
        isSignature: r.is_signature as boolean,
        position: r.position as number,
        availableDays: r.available_days as number[] | null,
        availableFrom: r.available_from as string | null,
        availableUntil: r.available_until as string | null,
        dailyCapacity: r.daily_capacity as number | null,
        soldOutUntil: r.sold_out_until as string | null,
        soldOutReason: r.sold_out_reason as string | null,
        categories: catsByProduct.get(r.product_id as string) ?? [],
        // Total portions left across every active size — the number the
        // operator glances at during service.
        stock: variants
          .filter((v) => v.is_active)
          .reduce((n, v) => n + Number(v.stock_quantity ?? 0), 0),
        variants: variants.map((v) => ({
          id: v.id as string,
          name: (v.name as string | null) ?? null,
          price: Number(v.price ?? 0),
          stock: Number(v.stock_quantity ?? 0),
          isActive: Boolean(v.is_active),
          position: Number(v.position ?? 0),
        })),
        images,
      };
    })
    .filter((i) => (kitchenId ? i.kitchenId === kitchenId : true))
    .filter((i) =>
      q
        ? `${i.name} ${i.descriptor ?? ""} ${i.kitchenName}`.toLowerCase().includes(q.toLowerCase())
        : true,
    );

  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const gate = await guardFoodAdmin(req);
  if (gate instanceof NextResponse) return gate;
  const { admin } = gate;

  const body = await readJson(req);
  if (body instanceof NextResponse) return body;
  const parsed = foodItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  // The dish must belong to a real kitchen. Without this the endpoint could
  // attach a dish to any merchant's shop in the marketplace — it would then be
  // invisible in /food (no food_kitchens row for the join) and VISIBLE in that
  // shop's storefront, which is the worst possible outcome of a typo'd id.
  const { data: isKitchen } = await admin
    .from("food_kitchens")
    .select("store_id")
    .eq("store_id", parsed.data.kitchenId)
    .maybeSingle();
  if (!isKitchen) return NextResponse.json({ error: "That kitchen does not exist." }, { status: 400 });

  try {
    const productId = await createDish(admin, {
      ...parsed.data,
      descriptor: parsed.data.descriptor || undefined,
      descriptorFr: parsed.data.descriptorFr || undefined,
      descriptorCr: parsed.data.descriptorCr || undefined,
      description: parsed.data.description || undefined,
      allergens: parsed.data.allergens || undefined,
      variants: parsed.data.variants.map((v) => ({ ...v, name: v.name || undefined })),
    });
    return NextResponse.json({ productId });
  } catch (err) {
    return failed(err, "Could not create that dish.");
  }
}

export async function PATCH(req: NextRequest) {
  const gate = await guardFoodAdmin(req);
  if (gate instanceof NextResponse) return gate;
  const { admin } = gate;

  const body = await readJson(req);
  if (body instanceof NextResponse) return body;
  const parsed = foodItemPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }
  const v = parsed.data;

  const { data: existing } = await admin
    .from("food_items")
    .select("product_id, slug")
    .eq("product_id", v.productId)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: "That dish does not exist." }, { status: 404 });

  try {
    const productPatch: Record<string, unknown> = {};
    if (v.name !== undefined) productPatch.name = v.name;
    if (v.description !== undefined) productPatch.description = v.description?.trim() || null;
    if (v.status !== undefined) productPatch.status = v.status;
    if (v.kitchenId !== undefined) productPatch.store_id = v.kitchenId;

    const foodPatch: Record<string, unknown> = {};
    if (v.slug !== undefined) {
      const slug = await uniqueSlug(admin, "food_items", v.slug, v.productId);
      foodPatch.slug = slug;
      productPatch.slug = slug;
    }
    if (v.descriptor !== undefined) foodPatch.descriptor = v.descriptor?.trim() || null;
    if (v.descriptorFr !== undefined) foodPatch.descriptor_fr = v.descriptorFr?.trim() || null;
    if (v.descriptorCr !== undefined) foodPatch.descriptor_cr = v.descriptorCr?.trim() || null;
    if (v.allergens !== undefined) foodPatch.allergens = v.allergens?.trim() || null;
    if (v.spiceLevel !== undefined) foodPatch.spice_level = v.spiceLevel;
    if (v.dietary !== undefined) foodPatch.dietary = v.dietary;
    if (v.mealTimes !== undefined) foodPatch.meal_times = v.mealTimes;
    if (v.serves !== undefined) foodPatch.serves = v.serves;
    if (v.prepMinutesMin !== undefined) foodPatch.prep_minutes_min = v.prepMinutesMin;
    if (v.prepMinutesMax !== undefined) foodPatch.prep_minutes_max = v.prepMinutesMax;
    if (v.isSignature !== undefined) foodPatch.is_signature = v.isSignature;
    if (v.position !== undefined) foodPatch.position = v.position;
    if (v.availableDays !== undefined) {
      foodPatch.available_days = v.availableDays?.length ? v.availableDays : null;
    }
    if (v.availableFrom !== undefined) foodPatch.available_from = v.availableFrom || null;
    if (v.availableUntil !== undefined) foodPatch.available_until = v.availableUntil || null;
    if (v.dailyCapacity !== undefined) foodPatch.daily_capacity = v.dailyCapacity;

    if (Object.keys(productPatch).length) {
      const { error } = await admin.from("products").update(productPatch).eq("id", v.productId);
      if (error) throw new Error(error.message);
    }
    if (Object.keys(foodPatch).length) {
      const { error } = await admin.from("food_items").update(foodPatch).eq("product_id", v.productId);
      if (error) throw new Error(error.message);
    }
    if (v.variants !== undefined) {
      await writeVariants(
        admin,
        v.productId,
        v.variants.map((x) => ({ ...x, name: x.name || undefined })),
      );
    }
    if (v.categories !== undefined) await writeCategories(admin, v.productId, v.categories);
    if (v.images !== undefined) await writeImages(admin, v.productId, v.images);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return failed(err, "Could not save that dish.");
  }
}

// ARCHIVE, never DELETE. order_items references the variant and holds the
// record of what a customer actually bought — a hard delete would either fail
// on the foreign key or erase somebody's receipt. Archiving removes the dish
// from every customer surface immediately, which is what "delete" means to the
// person pressing the button.
export async function DELETE(req: NextRequest) {
  const gate = await guardFoodAdmin(req);
  if (gate instanceof NextResponse) return gate;
  const { admin } = gate;

  const id = new URL(req.url).searchParams.get("productId");
  if (!id || !z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Missing or invalid dish." }, { status: 400 });
  }

  const { error } = await admin.from("products").update({ status: "archived" }).eq("id", id);
  if (error) return failed(error, "Could not remove that dish.");
  return NextResponse.json({ ok: true });
}
