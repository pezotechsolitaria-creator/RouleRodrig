import { NextRequest, NextResponse } from "next/server";
import { getPrivileged } from "@/lib/supabase/admin";
import { guard } from "@/lib/rate-limit";

// Guest booking lookup — no account. A visitor enters the reference from their
// confirmation (RR-XXXXXX = the first 6 hex of the booking id) plus the email
// they booked with; we match both and return a safe summary + status.
const refOf = (id: string) => "RR-" + id.replace(/-/g, "").slice(0, 6).toUpperCase();
const norm = (ref: string) => ref.trim().replace(/^rr-/i, "").replace(/[^a-z0-9]/gi, "").toLowerCase();

export async function POST(req: NextRequest) {
  const limited = guard(req, "booking-lookup", 10, 60_000);
  if (limited) return limited;

  let body: { ref?: string; email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const ref = norm((body.ref ?? "").toString());
  const email = (body.email ?? "").toString().trim();
  if (ref.length < 4 || !email) {
    return NextResponse.json({ error: "Enter your booking reference and the email you used." }, { status: 400 });
  }
  const matches = (id: string) => id.replace(/-/g, "").toLowerCase().startsWith(ref);

  const supabase = await getPrivileged();

  const { data: vrows } = await supabase
    .from("bookings")
    .select("id, scooter, start_date, end_date, days, total_amount, deposit_amount, deposit_paid_at, status")
    .ilike("email", email);
  const v = (vrows ?? []).find((b) => matches(b.id || ""));
  if (v) {
    return NextResponse.json({
      ok: true,
      booking: {
        kind: "vehicle",
        id: v.id,
        ref: refOf(v.id),
        item: v.scooter,
        start: v.start_date,
        end: v.end_date,
        days: v.days,
        total: v.total_amount,
        deposit: v.deposit_amount,
        depositPaid: !!v.deposit_paid_at,
        status: v.status,
      },
    });
  }

  const { data: prows } = await supabase
    .from("place_bookings")
    .select("id, place_name, start_date, end_date, deposit_amount, deposit_paid_at, status")
    .ilike("email", email);
  const p = (prows ?? []).find((b) => matches(b.id || ""));
  if (p) {
    return NextResponse.json({
      ok: true,
      booking: {
        kind: "place",
        id: p.id,
        ref: refOf(p.id),
        item: p.place_name,
        start: p.start_date,
        end: p.end_date,
        total: null,
        deposit: p.deposit_amount,
        depositPaid: !!p.deposit_paid_at,
        status: p.status,
      },
    });
  }

  return NextResponse.json({ error: "No booking found for that reference and email." }, { status: 404 });
}
