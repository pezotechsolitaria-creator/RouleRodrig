import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { guardShared } from "@/lib/rate-limit";
import { isUuid } from "@/lib/file-signature";

// The organiser's side of the payment loop.
//
// AUTHORIZATION IS NEVER DECIDED HERE. Every path below runs as the SIGNED-IN
// USER — never the service role — so the database is the gate:
//   * confirm_order_payment() accepts store staff OR can_verify_event_payments()
//   * organizer_set_payment_settings() is gated by can_manage_event()
//   * the receipt signed URL is subject to the order-receipts storage policy,
//     which M49b extended to organisers
// If this file were wrong, an organiser still could not reach another event.
//
// Roulé Rodrigues never holds ticket money. The organiser is paid directly, so
// only they can say the transfer landed — the platform must never auto-confirm.

const confirmSchema = z.object({
  orderId: z.string().uuid(),
});

const settingsSchema = z
  .object({
    storeId: z.string().uuid(),
    acceptsCash: z.boolean(),
    acceptsBankTransfer: z.boolean(),
    bankName: z.string().trim().max(120).optional().or(z.literal("")),
    accountHolder: z.string().trim().max(160).optional().or(z.literal("")),
    accountNumber: z.string().trim().max(64).optional().or(z.literal("")),
    instructions: z.string().trim().max(1000).optional().or(z.literal("")),
    requireReceipt: z.boolean().optional(),
  })
  .refine((v) => v.acceptsCash || v.acceptsBankTransfer, {
    message: "Choose at least one way to be paid.",
    path: ["acceptsCash"],
  });

const NOT_FOUND = "RR003";
const ILLEGAL_STATE = "RR004";
const VALIDATION = "RR005";

function rpcError(error: { code?: string; message?: string }, fallback: string) {
  if (error.code === NOT_FOUND) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (error.code === ILLEGAL_STATE) return NextResponse.json({ error: error.message }, { status: 409 });
  if (error.code === VALIDATION) return NextResponse.json({ error: error.message }, { status: 400 });
  console.error(fallback, error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

/** Confirm that the money arrived. This is what issues the ticket: the order
 *  moves to 'paid' and the orders_sync_tickets trigger does the rest. */
export async function POST(req: NextRequest) {
  const limited = await guardShared(req, "organizer-payments", 30, 60_000);
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
  const parsed = confirmSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 400 });

  const { data, error } = await supabase
    .rpc("confirm_order_payment", { p_order_id: parsed.data.orderId })
    .single();

  if (error) return rpcError(error, "Could not confirm that payment.");
  return NextResponse.json(data);
}

/** Where the organiser gets paid. */
export async function PUT(req: NextRequest) {
  const limited = await guardShared(req, "organizer-payment-settings", 20, 60_000);
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
  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }
  const p = parsed.data;

  const { data, error } = await supabase.rpc("organizer_set_payment_settings", {
    p_store_id: p.storeId,
    p_accepts_cash: p.acceptsCash,
    p_accepts_bank: p.acceptsBankTransfer,
    p_bank_name: p.bankName?.trim() || null,
    p_account_holder: p.accountHolder?.trim() || null,
    p_account_number: p.accountNumber?.trim() || null,
    p_instructions: p.instructions?.trim() || null,
    p_require_receipt: p.requireReceipt ?? false,
  });

  if (error) return rpcError(error, "Could not save those payment details.");
  return NextResponse.json(data);
}

/** A short-lived link to the buyer's proof of transfer.
 *
 *  The bucket is private and stays private: this mints a signed URL through the
 *  ORGANISER'S OWN session, so storage RLS decides. An organiser who is not
 *  assigned to this event gets nothing, and the link expires in two minutes —
 *  long enough to look at, too short to pass around. */
export async function GET(req: NextRequest) {
  const limited = await guardShared(req, "organizer-receipt", 40, 60_000);
  if (limited) return limited;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const path = req.nextUrl.searchParams.get("path") ?? "";
  // The path is always `<order_id>/…`. Checking the shape here keeps a malformed
  // value from reaching storage at all; the policy is what actually authorises.
  if (!isUuid(path.split("/")[0] ?? "")) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const { data, error } = await supabase.storage
    .from("order-receipts")
    .createSignedUrl(path, 120);

  if (error || !data?.signedUrl) {
    // RLS refusing and the object being absent are the same answer on purpose.
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return NextResponse.json({ url: data.signedUrl });
}
