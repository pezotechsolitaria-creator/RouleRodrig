import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOwnStoreId } from "@/lib/merchant/context";
import { guard } from "@/lib/rate-limit";
import { paymentSettingsSchema } from "@/lib/schemas/checkout";

const SUBSCRIPTION_CODE = "RR008";

// A shop's own payment settings. store_id is resolved from the session, never
// accepted from the body, so a merchant can only ever read or write their own.
// RLS (store_payment_settings_staff_write) is the real gate underneath.
export async function GET(req: NextRequest) {
  const limited = guard(req, "payment-settings-read", 60, 60_000);
  if (limited) return limited;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const storeId = await getOwnStoreId(supabase);
  if (!storeId) return NextResponse.json({ error: "No shop found for this account." }, { status: 404 });

  // Two reads, because the bank columns are no longer selectable from the table:
  // M8 withheld them so a signed-in customer could not enumerate every shop's
  // account details. The flags stay on the row (checkout needs them); the
  // sensitive fields come from store_bank_details(), which releases them to
  // store staff, a platform admin, or a customer who has an order there.
  const [{ data: flags, error }, { data: bank }] = await Promise.all([
    supabase
      .from("store_payment_settings")
      .select("accepts_cash, accepts_bank_transfer, require_receipt, offers_rr_delivery, offers_pickup, offers_customer_delivery")
      .eq("store_id", storeId)
      .maybeSingle(),
    supabase.rpc("store_bank_details", { p_store_id: storeId }).maybeSingle(),
  ]);

  if (error) {
    console.error("read payment settings failed", error);
    return NextResponse.json({ error: "Failed to load payment settings." }, { status: 500 });
  }

  const data = flags
    ? {
        ...flags,
        bank_name: (bank as { bank_name?: string | null } | null)?.bank_name ?? null,
        account_holder: (bank as { account_holder?: string | null } | null)?.account_holder ?? null,
        account_number: (bank as { account_number?: string | null } | null)?.account_number ?? null,
        payment_instructions: (bank as { payment_instructions?: string | null } | null)?.payment_instructions ?? null,
      }
    : null;

  // A shop that has never saved settings takes cash only — the same default the
  // create_order() RPC assumes when no row exists.
  return NextResponse.json({
    settings: data ?? {
      accepts_cash: true,
      accepts_bank_transfer: false,
      bank_name: null,
      account_holder: null,
      account_number: null,
      payment_instructions: null,
      require_receipt: false,
      offers_rr_delivery: true,
    },
  });
}

export async function PUT(req: NextRequest) {
  const limited = guard(req, "payment-settings-write", 20, 60_000);
  if (limited) return limited;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const storeId = await getOwnStoreId(supabase);
  if (!storeId) return NextResponse.json({ error: "No shop found for this account." }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = paymentSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }
  const v = parsed.data;

  // Written through set_store_payment_settings() rather than a direct upsert:
  // the bank columns are no longer writable from a user session, and this shares
  // ONE validated implementation with the admin's door so the two cannot drift.
  const blank = (s?: string) => (s && s.trim() ? s.trim() : null);
  const { error } = await supabase.rpc("set_store_payment_settings", {
    p_store_id: storeId,
    p_patch: {
      accepts_cash: v.acceptsCash,
      accepts_bank_transfer: v.acceptsBankTransfer,
      bank_name: blank(v.bankName),
      account_holder: blank(v.accountHolder),
      account_number: blank(v.accountNumber),
      payment_instructions: blank(v.paymentInstructions),
      require_receipt: v.requireReceipt,
      offers_rr_delivery: v.offersRrDelivery,
      // Only sent when the client actually supplied them, so an older client
      // cannot silently reset a merchant's choice to the default.
      ...(v.offersPickup !== undefined ? { offers_pickup: v.offersPickup } : {}),
      ...(v.offersCustomerDelivery !== undefined
        ? { offers_customer_delivery: v.offersCustomerDelivery }
        : {}),
    },
  });

  if (error) {
    // An expired subscription blocks shop edits (trigger, errcode RR008).
    if (error.code === SUBSCRIPTION_CODE) return NextResponse.json({ error: error.message }, { status: 403 });
    // The DB CHECKs mirror the Zod rules; surface them rather than a 500.
    if (error.code === "23514") {
      return NextResponse.json(
        { error: "Those settings aren't valid — check the bank details and that one method is enabled." },
        { status: 400 },
      );
    }
    console.error("save payment settings failed", error);
    return NextResponse.json({ error: "Failed to save payment settings." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
