import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOwnStoreId } from "@/lib/merchant/context";
import { guard } from "@/lib/rate-limit";

const PAGE_SIZE = 20;
const VALID_STATUSES = new Set([
  "pending_payment", "paid", "preparing", "ready_for_pickup", "collected", "cancelled", "refunded",
]);

// Lists the caller's own store's orders in ONE query — order_items and
// payments are embedded (PostgREST joins), not fetched per-row in a loop,
// which is the N+1 shape this route deliberately avoids. store_id is
// resolved server-side from the session, never from a query param, same
// ownership-by-construction pattern as the product routes.
export async function GET(req: NextRequest) {
  const limited = guard(req, "merchant-orders-list", 60, 60_000);
  if (limited) return limited;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const storeId = await getOwnStoreId(supabase);
  if (!storeId) return NextResponse.json({ error: "No shop found for this account." }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  const status = searchParams.get("status");
  const page = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1);

  let query = supabase
    .from("orders")
    .select(
      "id, order_number, status, customer_name, customer_phone, total, currency, created_at, placed_at, order_items(count), payments(status, provider, created_at)",
      { count: "exact" },
    )
    .eq("store_id", storeId)
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (status && VALID_STATUSES.has(status)) query = query.eq("status", status);
  if (q) {
    // Building a raw PostgREST .or() filter string from user input — RLS and
    // the explicit store_id .eq() above both independently prevent this from
    // ever reaching another store's rows regardless of what's injected here,
    // but stripping PostgREST's own syntax characters (`,()`  separate
    // conditions / group them) avoids a malformed-filter 500 on an innocent
    // search term that happens to contain one.
    const safe = q.replace(/[,()]/g, " ").trim();
    if (safe) query = query.or(`order_number.ilike.%${safe}%,customer_name.ilike.%${safe}%`);
  }

  const { data, error, count } = await query;
  if (error) {
    console.error("list orders failed", error);
    return NextResponse.json({ error: "Failed to load orders." }, { status: 500 });
  }

  return NextResponse.json({ orders: data ?? [], total: count ?? 0, page, pageSize: PAGE_SIZE });
}
