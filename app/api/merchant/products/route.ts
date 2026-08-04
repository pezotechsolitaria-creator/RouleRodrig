import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOwnStoreId } from "@/lib/merchant/context";
import { productSchema } from "@/lib/schemas/product";
import { toCents } from "@/lib/money";
import { guard } from "@/lib/rate-limit";

const DUPLICATE_SLUG_CODE = "P0001";
const NOT_STORE_STAFF_CODE = "RR002";

// GET  → list the signed-in merchant's own products (store_id is resolved
//        server-side from the session — a client can't ask to list anyone
//        else's catalog by passing a different store_id, because none is
//        ever accepted as input here).
// POST → create a product + its default variant + opening stock atomically
//        via create_product() (see 20260731170000_create_product_rpc.sql).
export async function GET(req: NextRequest) {
  const limited = guard(req, "merchant-products-list", 60, 60_000);
  if (limited) return limited;

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
      "id, name, status, category_id, created_at, product_variants(id, price, stock_quantity, is_active), product_media(url, position)",
    )
    .eq("store_id", storeId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("list products failed", error);
    return NextResponse.json({ error: "Failed to load products." }, { status: 500 });
  }

  return NextResponse.json({ products: data ?? [] });
}

export async function POST(req: NextRequest) {
  const limited = guard(req, "merchant-products-create", 20, 60_000);
  if (limited) return limited;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const storeId = await getOwnStoreId(supabase);
  if (!storeId) return NextResponse.json({ error: "No shop found for this account." }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const parsed = productSchema.safeParse(body);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return NextResponse.json({ error: firstIssue?.message ?? "Invalid input." }, { status: 400 });
  }
  const input = parsed.data;
  const priceCents = toCents(input.price);
  if (priceCents === null) return NextResponse.json({ error: "Enter a valid price." }, { status: 400 });

  const { data, error } = await supabase
    .rpc("create_product", {
      p_store_id: storeId,
      p_name: input.name,
      p_description: input.description || null,
      p_price: priceCents,
      p_quantity: input.stockQuantity,
      p_sku: input.sku || null,
      p_category_id: input.categoryId || null,
      p_status: input.status,
    })
    .single();

  if (error) {
    if (error.code === NOT_STORE_STAFF_CODE) {
      // Should be unreachable — storeId came from the caller's own session —
      // but if it ever fires, it means the RPC's independent ownership check
      // caught something the API layer didn't, which is exactly the point of
      // having it. Treat as a hard failure, not a validation message.
      console.error("create_product: RPC rejected caller's own store_id", error);
      return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 403 });
    }
    if (error.code === DUPLICATE_SLUG_CODE) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("create_product unexpected error", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }

  return NextResponse.json(data);
}
