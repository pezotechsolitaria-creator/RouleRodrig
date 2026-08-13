import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { guardShared } from "@/lib/rate-limit";
import { detectFileType } from "@/lib/file-signature";

// ── "I have sent the transfer", for a guest (M21, extended M49) ─────────────
//
// The account-holder version is POST /api/orders/[id]/receipt →
// submit_payment_receipt(), which opens with `if v_customer is null then raise
// 'not authenticated'`. A guest order has customer_id NULL and no session, so
// that path can never run.
//
// Same credential as /api/orders/lookup: the order number plus the address that
// placed the order. Same service-role-only RPC, same rate-limited single entry
// point. guest_report_payment() additionally requires customer_id IS NULL, so
// knowing a REGISTERED customer's order number and email still gets you nothing.
//
// M49 adds the proof itself. A guest cannot upload to storage — order-receipts
// RLS derives ownership from orders.customer_id, which is NULL for them — so the
// SERVER uploads on their behalf, and only after the RPC's own credential check
// has resolved an order. That is the whole reason this is safe:
//
//   THE OBJECT PATH IS DERIVED FROM THE ORDER ID THE DATABASE RESOLVED,
//   NEVER FROM ANYTHING THE CLIENT SENT.
//
// So a caller cannot aim an upload at another order's folder, and
// guest_report_payment() re-checks the prefix anyway (RR005) in case a future
// caller here is less careful.
const MAX_BYTES = 4 * 1024 * 1024; // Under Vercel's ~4.5MB body limit.
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf",
};

const reportSchema = z.object({
  orderNumber: z.string().trim().min(6, "Enter your order number.").max(32),
  email: z.string().trim().toLowerCase().email("Enter the email you ordered with.").max(254),
});

const NOT_FOUND_CODE = "RR003";
const ILLEGAL_STATE_CODE = "RR004";
const VALIDATION_CODE = "RR005";
const METHOD_CODE = "RR009";

// One message for "no such order" and "wrong email" — this must never confirm
// that an order number exists.
const NOT_FOUND_MESSAGE = "We couldn't find an order with that number and email.";

export async function POST(req: NextRequest) {
  // Tighter than the read-only lookup (8/min): there is no legitimate reason to
  // declare a transfer more than a few times.
  const limited = await guardShared(req, "order-report-payment", 5, 60_000);
  if (limited) return limited;

  if (!hasServiceRole()) {
    console.error("report payment: SUPABASE_SERVICE_ROLE_KEY missing");
    return NextResponse.json({ error: "This is unavailable right now." }, { status: 503 });
  }

  // JSON (no proof) and multipart (with proof) are both accepted, so the
  // original callers keep working unchanged.
  const isMultipart = (req.headers.get("content-type") ?? "").includes("multipart/form-data");

  let raw: unknown;
  let file: File | null = null;
  if (isMultipart) {
    const fd = await req.formData();
    raw = { orderNumber: fd.get("orderNumber"), email: fd.get("email") };
    file = fd.get("file") as File | null;
  } else {
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }
  }

  const parsed = reportSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }
  const { orderNumber, email } = parsed.data;

  // Validate the file BEFORE touching the database — a rejected upload should
  // not have moved the order to "awaiting confirmation" first.
  let detected: string | null = null;
  if (file && file.size > 0) {
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "That file is too large (max 4 MB)." }, { status: 400 });
    }
    // Never trust the client-declared type — read the real signature, and store
    // THAT as the contentType so a spoofed part cannot cause the object to be
    // served back under an attacker-chosen type.
    detected = await detectFileType(file);
    if (!detected || !ALLOWED.has(detected)) {
      return NextResponse.json({ error: "Upload a JPG, PNG, WebP or PDF." }, { status: 400 });
    }
  }

  const supabase = await getPrivileged();

  let receiptPath: string | null = null;
  if (file && detected) {
    // Resolve the order through the SAME credential the RPC uses, so the id the
    // path is built from is one this caller has already proven they may reach.
    const { data: found, error: lookupError } = await supabase.rpc("lookup_order", {
      p_order_number: orderNumber,
      p_email: email,
    });
    if (lookupError || !found?.id) {
      return NextResponse.json({ error: NOT_FOUND_MESSAGE }, { status: 404 });
    }

    const path = `${found.id}/receipt-${Date.now()}.${EXT[detected]}`;
    const { error: uploadError } = await supabase.storage
      .from("order-receipts")
      .upload(path, file, { contentType: detected, upsert: false });

    if (uploadError) {
      console.error("guest receipt upload failed", uploadError);
      return NextResponse.json({ error: "Could not upload that file." }, { status: 400 });
    }
    receiptPath = path;
  }

  const { data, error } = await supabase.rpc("guest_report_payment", {
    p_order_number: orderNumber,
    p_email: email,
    p_receipt_path: receiptPath,
  });

  if (error) {
    if (error.code === NOT_FOUND_CODE) {
      return NextResponse.json({ error: NOT_FOUND_MESSAGE }, { status: 404 });
    }
    if (error.code === ILLEGAL_STATE_CODE) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error.code === METHOD_CODE) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error.code === VALIDATION_CODE) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("guest_report_payment failed", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }

  // Tell the owner. Same reasoning as the booking route: an order that is paid
  // and unseen is a customer waiting on a desk nobody has opened. Best-effort
  // and after the write, so a mail provider having a bad minute cannot turn a
  // successful declaration into an error on the customer's screen.
  try {
    const { data: row } = await supabase
      .from("orders")
      .select("order_number, customer_name, customer_phone, customer_email, total, payment_receipt_path")
      .eq("order_number", orderNumber)
      .maybeSingle();
    const r = (row ?? {}) as Record<string, unknown>;
    const { sendPaymentReportedAlert } = await import("@/lib/email");
    await sendPaymentReportedAlert({
      kind: "order",
      reference: (r.order_number as string) ?? orderNumber,
      customer: (r.customer_name as string) ?? "A customer",
      item: null,
      amount: typeof r.total === "number" ? r.total : null,
      hasReceipt: !!r.payment_receipt_path,
      phone: (r.customer_phone as string) ?? null,
      email: (r.customer_email as string) ?? null,
    });
  } catch (e) {
    console.error("order payment reported: owner alert failed", e);
  }

  return NextResponse.json(data ?? { status: "awaiting_payment_confirmation" });
}
