import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { guard } from "@/lib/rate-limit";
import { isUuid } from "@/lib/file-signature";

// Mints a short-lived signed URL for a receipt in the PRIVATE order-receipts
// bucket. Runs as the signed-in user, so storage RLS decides — the policy only
// grants read to the order's own customer, that shop's staff, and admins.
// A merchant cannot obtain a URL for someone else's order, and the URL itself
// expires, so it can't be forwarded as a durable link.
const TTL_SECONDS = 300;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = guard(req, "receipt-url", 60, 60_000);
  if (limited) return limited;

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  // RLS on orders already restricts this to the customer or the shop's staff.
  const { data: order } = await supabase
    .from("orders")
    .select("id, payment_receipt_path")
    .eq("id", id)
    .maybeSingle();

  if (!order) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!order.payment_receipt_path) {
    return NextResponse.json({ error: "No receipt has been uploaded." }, { status: 404 });
  }

  const { data, error } = await supabase.storage
    .from("order-receipts")
    .createSignedUrl(order.payment_receipt_path, TTL_SECONDS);

  if (error || !data) {
    console.error("sign receipt url failed", error);
    return NextResponse.json({ error: "Could not open the receipt." }, { status: 500 });
  }

  return NextResponse.json({ url: data.signedUrl, expiresIn: TTL_SECONDS });
}
