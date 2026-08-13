import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { guard } from "@/lib/rate-limit";
import type { MarketProduct } from "@/lib/marketplace/types";

// Resolve a list of product ids into live cards.
//
// The saved list and the buy-again list both live in the browser as bare ids,
// which is deliberate (lib/marketplace/saved.ts explains why). They are worth
// nothing without a way to turn them back into a price and a stock figure that
// are true RIGHT NOW — a saved item showing last week's price is worse than no
// saved list at all.
//
// Read-only and public by design: these ids identify products anyone can
// already see. The RPC is what enforces visibility, and it is the SAME view the
// listing pages read, so an archived product, a paused shop or a lapsed
// subscription simply does not come back.
export const dynamic = "force-dynamic";

const schema = z.object({
  ids: z.array(z.uuid()).min(1).max(100),
});

export async function POST(req: NextRequest) {
  // Generous, because a shopper with a long saved list refreshes it on every
  // visit — but bounded, because this is an unauthenticated read.
  const limited = guard(req, "marketplace-products", 60, 60_000);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    // An id list that is not a list of ids is a client bug, not a shopper
    // action — say so plainly rather than returning an empty catalogue, which
    // would render as "everything you saved is gone".
    return NextResponse.json({ error: "Invalid product list." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("marketplace_products_by_ids", {
    p_ids: parsed.data.ids,
  });

  if (error) {
    console.error("marketplace_products_by_ids failed", error);
    return NextResponse.json({ error: "Failed to load products." }, { status: 500 });
  }

  // Ids that no longer resolve are reported, not silently dropped: the saved
  // page can then say "2 of these are no longer available" instead of quietly
  // showing a shorter list than the shopper remembers saving.
  const products = (data as MarketProduct[] | null) ?? [];
  const found = new Set(products.map((p) => p.id));
  const missing = parsed.data.ids.filter((id) => !found.has(id));

  return NextResponse.json({ products, missing });
}
