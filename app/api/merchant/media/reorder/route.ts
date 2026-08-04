import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOwnStoreId } from "@/lib/merchant/context";
import { isUuid } from "@/lib/file-signature";
import { guard } from "@/lib/rate-limit";

// Re-orders an existing product's gallery. Takes the full ordered list of
// media ids and writes each one's position as its index — simpler and less
// error-prone than accepting a single move (from/to indices) and computing a
// shift server-side. Not wrapped in a transaction: a partial failure mid-loop
// leaves some rows with stale positions, which is a self-correcting cosmetic
// inconsistency (fixed by the next reorder), not data loss or a security
// concern — a materially different risk profile than product creation, which
// does need the atomic RPC.
export async function POST(req: NextRequest) {
  const limited = guard(req, "merchant-media-reorder", 30, 60_000);
  if (limited) return limited;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const storeId = await getOwnStoreId(supabase);
  if (!storeId) return NextResponse.json({ error: "No shop found for this account." }, { status: 404 });

  let body: { productId?: unknown; mediaIds?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const productId = String(body.productId ?? "");
  const mediaIds = Array.isArray(body.mediaIds) ? body.mediaIds.map(String) : null;
  if (!isUuid(productId) || !mediaIds || mediaIds.some((id) => !isUuid(id))) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { data: product } = await supabase
    .from("products")
    .select("id")
    .eq("id", productId)
    .eq("store_id", storeId)
    .maybeSingle();
  if (!product) return NextResponse.json({ error: "Not found." }, { status: 404 });

  // Verify every id actually belongs to this product before writing anything
  // — RLS would refuse a mismatched id anyway, but this rejects the whole
  // request cleanly up front instead of partially applying it.
  const { data: existing } = await supabase.from("product_media").select("id").eq("product_id", productId);
  const existingIds = new Set((existing ?? []).map((m) => m.id));
  if (mediaIds.length !== existingIds.size || mediaIds.some((id) => !existingIds.has(id))) {
    return NextResponse.json({ error: "Photo list doesn't match this product." }, { status: 400 });
  }

  const results = await Promise.all(
    mediaIds.map((id, position) => supabase.from("product_media").update({ position }).eq("id", id)),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) {
    console.error("media reorder failed", failed.error);
    return NextResponse.json({ error: "Failed to save the new order." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
