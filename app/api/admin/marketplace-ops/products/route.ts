import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardAdminApi, readJson, failed } from "@/lib/admin/api-guard";
import { audit } from "@/lib/admin/audit";

// ── Stock and prices, editable by the owner on a seller's behalf ───────────
//
// The owner, about restaurants: "a dashboard will help them set up stocks by
// themselves, and if they are not computer literate, WE, the admin, can do it
// for them in our main dashboard." The same sentence is true of a marketplace
// seller — more so, because a shop has real stock counts that go wrong at
// exactly the moment nobody is at a laptop.
//
// Three fields, because three fields are what actually change during a trading
// day: price, how many are left, and whether it is for sale at all. Creating
// and deleting products stays in /merchant, where the seller owns their own
// catalogue — this desk is for keeping a live shop correct, not for running
// somebody's business for them permanently.
//
// SCOPED TO NON-KITCHEN STORES, the mirror of /admin/food. A kitchen dish is
// edited on the food desk; letting both screens write the same row is how two
// screens drift.

const patchSchema = z.object({
  variantId: z.string().uuid(),
  /** Minor units, as everywhere else. Zero is legal (a giveaway); negative is not. */
  price: z.number().int().min(0).max(100_000_000).optional(),
  stock: z.number().int().min(0).max(1_000_000).optional(),
  isActive: z.boolean().optional(),
});

async function nonKitchenStoreIds(admin: { from: (t: string) => { select: (c: string) => Promise<{ data: unknown[] | null }> } }) {
  const { data: kitchens } = await admin.from("food_kitchens").select("store_id");
  const kitchenIds = new Set(((kitchens ?? []) as { store_id: string }[]).map((k) => k.store_id));
  const { data: stores } = await admin.from("stores").select("id, name");
  const shops = ((stores ?? []) as { id: string; name: string }[]).filter((s) => !kitchenIds.has(s.id));
  return shops;
}

export async function GET(req: NextRequest) {
  const gate = await guardAdminApi(req, "The marketplace desk");
  if (gate instanceof NextResponse) return gate;
  const { admin } = gate;

  const storeId = new URL(req.url).searchParams.get("storeId");

  const shops = await nonKitchenStoreIds(admin as never);
  const shopName = new Map(shops.map((s) => [s.id, s.name]));
  const ids = shops.map((s) => s.id);
  if (ids.length === 0) return NextResponse.json({ shops: [], products: [] });

  let query = admin
    .from("products")
    .select(
      "id, store_id, name, status, has_variants, currency, " +
        "product_variants(id, name, sku, price, stock_quantity, low_stock_threshold, is_active, position)",
    )
    .in("store_id", ids)
    .order("name")
    .limit(500);
  if (storeId && ids.includes(storeId)) query = query.eq("store_id", storeId);

  const { data, error } = await query;
  if (error) return failed(error, "Failed to load products.");

  type Row = Record<string, unknown>;
  const list = (v: unknown) => (Array.isArray(v) ? v : v ? [v] : []);

  return NextResponse.json({
    shops,
    products: ((data ?? []) as unknown as Row[]).map((p) => ({
      id: p.id as string,
      storeId: p.store_id as string,
      storeName: shopName.get(p.store_id as string) ?? "Shop",
      name: p.name as string,
      status: p.status as string,
      currency: (p.currency as string) ?? "MUR",
      variants: (list(p.product_variants) as Record<string, unknown>[])
        .map((v) => ({
          id: v.id as string,
          name: (v.name as string | null) ?? null,
          sku: (v.sku as string | null) ?? null,
          price: Number(v.price ?? 0),
          stock: v.stock_quantity == null ? null : Number(v.stock_quantity),
          lowStockThreshold: v.low_stock_threshold == null ? null : Number(v.low_stock_threshold),
          isActive: Boolean(v.is_active),
        }))
        .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "")),
    })),
  });
}

export async function PATCH(req: NextRequest) {
  const gate = await guardAdminApi(req, "The marketplace desk");
  if (gate instanceof NextResponse) return gate;
  const { admin } = gate;

  const body = await readJson(req);
  if (body instanceof NextResponse) return body;
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }
  const { variantId, price, stock, isActive } = parsed.data;
  if (price === undefined && stock === undefined && isActive === undefined) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  // Which shop does this variant belong to? Read BEFORE writing, both to scope
  // the write and to record what the value was.
  const { data: variant } = await admin
    .from("product_variants")
    .select("id, price, stock_quantity, is_active, products(id, store_id, name)")
    .eq("id", variantId)
    .maybeSingle();
  if (!variant) return NextResponse.json({ error: "That item no longer exists." }, { status: 404 });

  const one = (v: unknown) => (Array.isArray(v) ? (v[0] ?? null) : v);
  const product = one((variant as Record<string, unknown>).products) as
    | { id: string; store_id: string; name: string }
    | null;
  if (!product) return NextResponse.json({ error: "That item no longer exists." }, { status: 404 });

  const { data: isKitchen } = await admin
    .from("food_kitchens")
    .select("store_id")
    .eq("store_id", product.store_id)
    .maybeSingle();
  // Indistinguishable from "no such item": this desk must not confirm the
  // existence of a kitchen's rows either.
  if (isKitchen) return NextResponse.json({ error: "That item no longer exists." }, { status: 404 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (price !== undefined) patch.price = price;
  if (stock !== undefined) patch.stock_quantity = stock;
  if (isActive !== undefined) patch.is_active = isActive;

  const { error } = await admin.from("product_variants").update(patch).eq("id", variantId);
  if (error) return failed(error, "Could not save that change.");

  // Editing somebody else's price is exactly the kind of act that must leave a
  // trail — including what it was before, so a dispute has an answer.
  const before = variant as Record<string, unknown>;
  await audit(admin, {
    action: "product.variant.updated",
    entityType: "product_variant",
    entityId: variantId,
    diff: {
      store: product.store_id,
      product: product.name,
      from: { price: before.price, stock: before.stock_quantity, isActive: before.is_active },
      to: { price, stock, isActive },
      desk: "marketplace",
    },
  });

  return NextResponse.json({ ok: true });
}
