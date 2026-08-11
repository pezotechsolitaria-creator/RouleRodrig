import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardFoodAdmin, readJson, failed } from "@/lib/food/guard";
import { soldOutSchema, restockSchema } from "@/lib/schemas/food";
import { adjustStock } from "@/lib/food/admin";

// The three things the operator does DURING service, standing up, on a phone.
//
// They are their own endpoint rather than a corner of the dish form because
// that is what they are: "we've run out", "we've made four more", "reset the
// day". A mid-service action that requires loading a form with twenty fields is
// an action that does not get taken, and the dish stays orderable while the pan
// is empty.

// Spread rather than `.and(...)`: a discriminated union needs each member to be
// a plain object so Zod can read the literal off the discriminator, and an
// intersection hides it. Same shapes, still the single source in
// lib/schemas/food.ts — just extended, not wrapped.
const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("sold_out"), ...soldOutSchema.shape }),
  z.object({ action: z.literal("restock_day"), ...restockSchema.shape }),
  z.object({
    action: z.literal("set_stock"),
    variantId: z.string().uuid(),
    stock: z.number().int().min(0).max(100_000),
  }),
]);

export async function POST(req: NextRequest) {
  const gate = await guardFoodAdmin(req);
  if (gate instanceof NextResponse) return gate;
  const { admin } = gate;

  const body = await readJson(req);
  if (body instanceof NextResponse) return body;
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }
  const v = parsed.data;

  try {
    if (v.action === "sold_out") {
      // A timestamp, not a boolean. Sold-out is a fact with an END, so it
      // clears itself and nobody has to remember to switch the dish back on
      // tomorrow morning — which, on the evidence of every restaurant menu
      // system ever built, nobody does.
      const { error } = await admin
        .from("food_items")
        .update({
          sold_out_until: v.until,
          sold_out_reason: v.until ? v.reason?.trim() || null : null,
        })
        .eq("product_id", v.productId);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (v.action === "set_stock") {
      const { data: variant, error } = await admin
        .from("product_variants")
        .select("id, stock_quantity, product_id, products(store_id)")
        .eq("id", v.variantId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!variant) return NextResponse.json({ error: "That size does not exist." }, { status: 404 });

      // Only a dish. Without this the endpoint would let the food admin move
      // stock on any product in the marketplace, including a real merchant's.
      const { data: isDish } = await admin
        .from("food_items")
        .select("product_id")
        .eq("product_id", variant.product_id as string)
        .maybeSingle();
      if (!isDish) return NextResponse.json({ error: "That is not a dish." }, { status: 400 });

      await adjustStock(
        admin,
        v.variantId,
        v.stock - Number(variant.stock_quantity ?? 0),
        "Counted during service",
      );
      return NextResponse.json({ ok: true, stock: v.stock });
    }

    // restock_day — the morning reset. Idempotent, so pressing it twice does
    // nothing the second time, and safe to run mid-day for one late kitchen.
    const { data, error } = await admin.rpc("food_restock_day", {
      p_store_id: v.storeId ?? null,
    });
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, restocked: data as number });
  } catch (err) {
    return failed(err, "Could not apply that change.");
  }
}
