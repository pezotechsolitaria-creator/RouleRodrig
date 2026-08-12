import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { guard } from "@/lib/rate-limit";

// The cook's entire API surface.
//
// Authorisation is the database's, not this file's: kitchen_dashboard() and
// kitchen_advance_order() both resolve the caller's kitchens from
// my_kitchen_ids() and refuse anything outside them. An order in another
// kitchen returns "Not found" rather than "forbidden", so a cook cannot probe
// for order ids belonging to someone else.
const NOT_ON_A_TEAM = "RR081";
const NOT_FOUND = "RR003";
const BAD_TRANSITION = "RR004";
const NOT_ALLOWED = "RR086";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  // Binds any invitation left for this email to the account that just signed
  // in. Cheap, idempotent, and it means a cook never has to be "activated".
  await supabase.rpc("claim_kitchen_invites");

  const url = new URL(req.url);
  // ?menu=1 asks for the dish list instead of the order queue. One route, two
  // views, so the cook's phone opens one connection.
  if (url.searchParams.get("menu") === "1") {
    const { data: menu, error: menuError } = await supabase.rpc("kitchen_menu");
    if (menuError) {
      if (menuError.code === NOT_ON_A_TEAM) return NextResponse.json({ onTeam: false }, { status: 200 });
      console.error("kitchen_menu failed", menuError);
      return NextResponse.json({ error: "Could not load the menu." }, { status: 500 });
    }
    return NextResponse.json({ onTeam: true, ...(menu as object) });
  }

  const { data, error } = await supabase.rpc("kitchen_dashboard");
  if (error) {
    // Not being on a team is a normal state, not a failure — the page uses it
    // to explain rather than to show an error.
    if (error.code === NOT_ON_A_TEAM) return NextResponse.json({ onTeam: false }, { status: 200 });
    console.error("kitchen_dashboard failed", error);
    return NextResponse.json({ error: "Could not load your orders." }, { status: 500 });
  }
  return NextResponse.json({ onTeam: true, ...(data as object) });
}

const actionSchema = z.union([
  z.object({
    orderId: z.string().uuid(),
    // Deliberately not the full status enum: a cook moves food forward and
    // nothing else. Cancelling and refunding are the owner's decisions.
    to: z.enum(["preparing", "ready_for_pickup", "collected"]),
  }),
  // Judging a proof of payment (M75). The restaurant decides, not the platform
  // owner — otherwise every single sale queues behind one person opening
  // /admin, which is exactly what the kitchen role was built to end.
  z.object({
    orderId: z.string().uuid(),
    payment: z.enum(["confirm", "reject"]),
    reason: z.string().trim().max(300).optional(),
    // M79 — how much actually arrived, in minor units. Omitted means the whole
    // total, which is every order that is not a split. A smaller number opens a
    // cash balance; the RPC refuses anything above the total.
    amountReceived: z.number().int().positive().optional(),
  }),
  // M79 — the rest of a split, physically handed over. Separate from
  // "collected": food can leave the counter before the note is in the till.
  z.object({
    orderId: z.string().uuid(),
    settleBalance: z.literal(true),
  }),
  // Cancelling (M76). A kitchen runs out of fish; it should not need the
  // platform owner to say so. REFUND is deliberately absent — that moves money
  // out and stays with whoever owns the till.
  z.object({
    orderId: z.string().uuid(),
    cancel: z.literal(true),
    reason: z.string().trim().max(300).optional(),
  }),
  // Menu du jour and stock (M77). Three verbs, all optional, so tapping
  // "sold out" cannot silently clear a count set an hour ago. Price is
  // deliberately absent — that is the owner's revenue, not the cook's.
  z.object({
    productId: z.string().uuid(),
    onMenu: z.boolean().optional(),
    capacity: z.number().int().min(0).max(999).optional(),
    clearCapacity: z.boolean().optional(),
    soldOut: z.boolean().optional(),
  }),
]);

export async function POST(req: NextRequest) {
  const limited = guard(req, "kitchen-action", 60, 60_000);
  if (limited) return limited;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid action." }, { status: 400 });

  const input = parsed.data;
  const { data, error } =
    "productId" in input
      ? await supabase.rpc("kitchen_update_dish", {
          p_product_id: input.productId,
          p_on_menu: input.onMenu ?? null,
          p_capacity: input.capacity ?? null,
          p_clear_capacity: input.clearCapacity ?? false,
          p_sold_out: input.soldOut ?? null,
        })
      : "settleBalance" in input
      ? await supabase.rpc("kitchen_settle_balance", { p_order_id: input.orderId })
      : "cancel" in input
      ? await supabase.rpc("kitchen_cancel_order", {
          p_order_id: input.orderId,
          p_reason: input.reason ?? null,
        })
      : "payment" in input
      ? input.payment === "confirm"
        ? await supabase.rpc("kitchen_confirm_payment", {
            p_order_id: input.orderId,
            p_amount_received: input.amountReceived ?? null,
          })
        : await supabase.rpc("kitchen_reject_payment", {
            p_order_id: input.orderId,
            p_reason: input.reason ?? null,
          })
      : await supabase.rpc("kitchen_advance_order", {
          p_order_id: input.orderId,
          p_to: input.to,
        });

  if (error) {
    const map: Record<string, number> = { [NOT_FOUND]: 404, [BAD_TRANSITION]: 409, [NOT_ALLOWED]: 400 };
    const status = map[error.code ?? ""] ?? 500;
    if (status === 500) console.error("kitchen_advance_order failed", error);
    // The RPC messages are written for someone standing in a kitchen, so they
    // are passed through rather than replaced with something generic.
    return NextResponse.json(
      { error: status === 500 ? "That didn't work. Try again." : error.message },
      { status },
    );
  }
  return NextResponse.json(data);
}

/**
 * A short-lived link to the buyer's proof of transfer.
 *
 * The bucket is private and stays private. This mints a signed URL through the
 * COOK'S OWN session, so storage RLS is the arbiter, and the path itself is
 * fetched from an RPC that refuses any order outside their kitchens. Two
 * minutes: long enough to look at, too short to pass around.
 */
export async function PUT(req: NextRequest) {
  const limited = guard(req, "kitchen-receipt", 30, 60_000);
  if (limited) return limited;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = z.object({ orderId: z.string().uuid() }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const { data: path, error } = await supabase.rpc("kitchen_receipt_path", {
    p_order_id: parsed.data.orderId,
  });
  if (error) {
    if (error.code === NOT_FOUND) return NextResponse.json({ error: "Not found." }, { status: 404 });
    console.error("kitchen_receipt_path failed", error);
    return NextResponse.json({ error: "Could not open that receipt." }, { status: 500 });
  }
  if (!path) return NextResponse.json({ error: "No receipt was uploaded." }, { status: 404 });

  const { data: signed, error: signError } = await supabase.storage
    // "order-receipts" — the bucket the merchant receipt viewer already
    // uses. Checked rather than assumed; the first name I reached for did not
    // exist and would have 404'd every receipt.
    .from("order-receipts")
    .createSignedUrl(path as string, 120);
  if (signError || !signed?.signedUrl) {
    console.error("sign receipt failed", signError);
    return NextResponse.json({ error: "Could not open that receipt." }, { status: 500 });
  }
  return NextResponse.json({ url: signed.signedUrl });
}
