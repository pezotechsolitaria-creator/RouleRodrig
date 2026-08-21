import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { guard } from "@/lib/rate-limit";
import { isUuid } from "@/lib/file-signature";
import { notifyOrderCustomer } from "@/lib/notifications/order-events";
import { enqueueNotification, formatWhatsAppMessage } from "@/lib/notifications/queue";

const NOT_FOUND_CODE = "RR003";
const ILLEGAL_STATE_CODE = "RR004";

// The merchant attests that the money arrived. This is the ONLY way a
// marketplace payment becomes 'captured' — the platform never touches the
// funds, so no automated signal can prove receipt. confirm_order_payment()
// re-checks is_store_staff() itself, so this route is a thin wrapper rather
// than the security boundary.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = guard(req, "confirm-payment", 30, 60_000);
  if (limited) return limited;

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  // How much actually arrived. Absent means the whole total, which is every
  // order that is not a split. The RPC refuses anything above the total.
  let amountReceived: number | null = null;
  try {
    const body = (await req.json()) as { amountReceived?: unknown };
    if (typeof body?.amountReceived === "number" && Number.isInteger(body.amountReceived) && body.amountReceived > 0) {
      amountReceived = body.amountReceived;
    }
  } catch {
    // No body at all is the ordinary "confirm in full" case, not an error.
  }

  const { data, error } = await supabase
    .rpc("confirm_order_payment", { p_order_id: id, p_amount_received: amountReceived })
    .single();

  if (error) {
    if (error.code === NOT_FOUND_CODE) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error.code === ILLEGAL_STATE_CODE) return NextResponse.json({ error: error.message }, { status: 409 });
    console.error("confirm_order_payment failed", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }

  // PaymentConfirmCard promises this "tells the customer to expect it".
  // Payment confirmed is the single most reassuring message in the whole
  // lifecycle, and until now it reached the customer through no channel at all.
  try {
    await notifyOrderCustomer(id, "payment_confirmed");
  } catch (err) {
    console.error("payment-confirmed notification failed", err);
  }

  // ── AND THE OWNER, ON WHATSAPP (M132) ─────────────────────────────────────
  //
  // Money arriving is the event he most wants to know about without opening
  // anything, and it was the one that told him nothing: the customer was
  // reassured, the ledger was written, and his phone stayed quiet.
  //
  // Category "payments", so it can go to a different number than the kitchen's
  // — he is not the same person standing at the pass.
  //
  // Never inline-fails the confirmation: the money is confirmed either way, and
  // a CallMeBot outage must not make a merchant press the button twice.
  try {
    // confirm_order_payment() returns only (order_id, status) — checked
    // against pg_get_function_result, not assumed. Reading order_number and
    // total off it would have silently produced "Order 3F2A91B4 - payment
    // received", a truncated UUID and no amount, on every alert.
    const { data: order } = await supabase
      .from("orders")
      .select("order_number, total")
      .eq("id", id)
      .maybeSingle();
    const ref = (order?.order_number as string | null) ?? id.slice(0, 8).toUpperCase();
    const amount =
      typeof order?.total === "number" ? `Rs ${order.total.toLocaleString("en-US")}` : null;
    await enqueueNotification({
      type: "payment_confirmed",
      category: "payments",
      message: formatWhatsAppMessage({
        title: "Payment confirmed",
        lines: [
          amount ? `Order ${ref} — ${amount} received.` : `Order ${ref} — payment received.`,
          "https://roulerodrig.com/admin",
        ],
      }),
      // One per order. Confirming twice is a real thing a merchant does when
      // the first press seemed not to work; it must not ping twice.
      dedupeKey: `payment:confirmed:${id}`,
      orderId: id,
    });
  } catch (err) {
    console.error("payment-confirmed WhatsApp failed", err);
  }

  return NextResponse.json(data);
}
