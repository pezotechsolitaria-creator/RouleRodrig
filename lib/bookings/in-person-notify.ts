import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { balanceRupees, isPayInPerson, type BookingKind } from "./in-person";
import { sendPlaceConfirmedInPerson, sendVehicleConfirmedInPerson } from "@/lib/email";
import { sendRecordedPaymentReceipt } from "@/lib/receipts/payment-receipt";
import { notifyBookingStatus } from "@/lib/notifications/booking-status";

// ── WHAT THE CUSTOMER IS TOLD ABOUT A BOOKING PAID IN PERSON (M220) ─────────
//
// Two moments, two messages:
//   · confirmed, pays in person → "Your booking is confirmed. Pay Rs X in cash
//     at pickup / on arrival. Nothing to pay online." (+ confirmation PDF, and
//     the lock-screen push the old 'Confirmed' pill used to send)
//   · a payment recorded        → a receipt that says how it was paid (Cash,
//     MCB Juice…), for THIS payment, with what is still owed.
//
// Called by app/api/admin/bookings/in-person/route.ts AFTER the database has
// committed. Best-effort: a failed email never undoes the owner's action; the
// route reports `emailed` / `hasEmail` so the desk can say "phone them".
//
// This file READS; lib/email.ts and lib/receipts/payment-receipt.ts WRITE the
// words. The figures all come from lib/bookings/in-person.ts.

export type NotifyResult = { emailed: boolean; hasEmail: boolean };

const NOTHING: NotifyResult = { emailed: false, hasEmail: false };

const refOf = (id: string) => "RR-" + id.replace(/-/g, "").slice(0, 6).toUpperCase();

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

/** The customer's written confirmation of a booking they will pay in person. */
export async function sendInPersonConfirmation(
  admin: SupabaseClient,
  kind: BookingKind,
  id: string,
): Promise<NotifyResult> {
  try {
    return kind === "place" ? await confirmPlace(admin, id) : await confirmVehicle(admin, id);
  } catch (err) {
    console.error("in-person confirmation failed", { kind, id, err });
    return NOTHING;
  }
}

async function confirmVehicle(admin: SupabaseClient, id: string): Promise<NotifyResult> {
  const { data, error } = await admin
    .from("bookings")
    .select(
      "id, name, email, phone, scooter, start_date, end_date, days, pickup_time, return_time, total_price, total_amount, delivery_fee, deposit_amount, deposit_pct, amount_paid, deposit_paid_at, asset_label, status, pay_in_person",
    )
    .eq("id", id)
    .maybeSingle();
  if (error || !data) {
    if (error) console.error("in-person confirmation: could not read the booking", { id, error });
    return NOTHING;
  }
  const b = data as Record<string, unknown>;
  const email = str(b.email);
  const hasEmail = !!email;

  // Only what the RPC just made true gets this letter. A booking that is not
  // (or no longer) confirmed-in-person would be told to bring cash for
  // something that is not happening.
  if (b.status !== "confirmed" || b.pay_in_person !== true) return { emailed: false, hasEmail };

  const money = {
    status: "confirmed",
    pay_in_person: true,
    total_amount: num(b.total_amount),
    amount_paid: num(b.amount_paid),
  };

  const emailed = email
    ? await sendVehicleConfirmedInPerson({
        id,
        ref: refOf(id),
        name: str(b.name) ?? "there",
        email,
        phone: str(b.phone),
        // The RAW fleet id: the sender resolves the display name and whether
        // it is a car or a scooter from it.
        scooter: str(b.scooter) ?? "",
        start_date: str(b.start_date) ?? "",
        end_date: str(b.end_date) ?? "",
        days: num(b.days) ?? 1,
        pickup_time: str(b.pickup_time),
        return_time: str(b.return_time),
        total_price: str(b.total_price),
        total_amount: money.total_amount,
        delivery_fee: num(b.delivery_fee),
        deposit_amount: num(b.deposit_amount),
        deposit_pct: num(b.deposit_pct),
        amount_paid: money.amount_paid,
        deposit_paid_at: str(b.deposit_paid_at),
        asset_label: str(b.asset_label),
        message: null,
        status: "confirmed",
        pay_in_person: true,
      })
    : false;

  // The push the 'Confirmed' pill used to send, now saying how to pay.
  await notifyBookingStatus({
    id,
    email,
    status: "confirmed",
    kind: "vehicle",
    payInPerson: isPayInPerson(money),
    balanceRupees: balanceRupees("vehicle", money),
  });

  return { emailed, hasEmail };
}

async function confirmPlace(admin: SupabaseClient, id: string): Promise<NotifyResult> {
  const { data, error } = await admin
    .from("place_bookings")
    .select(
      "id, name, email, phone, place_name, category, start_date, end_date, guests, quantity, time_slot, deposit_amount, amount_paid, status, pay_in_person",
    )
    .eq("id", id)
    .maybeSingle();
  if (error || !data) {
    if (error) console.error("in-person confirmation: could not read the reservation", { id, error });
    return NOTHING;
  }
  const b = data as Record<string, unknown>;
  const email = str(b.email);
  const hasEmail = !!email;
  if (b.status !== "confirmed" || b.pay_in_person !== true) return { emailed: false, hasEmail };

  const money = {
    status: "confirmed",
    pay_in_person: true,
    // deposit_amount IS the whole price of a reservation (M210).
    deposit_amount: num(b.deposit_amount),
    amount_paid: num(b.amount_paid),
  };

  const emailed = email
    ? await sendPlaceConfirmedInPerson({
        id,
        ref: refOf(id),
        place_name: str(b.place_name) ?? "your booking",
        category: str(b.category),
        name: str(b.name) ?? "there",
        email,
        phone: str(b.phone),
        start_date: str(b.start_date) ?? "",
        end_date: str(b.end_date) ?? str(b.start_date) ?? "",
        guests: num(b.guests),
        quantity: num(b.quantity),
        time_slot: str(b.time_slot),
        message: null,
        deposit_amount: money.deposit_amount,
        amount_paid: money.amount_paid,
        status: "confirmed",
        pay_in_person: true,
      })
    : false;

  await notifyBookingStatus({
    id,
    email,
    status: "confirmed",
    kind: "place",
    payInPerson: true,
    balanceRupees: balanceRupees("place", money),
  });

  return { emailed, hasEmail };
}

/**
 * The receipt for one recorded payment (`paymentId` is a booking_payments row).
 * Per payment, keyed `payment_receipt:{paymentId}`, so a deposit in cash and
 * the balance at pickup each get their own and neither can arrive twice.
 */
export async function sendInPersonPaymentReceipt(
  admin: SupabaseClient,
  kind: BookingKind,
  id: string,
  paymentId: string,
): Promise<NotifyResult> {
  return sendRecordedPaymentReceipt(admin, kind, id, paymentId);
}
