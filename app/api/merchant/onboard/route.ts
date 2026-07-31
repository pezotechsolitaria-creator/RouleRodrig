import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { guard } from "@/lib/rate-limit";

// Creates a merchant + its first store + first product + variant + opening
// stock in one atomic DB transaction (see onboard_merchant() in
// supabase/migrations/20260731144631_onboard_merchant_rpc.sql). Runs as the
// signed-in user (not service role) so RLS still applies — the RPC itself
// re-checks auth.uid() before writing anything.
export async function POST(req: NextRequest) {
  const limited = guard(req, "merchant-onboard", 10, 60_000);
  if (limited) return limited;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const shopName = String(body.shopName ?? "").trim();
  const productName = String(body.productName ?? "").trim();
  const priceRs = Number(body.price);
  const quantity = Number(body.quantity);

  if (!shopName) return NextResponse.json({ error: "Shop name is required." }, { status: 400 });
  if (!productName) return NextResponse.json({ error: "Product name is required." }, { status: 400 });
  if (!Number.isFinite(priceRs) || priceRs < 0) {
    return NextResponse.json({ error: "Enter a valid price." }, { status: 400 });
  }
  if (!Number.isInteger(quantity) || quantity < 0) {
    return NextResponse.json({ error: "Enter a valid quantity." }, { status: 400 });
  }

  const { data, error } = await supabase
    .rpc("onboard_merchant", {
      p_shop_name: shopName,
      p_shop_description: body.shopDescription ? String(body.shopDescription).trim() : null,
      p_business_category: body.businessCategory ? String(body.businessCategory).trim() : null,
      p_contact_phone: body.contactPhone ? String(body.contactPhone).trim() : null,
      p_address: body.address ? String(body.address).trim() : null,
      p_product_name: productName,
      p_product_description: body.productDescription ? String(body.productDescription).trim() : null,
      p_price: Math.round(priceRs * 100),
      p_quantity: quantity,
      p_sku: body.sku ? String(body.sku).trim() : null,
      p_category_id: body.categoryId ? String(body.categoryId) : null,
    })
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json(data);
}
