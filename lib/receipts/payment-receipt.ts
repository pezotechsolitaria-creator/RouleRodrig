import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendBookingPaymentReceipt, sendPlacePaymentReceipt } from "@/lib/email";
import { vehicleCategory, vehicleName } from "@/lib/vehicle-name";
import { METHOD_LABEL, type BookingPaymentMethod } from "@/lib/bookings/in-person";
import { islandToday } from "@/lib/receiptly/documents";

// ── ONE PLACE THAT SAYS "THE MONEY ARRIVED" ─────────────────────────────────
//
// A booking becomes paid down two completely separate paths:
//
//   PayPal   — /api/paypal/capture-order writes deposit_paid_at and flips the
//              status itself, having asked PayPal what it actually took.
//   By bank  — the customer declares a transfer (payment_reported_at), the
//              owner checks it against his statement, and moves the status to
//              `confirmed` from the admin desk.
//   Recorded — (M220) cash, MCB Juice or a card taken in person, written to
//              the booking_payments ledger by the owner. One receipt per
//              payment: sendRecordedPaymentReceipt(), at the foot of this file.
//
// Both ended in silence. This is the one function both of them call, so the
// customer gets the same receipt whichever way they paid — and so the rule
// about WHEN a receipt may be claimed is written once.
//
// Never throws, and never reports a failure upward as an error. Every caller
// sits after a committed write; a mail provider having a bad minute must not
// turn a captured payment into a 500.

export type ReceiptKind = "vehicle" | "place";

/** How they paid, in the words the document will print. Payments recorded in
 *  person (Cash, MCB Juice, Card) are receipted per payment by
 *  sendRecordedPaymentReceipt(), which takes its label from METHOD_LABEL. */
export type PaymentMethod = "PayPal" | "Bank transfer";

const refOf = (id: string) => "RR-" + id.replace(/-/g, "").slice(0, 6).toUpperCase();

/** What the customer asked for, in words they will recognise. */
function whenLabel(b: {
  start_date?: string | null;
  end_date?: string | null;
  time_slot?: string | null;
}): string {
  const fmt = (d: string) =>
    new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const start = b.start_date ? fmt(b.start_date) : null;
  const end = b.end_date && b.end_date !== b.start_date ? fmt(b.end_date) : null;
  const dates = start ? (end ? `${start} → ${end}` : start) : "your dates";
  return b.time_slot ? `${dates} at ${b.time_slot}` : dates;
}

/**
 * Send the receipt for a booking whose money has landed.
 *
 * Returns false, quietly, for every reason a receipt should not go out: no
 * email address, no row, and — the one that matters — no evidence. A booking
 * moved to `confirmed` with neither a recorded payment nor a declared transfer
 * has no payment to receipt, and printing one would put a figure the business
 * cannot show in a bank statement onto a document the customer keeps.
 */
export async function sendPaymentReceipt(
  admin: SupabaseClient,
  kind: ReceiptKind,
  id: string,
  method: PaymentMethod,
): Promise<boolean> {
  try {
    return kind === "place"
      ? await placeReceipt(admin, id, method)
      : await vehicleReceipt(admin, id, method);
  } catch (err) {
    console.error("payment receipt failed", { kind, id, err });
    return false;
  }
}

async function vehicleReceipt(
  admin: SupabaseClient,
  id: string,
  method: PaymentMethod,
): Promise<boolean> {
  const { data, error } = await admin
    .from("bookings")
    .select("id, name, email, phone, scooter, start_date, end_date, days, pickup_time, total_amount, delivery_fee, deposit_amount, deposit_pct, amount_paid, deposit_paid_at, payment_reported_at")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) {
    if (error) console.error("payment receipt: could not read the booking", { id, error });
    return false;
  }

  const b = data as Record<string, unknown>;
  if (!b.email) return false;
  if (!b.deposit_paid_at && !b.payment_reported_at) return false;

  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;

  // ── WHAT WAS RECEIVED ────────────────────────────────────────────────────
  //
  // `amount_paid` is written only by the PayPal capture, from what PayPal says
  // it took. There is no such column for a bank transfer, so the figure falls
  // back to the deposit the customer was asked for — which is the figure the
  // owner matched against his statement before confirming. Both are WHOLE
  // RUPEES; see lib/invoicing/subjects.ts.
  const received = num(b.amount_paid) ?? num(b.deposit_amount);

  return sendBookingPaymentReceipt({
    id: b.id as string,
    email: (b.email as string) ?? null,
    name: (b.name as string) || "there",
    phone: (b.phone as string) ?? null,
    // The email must say "BURGMAN 125cc", never the "burgman" id the row holds.
    scooter: await vehicleName((b.scooter as string) ?? ""),
    // Resolved from the RAW fleet id: cars and scooters are separate domains.
    vehicleCategory: await vehicleCategory((b.scooter as string) ?? ""),
    start_date: (b.start_date as string) ?? "",
    end_date: (b.end_date as string) ?? "",
    days: num(b.days),
    pickup_time: (b.pickup_time as string) ?? null,
    total_amount: num(b.total_amount),
    delivery_fee: num(b.delivery_fee),
    deposit_amount: num(b.deposit_amount),
    deposit_pct: num(b.deposit_pct),
    received,
    method,
  });
}

async function placeReceipt(
  admin: SupabaseClient,
  id: string,
  method: PaymentMethod,
): Promise<boolean> {
  const { data, error } = await admin
    .from("place_bookings")
    .select("id, name, email, phone, place_name, category, start_date, end_date, time_slot, guests, quantity, deposit_amount, amount_paid, deposit_paid_at, payment_reported_at")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) {
    if (error) console.error("payment receipt: could not read the reservation", { id, error });
    return false;
  }

  const b = data as Record<string, unknown>;
  if (!b.email) return false;
  if (!b.deposit_paid_at && !b.payment_reported_at) return false;

  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;

  // deposit_amount is WHOLE RUPEES and, despite the name, the WHOLE PRICE
  // (M210) — so for a reservation "received the price" means paid in full.
  const price = num(b.deposit_amount);

  return sendPlacePaymentReceipt({
    id: b.id as string,
    email: (b.email as string) ?? null,
    name: (b.name as string) || "there",
    phone: (b.phone as string) ?? null,
    placeName: (b.place_name as string) || "your booking",
    category: (b.category as string) ?? null,
    when: whenLabel(b as { start_date?: string | null; end_date?: string | null; time_slot?: string | null }),
    start_date: (b.start_date as string) ?? null,
    end_date: (b.end_date as string) ?? null,
    time_slot: (b.time_slot as string) ?? null,
    guests: num(b.guests),
    quantity: num(b.quantity),
    price,
    received: num(b.amount_paid) ?? price,
    method,
  });
}

// ── A PAYMENT THE OWNER RECORDED (M220) ─────────────────────────────────────
//
// The third path. Cash handed over at the counter, MCB Juice to his phone, a
// card on the terminal: the owner records it from the admin desk and
// admin_record_booking_payment() writes a booking_payments row, adds it to
// amount_paid and stamps deposit_paid_at on the first one.
//
// The ledger row IS the evidence, so this does not need the guard above — and
// it must not reuse sendPaymentReceipt(): that one is once per booking and
// prints the running total as "received", which for a second cash payment
// would re-receipt the first. This one is for ONE payment: its amount, its
// method in the owner's words (METHOD_LABEL), the day it changed hands, and
// what is left after every payment so far. Same email, same document.

export type RecordedReceiptResult = { emailed: boolean; hasEmail: boolean };

type LedgerRow = {
  id: string;
  booking_kind: string;
  booking_id: string;
  amount_rupees: number;
  method: string;
  received_at: string | null;
};

/**
 * Send the receipt for one booking_payments row. Never throws. `hasEmail`
 * tells the desk whether to phone instead; a payment that does not belong to
 * the booking named is refused rather than receipted to the wrong person.
 */
export async function sendRecordedPaymentReceipt(
  admin: SupabaseClient,
  kind: ReceiptKind,
  id: string,
  paymentId: string,
): Promise<RecordedReceiptResult> {
  try {
    const { data, error } = await admin
      .from("booking_payments")
      .select("id, booking_kind, booking_id, amount_rupees, method, received_at")
      .eq("id", paymentId)
      .maybeSingle();
    if (error || !data) {
      if (error) console.error("recorded receipt: could not read the payment", { paymentId, error });
      return { emailed: false, hasEmail: false };
    }
    const p = data as LedgerRow;
    if (p.booking_kind !== kind || p.booking_id !== id) {
      console.error("recorded receipt: payment does not belong to this booking", { paymentId, kind, id });
      return { emailed: false, hasEmail: false };
    }
    const payment = {
      paymentId: p.id,
      received: typeof p.amount_rupees === "number" && p.amount_rupees > 0 ? p.amount_rupees : null,
      method: METHOD_LABEL[p.method as BookingPaymentMethod] ?? p.method,
      // The island's day, not UTC's: cash taken at 01:00 on Rodrigues was
      // taken "today", and the receipt must say so.
      receivedOn: islandToday(p.received_at ? new Date(p.received_at) : new Date()),
    };
    return kind === "place"
      ? await recordedPlaceReceipt(admin, id, payment)
      : await recordedVehicleReceipt(admin, id, payment);
  } catch (err) {
    console.error("recorded receipt failed", { kind, id, paymentId, err });
    return { emailed: false, hasEmail: false };
  }
}

type RecordedPaymentFacts = {
  paymentId: string;
  received: number | null;
  method: string;
  receivedOn: string;
};

const numOrNull = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

async function recordedVehicleReceipt(
  admin: SupabaseClient,
  id: string,
  p: RecordedPaymentFacts,
): Promise<RecordedReceiptResult> {
  const { data, error } = await admin
    .from("bookings")
    .select("id, name, email, phone, scooter, start_date, end_date, days, pickup_time, total_amount, delivery_fee, deposit_amount, deposit_pct, amount_paid, pay_in_person")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) {
    if (error) console.error("recorded receipt: could not read the booking", { id, error });
    return { emailed: false, hasEmail: false };
  }
  const b = data as Record<string, unknown>;
  const email = typeof b.email === "string" && b.email.trim() ? b.email.trim() : null;
  if (!email) return { emailed: false, hasEmail: false };

  const emailed = await sendBookingPaymentReceipt({
    id: b.id as string,
    email,
    name: (b.name as string) || "there",
    phone: (b.phone as string) ?? null,
    scooter: await vehicleName((b.scooter as string) ?? ""),
    vehicleCategory: await vehicleCategory((b.scooter as string) ?? ""),
    start_date: (b.start_date as string) ?? "",
    end_date: (b.end_date as string) ?? "",
    days: numOrNull(b.days),
    pickup_time: (b.pickup_time as string) ?? null,
    total_amount: numOrNull(b.total_amount),
    delivery_fee: numOrNull(b.delivery_fee),
    deposit_amount: numOrNull(b.deposit_amount),
    deposit_pct: numOrNull(b.deposit_pct),
    received: p.received,
    method: p.method,
    paymentId: p.paymentId,
    // amount_paid already includes this payment: the RPC added it before the
    // route called us.
    paidToDate: numOrNull(b.amount_paid),
    receivedOn: p.receivedOn,
    payInPerson: b.pay_in_person === true,
  });
  return { emailed, hasEmail: true };
}

async function recordedPlaceReceipt(
  admin: SupabaseClient,
  id: string,
  p: RecordedPaymentFacts,
): Promise<RecordedReceiptResult> {
  const { data, error } = await admin
    .from("place_bookings")
    .select("id, name, email, phone, place_name, category, start_date, end_date, time_slot, guests, quantity, deposit_amount, amount_paid, pay_in_person")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) {
    if (error) console.error("recorded receipt: could not read the reservation", { id, error });
    return { emailed: false, hasEmail: false };
  }
  const b = data as Record<string, unknown>;
  const email = typeof b.email === "string" && b.email.trim() ? b.email.trim() : null;
  if (!email) return { emailed: false, hasEmail: false };

  const emailed = await sendPlacePaymentReceipt({
    id: b.id as string,
    email,
    name: (b.name as string) || "there",
    phone: (b.phone as string) ?? null,
    placeName: (b.place_name as string) || "your booking",
    category: (b.category as string) ?? null,
    when: whenLabel(b as { start_date?: string | null; end_date?: string | null; time_slot?: string | null }),
    start_date: (b.start_date as string) ?? null,
    end_date: (b.end_date as string) ?? null,
    time_slot: (b.time_slot as string) ?? null,
    guests: numOrNull(b.guests),
    quantity: numOrNull(b.quantity),
    // deposit_amount is the WHOLE PRICE of a reservation (M210).
    price: numOrNull(b.deposit_amount),
    received: p.received,
    method: p.method,
    paymentId: p.paymentId,
    paidToDate: numOrNull(b.amount_paid),
    receivedOn: p.receivedOn,
    payInPerson: b.pay_in_person === true,
  });
  return { emailed, hasEmail: true };
}

/** Exported for the callers that want the reference in a log line. */
export const receiptReference = refOf;
