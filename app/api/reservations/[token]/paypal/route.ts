import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardShared } from "@/lib/rate-limit";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import {
  captureOrder,
  createEurOrder,
  murToEur,
  paypalConfigured,
  refundCapture,
  resolvePaidAmountMur,
  withPayPalFee,
} from "@/lib/paypal";
import { hashToken, isTokenShaped } from "@/lib/reservations/reference";
import { adminAction } from "@/lib/reservations/server";

// POST /api/reservations/[token]/paypal — pay a CONFIRMED reservation by
// PayPal (a card works without a PayPal account).
//
//   { step: "create" }            → our server prices the order: what is
//                                   still due online, plus PayPal's fee, in EUR.
//   { step: "capture", orderID }  → our server captures, checks the order is
//                                   ours and the amount is right, then records
//                                   the payment (mark_paid, actor "PayPal").
//
// The ONE path where the engine marks money paid without the owner: a
// verified capture. If the hold lapsed while the guest was in PayPal, the
// capture is refunded at once rather than leaving money with no booking.

export const dynamic = "force-dynamic";

const schema = z.discriminatedUnion("step", [
  z.object({ step: z.literal("create") }),
  z.object({ step: z.literal("capture"), orderID: z.string().min(5).max(64) }),
]);

type Row = {
  id: string;
  booking_reference: string;
  reservation_status: string;
  payment_status: string;
  deposit_due_mur: number | null;
  amount_mur: number | null;
  amount_paid_mur: number;
  payment_policy_snapshot: { allowed_methods?: string[] };
  product_snapshot: { title?: string };
};

async function load(token: string): Promise<Row | null> {
  const admin = await getPrivileged();
  const { data } = await admin
    .from("reservations")
    .select("id, booking_reference, reservation_status, payment_status, deposit_due_mur, amount_mur, amount_paid_mur, payment_policy_snapshot, product_snapshot")
    .eq("access_token_hash", hashToken(token))
    .maybeSingle();
  return (data as Row | null) ?? null;
}

/** Rupees still due online. */
function remaining(r: Row): number {
  return Math.max(0, (r.deposit_due_mur ?? r.amount_mur ?? 0) - r.amount_paid_mur);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const limited = await guardShared(req, "reservation-paypal", 10, 60_000);
  if (limited) return limited;
  if (!paypalConfigured() || !hasServiceRole()) {
    return NextResponse.json({ error: "PayPal is unavailable right now." }, { status: 503 });
  }
  const { token } = await params;
  if (!isTokenShaped(token)) return NextResponse.json({ error: "not_found" }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const r = await load(token);
  if (!r) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const payable = r.reservation_status === "confirmed" && ["payment_pending", "partially_paid", "failed"].includes(r.payment_status);
  const allowed = (r.payment_policy_snapshot?.allowed_methods ?? []).includes("paypal");
  const due = remaining(r);

  if (parsed.data.step === "create") {
    if (!payable || !allowed || due <= 0) return NextResponse.json({ error: "This reservation can't be paid by PayPal now." }, { status: 409 });
    const eur = await murToEur(withPayPalFee(due).total);
    const order = await createEurOrder({
      // Unique per amount, so PayPal's own idempotency never replays an old total.
      referenceId: `rsv-${r.id}-${due}`,
      customId: r.booking_reference,
      description: `${r.product_snapshot?.title ?? "Reservation"} · ${r.booking_reference}`,
      eurValue: eur,
    });
    return NextResponse.json({ orderID: order.id });
  }

  // ── capture ──
  const cap = await captureOrder(parsed.data.orderID).catch((e) => {
    console.error("reservation paypal capture", e);
    return null;
  });
  if (!cap || cap.status !== "COMPLETED" || !cap.captureId) {
    return NextResponse.json({ error: "The payment didn't go through. You have not been charged." }, { status: 402 });
  }
  if (!cap.referenceId?.startsWith(`rsv-${r.id}-`) || cap.currency !== "EUR") {
    console.error("reservation paypal: order does not belong to this reservation", { ref: r.booking_reference, got: cap.referenceId });
    await refundCapture(cap.captureId, `Refund: order did not match ${r.booking_reference}`).catch(() => {});
    return NextResponse.json({ error: "That payment didn't match this reservation and was refunded." }, { status: 409 });
  }
  const eurPerMurNow = Number(await murToEur(1000)) / 1000;
  const paidMur = resolvePaidAmountMur(Number(cap.amount), { depositMur: due }, (mur) => mur * eurPerMurNow);
  const res = paidMur
    ? await adminAction(r.id, "mark_paid", { method: "paypal", amount_mur: paidMur, external_ref: cap.captureId, actor: "system", actor_label: "PayPal" })
    : { ok: false, error: "amount_mismatch" };
  if (!res.ok) {
    // The hold lapsed, or the amount was wrong: give the money back now.
    console.error("reservation paypal: could not record, refunding", { ref: r.booking_reference, res });
    await refundCapture(cap.captureId, `Refund: ${r.booking_reference} could not be confirmed`).catch((e) => console.error("refund failed", e));
    return NextResponse.json({ error: "This hold had ended, so the payment was refunded straight away." }, { status: 409 });
  }
  return NextResponse.json({ ok: true, payment: res.payment });
}
