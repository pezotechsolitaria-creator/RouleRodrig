import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { guard } from "@/lib/rate-limit";

const PAGE_SIZE = 20;
const VALID_STATUSES = new Set([
  "pending_payment", "paid", "preparing", "ready_for_pickup", "collected", "cancelled", "refunded",
]);

// A customer's own orders — customer_id is resolved from the session, never
// accepted as input, same ownership-by-construction pattern used everywhere
// else in this app. Deliberately does NOT select internal_notes (that's the
// merchant-only column; see app/api/merchant/orders/[id]/route.ts) — this
// handler and that one are kept as separate code paths specifically so
// there's no shared serializer someone could accidentally widen later.
export async function GET(req: NextRequest) {
  const limited = guard(req, "customer-orders-list", 60, 60_000);
  if (limited) return limited;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const status = searchParams.get("status");
  const q = (searchParams.get("q") ?? "").trim();

  let query = supabase
    .from("orders")
    .select(
      "id, order_number, status, total, currency, created_at, placed_at, stores(name), order_items(count)",
      { count: "exact" },
    )
    .eq("customer_id", user.id)
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (status && VALID_STATUSES.has(status)) query = query.eq("status", status);
  if (q) {
    // Same defense-in-depth stripping as the merchant list route — the
    // customer_id .eq() above (plus RLS) is what actually prevents
    // cross-account leakage, this just avoids a malformed-filter 500.
    const safe = q.replace(/[,()]/g, " ").trim();
    if (safe) query = query.ilike("order_number", `%${safe}%`);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error("list customer orders failed", error);
    return NextResponse.json({ error: "Failed to load orders." }, { status: 500 });
  }

  return NextResponse.json({ orders: data ?? [], total: count ?? 0, page, pageSize: PAGE_SIZE });
}
