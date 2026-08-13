import { NextRequest, NextResponse } from "next/server";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import { getPrivileged } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/file-signature";
import { PAYMENT_WINDOW_HOURS } from "@/lib/holds";

// ── The owner's answer to "is this actually available?" (M91) ──────────────
//
// He rents vehicles he does not all own, so confirming on the spot means
// sometimes taking money for a scooter the partner turns out to have lent to
// somebody else. This is the endpoint behind the two buttons that replace that
// gamble.
//
// APPROVE is not a label change: it RESERVES the vehicle. Until now no unpaid
// vehicle booking held anything (lib/holds.ts), which is what stopped strangers
// blocking the fleet with free requests. Once the owner has told a customer
// "yes, it's yours", that scooter has to stop being offered — otherwise
// approving three people for one bike creates the very refunds this exists to
// avoid. The reservation therefore carries a deadline, and the customer is told
// what it is.
//
// NOT AVAILABLE writes the owner's own words onto the booking, because
// "cancelled" with no reason is what makes a customer phone.

export async function POST(req: NextRequest) {
  if (!verifySession(req.cookies.get(COOKIE_NAME)?.value)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { id?: string; decision?: string; note?: string; hours?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const id = (body.id ?? "").toString();
  if (!isUuid(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const decision = body.decision === "unavailable" ? "unavailable" : "approve";

  const supabase = await getPrivileged();

  // Read first: the email and the previous status decide whether to write at
  // all, and after the update the old value is gone.
  const { data: before } = await supabase
    .from("bookings")
    .select("id, name, email, phone, scooter, start_date, end_date, status, deposit_amount, total_amount")
    .eq("id", id)
    .maybeSingle();

  if (!before) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  const row = before as Record<string, unknown>;

  // Approving something already paid for would move a confirmed booking
  // backwards into "awaiting payment" and re-open a window that is closed.
  if (row.status === "confirmed" || row.status === "completed") {
    return NextResponse.json(
      { error: "That booking is already confirmed — availability was settled when it was paid." },
      { status: 409 },
    );
  }

  if (decision === "approve") {
    const hours =
      Number.isFinite(body.hours) && Number(body.hours) > 0
        ? Math.min(168, Math.round(Number(body.hours)))
        : PAYMENT_WINDOW_HOURS;
    const dueBy = new Date(Date.now() + hours * 3600_000).toISOString();

    const { error } = await supabase
      .from("bookings")
      .update({
        status: "approved",
        approved_at: new Date().toISOString(),
        payment_due_by: dueBy,
        // A previous refusal must not survive an approval and keep telling the
        // customer their booking could not be met.
        unavailable_note: null,
      })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Best-effort, after the write. The reservation is real whether or not the
    // mail provider is having a good minute, and a failed email must not tell
    // the owner his approval did not happen.
    try {
      const { sendAvailabilityConfirmed } = await import("@/lib/email");
      await sendAvailabilityConfirmed({
        id,
        email: (row.email as string) ?? null,
        name: (row.name as string) ?? "there",
        scooter: (row.scooter as string) ?? "your vehicle",
        start_date: (row.start_date as string) ?? "",
        end_date: (row.end_date as string) ?? "",
        amountDue: typeof row.deposit_amount === "number" ? row.deposit_amount : null,
        payBy: dueBy,
      });
    } catch (e) {
      console.error("availability approved: email failed", e);
    }

    return NextResponse.json({ ok: true, status: "approved", paymentDueBy: dueBy });
  }

  // ── Not available ────────────────────────────────────────────────────────
  const note = (body.note ?? "").toString().trim().slice(0, 1000);
  const { error } = await supabase
    .from("bookings")
    .update({
      status: "cancelled",
      approved_at: null,
      payment_due_by: null,
      unavailable_note: note || "That vehicle isn't free for those dates. Please get in touch and we'll find you another.",
    })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  try {
    const { sendVehicleUnavailable } = await import("@/lib/email");
    await sendVehicleUnavailable({
      id,
      email: (row.email as string) ?? null,
      name: (row.name as string) ?? "there",
      scooter: (row.scooter as string) ?? "the vehicle",
      start_date: (row.start_date as string) ?? "",
      end_date: (row.end_date as string) ?? "",
      note: note || null,
    });
  } catch (e) {
    console.error("availability declined: email failed", e);
  }

  return NextResponse.json({ ok: true, status: "cancelled" });
}
