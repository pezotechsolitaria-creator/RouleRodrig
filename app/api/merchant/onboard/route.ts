import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { guard } from "@/lib/rate-limit";
import { toCents } from "@/lib/money";

// Creates a merchant + its first store + first product + variant + opening
// stock in one atomic DB transaction (see onboard_merchant() in
// supabase/migrations/20260731160010_onboard_merchant_dedupe_and_slug_retry.sql).
// Runs as the signed-in user (not service role) so RLS still applies — the
// RPC itself re-checks auth.uid() before writing anything.
const DUPLICATE_MERCHANT_CODE = "RR001";
// Every plain RAISE EXCEPTION we wrote ourselves in the RPC (validation, the
// slug-retry exhaustion) gets plpgsql's default code, P0001, and is safe to
// relay verbatim to the client. Postgres's OWN internal errors (constraint
// violations we didn't anticipate, type-cast failures, etc.) get a different
// code and are NOT safe to relay — those get a generic message instead, and
// the raw error is logged server-side only. The duplicate-merchant case
// (RR001) is handled separately above since it needs its own 409 + code.
const SAFE_RPC_ERROR_CODE = "P0001";

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
  // Only accept the two shapes a well-formed client can actually send —
  // rejecting anything else up front avoids e.g. an array's Array#toString()
  // ("1,2" → strips to "12" by toCents' thousands-separator handling)
  // silently laundering into a plausible-looking price.
  const priceInput = body.price;
  const priceCents =
    typeof priceInput === "string" || typeof priceInput === "number" ? toCents(String(priceInput)) : null;
  const quantity = Number(body.quantity);

  if (!shopName) return NextResponse.json({ error: "Shop name is required." }, { status: 400 });
  if (!productName) return NextResponse.json({ error: "Product name is required." }, { status: 400 });
  if (priceCents === null) {
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
      p_price: priceCents,
      p_quantity: quantity,
      p_sku: body.sku ? String(body.sku).trim() : null,
      p_category_id: body.categoryId ? String(body.categoryId) : null,
    })
    .single();

  if (error) {
    if (error.code === DUPLICATE_MERCHANT_CODE) {
      return NextResponse.json({ error: error.message, code: DUPLICATE_MERCHANT_CODE }, { status: 409 });
    }
    if (error.code === SAFE_RPC_ERROR_CODE) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("onboard_merchant unexpected error", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }

  return NextResponse.json(data);
}
