import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOwnStoreId } from "@/lib/merchant/context";
import { productSchema } from "@/lib/schemas/product";
import { toCents } from "@/lib/money";
import { isUuid } from "@/lib/file-signature";
import { guard } from "@/lib/rate-limit";

const partialProductSchema = productSchema.partial();

// Every handler here re-resolves store_id from the session (never from the
// URL or body) and filters by BOTH the product id AND that store_id. RLS
// (products_staff_write / variants_write) is the real backstop — a query
// scoped to someone else's product simply matches zero rows — but filtering
// explicitly at the query-builder level makes "this can only ever touch the
// caller's own store" true by construction, not just by policy.

async function resolveOwnedProduct(
  supabase: Awaited<ReturnType<typeof createClient>>,
  storeId: string,
  productId: string,
) {
  const { data: product } = await supabase
    .from("products")
    .select("id, store_id")
    .eq("id", productId)
    .eq("store_id", storeId)
    .maybeSingle();
  return product;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const storeId = await getOwnStoreId(supabase);
  if (!storeId) return NextResponse.json({ error: "No shop found for this account." }, { status: 404 });

  const { data, error } = await supabase
    .from("products")
    .select(
      "id, name, description, status, category_id, product_variants(id, sku, price, stock_quantity, is_active), product_media(id, url, position)",
    )
    .eq("id", id)
    .eq("store_id", storeId)
    .maybeSingle();

  if (error) {
    console.error("get product failed", error);
    return NextResponse.json({ error: "Failed to load product." }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Not found." }, { status: 404 });

  return NextResponse.json({ product: data });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = guard(req, "merchant-products-update", 30, 60_000);
  if (limited) return limited;

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const storeId = await getOwnStoreId(supabase);
  if (!storeId) return NextResponse.json({ error: "No shop found for this account." }, { status: 404 });

  const owned = await resolveOwnedProduct(supabase, storeId, id);
  if (!owned) return NextResponse.json({ error: "Not found." }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const parsed = partialProductSchema.safeParse(body);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return NextResponse.json({ error: firstIssue?.message ?? "Invalid input." }, { status: 400 });
  }
  const input = parsed.data;

  const productPatch: Record<string, unknown> = {};
  if (input.name !== undefined) productPatch.name = input.name;
  if (input.description !== undefined) productPatch.description = input.description || null;
  if (input.categoryId !== undefined) productPatch.category_id = input.categoryId || null;
  if (input.status !== undefined) productPatch.status = input.status;

  if (Object.keys(productPatch).length > 0) {
    const { error } = await supabase.from("products").update(productPatch).eq("id", id).eq("store_id", storeId);
    if (error) {
      console.error("update product failed", error);
      return NextResponse.json({ error: "Failed to update product." }, { status: 500 });
    }
  }

  // has_variants is always false for M3 products, so there's exactly one
  // variant — price/SKU update it directly; stock changes go through the
  // inventory ledger (never write stock_quantity directly) so the cache stays
  // trustworthy and the change is auditable, same as onboarding's opening
  // stock and M2's architecture note on inventory_movements.
  if (input.price !== undefined || input.sku !== undefined || input.stockQuantity !== undefined) {
    const { data: variant } = await supabase
      .from("product_variants")
      .select("id, stock_quantity")
      .eq("product_id", id)
      .limit(1)
      .maybeSingle();

    // ── A PRICE THAT DID NOT SAVE MUST NOT REPORT SUCCESS (M131) ──────────
    //
    // This was `if (variant) { ...write... }` with no else, and the handler
    // returned { ok: true } either way. A product with no variant row — a
    // half-finished creation, a deleted size — meant the merchant raised their
    // price, saw it confirmed, and went on selling at the old one.
    //
    // Nothing was corrupted, which is why it survived: it is a lie in the
    // interface rather than bad data. But a merchant undercharging every
    // customer because a form told them it saved is a money bug with extra
    // steps.
    if (!variant) {
      console.error("update product: no variant row for product", id);
      return NextResponse.json(
        { error: "This product has no size to price. Reload the page and try again." },
        { status: 409 },
      );
    }

    {
      const variantPatch: Record<string, unknown> = {};
      if (input.price !== undefined) {
        const cents = toCents(input.price);
        if (cents === null) return NextResponse.json({ error: "Enter a valid price." }, { status: 400 });
        variantPatch.price = cents;
      }
      if (input.sku !== undefined) variantPatch.sku = input.sku || null;

      if (Object.keys(variantPatch).length > 0) {
        const { error } = await supabase.from("product_variants").update(variantPatch).eq("id", variant.id);
        if (error) {
          console.error("update variant failed", error);
          return NextResponse.json({ error: "Failed to update product." }, { status: 500 });
        }
      }

      if (input.stockQuantity !== undefined) {
        const delta = input.stockQuantity - variant.stock_quantity;
        if (delta !== 0) {
          const { error } = await supabase.from("inventory_movements").insert({
            variant_id: variant.id,
            delta,
            reason: "adjustment",
            note: "Manual stock adjustment from product edit",
          });
          if (error) {
            console.error("stock adjustment failed", error);
            return NextResponse.json({ error: "Failed to update stock." }, { status: 500 });
          }
        }
      }
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = guard(req, "merchant-products-delete", 20, 60_000);
  if (limited) return limited;

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const storeId = await getOwnStoreId(supabase);
  if (!storeId) return NextResponse.json({ error: "No shop found for this account." }, { status: 404 });

  const owned = await resolveOwnedProduct(supabase, storeId, id);
  if (!owned) return NextResponse.json({ error: "Not found." }, { status: 404 });

  // Soft delete (archive), not a hard DELETE: once a product has any order
  // history, order_items keeps its own snapshot fields but its variant_id FK
  // would otherwise dangle (ON DELETE SET NULL) — archiving preserves
  // referential integrity for reporting forever, at the cost of the row
  // never actually going away. Matches standard e-commerce practice
  // (Shopify et al. archive rather than hard-delete once a product could
  // have history) rather than a M3-specific shortcut.
  const { error } = await supabase.from("products").update({ status: "archived" }).eq("id", id).eq("store_id", storeId);
  if (error) {
    console.error("archive product failed", error);
    return NextResponse.json({ error: "Failed to delete product." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
