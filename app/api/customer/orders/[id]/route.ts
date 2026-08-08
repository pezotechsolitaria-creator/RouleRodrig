import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/file-signature";
import { guard } from "@/lib/rate-limit";

// Customer order detail — scoped to customer_id = auth.uid() both here (an
// explicit .eq()) and by RLS (orders_read). Never selects internal_notes.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = guard(req, "customer-orders-detail", 60, 60_000);
  if (limited) return limited;

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { data: order, error } = await supabase
    .from("orders")
    .select(
      "id, order_number, status, notes, subtotal, discount, tax, total, currency, placed_at, created_at, " +
        "stores(name, phone, whatsapp), " +
        "order_items(id, product_name, variant_name, sku, unit_price, quantity, line_total), " +
        "payments(id, provider, amount, currency, status, created_at)",
    )
    .eq("id", id)
    .eq("customer_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("get customer order failed", error);
    return NextResponse.json({ error: "Failed to load order." }, { status: 500 });
  }
  if (!order) return NextResponse.json({ error: "Not found." }, { status: 404 });

  // The pickup code is NOT an embed on qr_pickup_tokens: M28 revoked the table
  // grant so the raw code cannot be reached through PostgREST by any client
  // role. The accessor releases it on one test — this is your order — and the
  // old embed returned an empty array here anyway, because the table's RLS
  // policy only ever admitted store staff.
  const { data: pickup, error: pickupError } = await supabase.rpc("customer_pickup_code", {
    p_order_id: id,
  });
  if (pickupError) console.error("customer_pickup_code failed", pickupError);

  return NextResponse.json({ order: Object.assign({}, order, { pickup: pickup ?? null }) });
}
