import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { guardShared } from "@/lib/rate-limit";
import { detectFileType } from "@/lib/file-signature";

// ── "I have sent the transfer", for a rental or an activity (M83) ───────────
//
// The shop/food equivalent is /api/orders/report-payment. This is the same
// thing for the two services that did not have it: a customer who paid a
// scooter deposit or an activity in full by bank transfer was told, in three
// languages, to send the slip on WhatsApp — so the proof lived in a chat
// thread, detached from the booking, and the owner reconciled by scrolling.
//
// Deliberately the same shape as the order route, down to the safety property
// that makes it safe at all:
//
//   THE OBJECT PATH IS DERIVED FROM THE ID THE DATABASE RESOLVED,
//   NEVER FROM ANYTHING THE CLIENT SENT.
//
// The credential is the one the guest already has and already uses on /track:
// the booking reference plus the email they booked with, checked inside
// lookup_booking / guest_report_booking_payment with case-insensitive equality
// rather than ILIKE (see M11 — '%' as an email once matched every row).
const MAX_BYTES = 4 * 1024 * 1024; // Under Vercel's ~4.5MB body limit.
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf",
};

const reportSchema = z.object({
  // Accepts "RR-1A2B3C" or "1a2b3c" — the RPC reduces it to hex either way.
  ref: z.string().trim().min(6, "Enter your booking reference.").max(32),
  email: z.string().trim().toLowerCase().email("Enter the email you booked with.").max(254),
});

const NOT_FOUND_CODE = "RR003";
const VALIDATION_CODE = "RR005";

// One message for "no such reference" and "wrong email" — this must never
// confirm which references exist.
const NOT_FOUND_MESSAGE = "We couldn't find a booking with that reference and email.";

export async function POST(req: NextRequest) {
  // Tighter than the read-only lookup (10/min): there is no legitimate reason
  // to declare a transfer more than a few times.
  const limited = await guardShared(req, "booking-report-payment", 5, 60_000);
  if (limited) return limited;

  if (!hasServiceRole()) {
    console.error("booking report payment: SUPABASE_SERVICE_ROLE_KEY missing");
    return NextResponse.json({ error: "This is unavailable right now." }, { status: 503 });
  }

  // JSON (declaration only) and multipart (with proof) are both accepted.
  const isMultipart = (req.headers.get("content-type") ?? "").includes("multipart/form-data");

  let raw: unknown;
  let file: File | null = null;
  if (isMultipart) {
    const fd = await req.formData();
    raw = { ref: fd.get("ref"), email: fd.get("email") };
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
  const { ref, email } = parsed.data;

  // Validate the file BEFORE touching the database — a rejected upload must not
  // have already stamped the booking as "customer says they paid".
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
    // Resolve the booking through the SAME credential the write uses, so the id
    // the path is built from is one this caller has already proven they reach.
    const { data: found, error: lookupError } = await supabase.rpc("lookup_booking", {
      p_ref: ref,
      p_email: email,
    });
    const id = (found as { id?: string } | null)?.id;
    if (lookupError || !id) {
      return NextResponse.json({ error: NOT_FOUND_MESSAGE }, { status: 404 });
    }

    const path = `${id}/receipt-${Date.now()}.${EXT[detected]}`;
    const { error: uploadError } = await supabase.storage
      .from("booking-receipts")
      .upload(path, file, { contentType: detected, upsert: false });

    if (uploadError) {
      console.error("booking receipt upload failed", uploadError);
      return NextResponse.json({ error: "Could not upload that file." }, { status: 400 });
    }
    receiptPath = path;
  }

  const { data, error } = await supabase.rpc("guest_report_booking_payment", {
    p_ref: ref,
    p_email: email,
    p_receipt_path: receiptPath,
  });

  if (error) {
    if (error.code === NOT_FOUND_CODE) {
      return NextResponse.json({ error: NOT_FOUND_MESSAGE }, { status: 404 });
    }
    if (error.code === VALIDATION_CODE) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("guest_report_booking_payment failed", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }

  // ── Tell the owner, or none of the above matters ─────────────────────────
  //
  // Every payment path on this site used to end here: the money is declared,
  // the row is stamped, and nothing happens until the owner happens to look.
  // Best-effort and after the write — the customer's declaration is already
  // recorded, and a mail provider having a bad minute must not turn a
  // successful action into an error on their screen.
  const result = data as { kind?: string; id?: string } | null;
  if (result?.id) {
    try {
      const table = result.kind === "place" ? "place_bookings" : "bookings";
      const { data: row } = await supabase
        .from(table)
        .select(
          result.kind === "place"
            ? "name, phone, email, place_name, deposit_amount"
            : "name, phone, email, scooter, deposit_amount",
        )
        .eq("id", result.id)
        .maybeSingle();
      const r = (row ?? {}) as Record<string, unknown>;
      const { sendPaymentReportedAlert } = await import("@/lib/email");
      await sendPaymentReportedAlert({
        kind: result.kind === "place" ? "activity" : "vehicle",
        reference: "RR-" + result.id.replace(/-/g, "").slice(0, 6).toUpperCase(),
        customer: (r.name as string) ?? "A customer",
        item: ((r.place_name ?? r.scooter) as string) ?? null,
        amount: typeof r.deposit_amount === "number" ? r.deposit_amount : null,
        hasReceipt: !!receiptPath,
        phone: (r.phone as string) ?? null,
        email: (r.email as string) ?? null,
      });
    } catch (e) {
      console.error("payment reported: owner alert failed", e);
    }
  }

  return NextResponse.json({ ok: true, ...(data as object) });
}
