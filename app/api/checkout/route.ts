import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { guard } from "@/lib/rate-limit";
import { checkoutSchema } from "@/lib/schemas/checkout";

const NOT_FOUND_CODE = "RR003";
const VALIDATION_CODE = "RR005";
const UNAVAILABLE_CODE = "RR006";
const STOCK_CODE = "RR007";
const SAFE_RPC_ERROR_CODE = "P0001";

// The only thing trusted from the client here is "which variants, how many,
// and how the customer wants to pay/receive it." create_order() re-derives
// every price from the current DB row, re-validates stock under a row lock,
// and re-checks the store's fulfillment options itself — this route is a
// thin, Zod-validated pass-through, not a second source of truth.
export async function POST(req: NextRequest) {
  const limited = guard(req, "checkout", 10, 60_000);
  if (limited) return limited;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to check out." }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = checkoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }
  const { storeId, items, customerName, customerPhone, fulfillment, notes, provider } = parsed.data;

  const { data, error } = await supabase
    .rpc("create_order", {
      p_store_id: storeId,
      p_items: items.map((i) => ({ variant_id: i.variantId, quantity: i.quantity })),
      p_customer_name: customerName,
      p_customer_phone: customerPhone,
      p_fulfillment: fulfillment,
      p_notes: notes ?? null,
      p_provider: provider,
    })
    .single();

  if (error) {
    if (error.code === NOT_FOUND_CODE) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error.code === VALIDATION_CODE) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error.code === UNAVAILABLE_CODE || error.code === STOCK_CODE) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error.code === SAFE_RPC_ERROR_CODE) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("create_order unexpected error", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }

  return NextResponse.json(data);
}
