import { NextRequest, NextResponse } from "next/server";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/file-signature";

// Everything the admin store editor needs to populate its form: profile,
// payment settings including bank details, the full recurring week, and the
// merchant's subscription with billing history.
//
// The list endpoint deliberately does NOT carry any of this — it is a summary
// over every shop, and shipping bank details for all of them in one payload
// would be the same over-exposure M8 just closed at the database level.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!verifySession(req.cookies.get(COOKIE_NAME)?.value)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasServiceRole()) {
    return NextResponse.json(
      { error: "Admin backend is not configured on this environment (SUPABASE_SERVICE_ROLE_KEY is unset)." },
      { status: 503 },
    );
  }

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const supabase = await getPrivileged();

  const { data: store, error } = await supabase
    .from("stores")
    .select("id, merchant_id, name, slug, tagline, description, phone, whatsapp, address, lat, lng, logo_url, status, currency, featured, featured_until")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("admin store detail failed", error);
    return NextResponse.json({ error: "Could not load that shop." }, { status: 500 });
  }
  if (!store) return NextResponse.json({ error: "Not found." }, { status: 404 });

  // Service role bypasses RLS, so these read straight from the tables. Four
  // independent reads issued together rather than sequentially.
  const [{ data: payment }, { data: days }, { data: merchant }, { data: invoices }] = await Promise.all([
    supabase
      .from("store_payment_settings")
      .select("accepts_cash, accepts_bank_transfer, bank_name, account_holder, account_number, payment_instructions, require_receipt, offers_rr_delivery, offers_pickup, offers_customer_delivery")
      .eq("store_id", id)
      .maybeSingle(),
    supabase
      .from("store_hours")
      .select("weekday, opens_at, closes_at, delivery_opens_at, delivery_closes_at, delivery_closed, is_closed")
      .eq("store_id", id)
      .is("date", null)
      .order("weekday"),
    supabase
      .from("merchants")
      .select("id, display_name, contact_email, status, merchant_subscriptions(plan, status, started_at, current_period_end, grace_days, cancelled_at)")
      .eq("id", store.merchant_id)
      .maybeSingle(),
    supabase
      .from("subscription_invoices")
      .select("id, plan, amount, currency, period_start, period_end, status, paid_at, note")
      .eq("merchant_id", store.merchant_id)
      .order("created_at", { ascending: false })
      .limit(12),
  ]);

  return NextResponse.json({
    store,
    // Column defaults, so an unconfigured shop reads the same here as it
    // behaves in create_order().
    payment: payment ?? {
      accepts_cash: true, accepts_bank_transfer: false,
      bank_name: null, account_holder: null, account_number: null,
      payment_instructions: null, require_receipt: false,
      offers_rr_delivery: true, offers_pickup: true, offers_customer_delivery: true,
    },
    days: days ?? [],
    merchant: merchant ?? null,
    invoices: invoices ?? [],
  });
}
