import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { guard } from "@/lib/rate-limit";
import { cartItemSchema, FULFILLMENT_METHODS } from "@/lib/schemas/checkout";

const NOT_FOUND_CODE = "RR003";
const VALIDATION_CODE = "RR005";
const SUBSCRIPTION_CODE = "RR008";

const quoteSchema = z.object({
  storeId: z.string().uuid(),
  items: z.array(cartItemSchema).min(1).max(50),
  fulfillment: z.enum(FULFILLMENT_METHODS),
});

// The authoritative price the customer will be charged, computed by the same
// SQL policy (order_amounts) that create_order uses when it actually charges.
// The checkout UI displays THIS and nothing it computed itself — under bank
// transfer the figure on screen is the amount the customer wires, so a
// client-side estimate is not acceptable.
export async function POST(req: NextRequest) {
  const limited = guard(req, "checkout-quote", 60, 60_000);
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
  const parsed = quoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  const { data, error } = await supabase
    .rpc("quote_order", {
      p_store_id: parsed.data.storeId,
      p_items: parsed.data.items.map((i) => ({ variant_id: i.variantId, quantity: i.quantity })),
      p_fulfillment: parsed.data.fulfillment,
    })
    .single();

  if (error) {
    if (error.code === NOT_FOUND_CODE) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error.code === VALIDATION_CODE) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error.code === SUBSCRIPTION_CODE) return NextResponse.json({ error: error.message }, { status: 409 });
    console.error("quote_order failed", error);
    return NextResponse.json({ error: "Could not price your cart." }, { status: 500 });
  }

  return NextResponse.json(data);
}
