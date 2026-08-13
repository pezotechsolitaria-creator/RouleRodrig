import { NextRequest, NextResponse } from "next/server";
import { getPrivileged } from "@/lib/supabase/admin";
import { guard } from "@/lib/rate-limit";

// Guest booking lookup — no account. A visitor enters the reference from their
// confirmation (RR-XXXXXX = the first 6 hex of the booking id) plus the email
// they booked with; we match both and return a safe summary + status.
//
// SECURITY (M11): the matching happens inside the `lookup_booking` RPC, and the
// caller's email is compared with exact case-insensitive equality — never with
// ILIKE. The previous version passed the email straight into .ilike(), where
// '%' is a wildcard, so email='%' matched every row and the sole authenticator
// on this anonymous endpoint could be skipped entirely with a guessed
// reference. Escaping '%' alone would have been incomplete: PostgREST also
// rewrites '*' to '%' for like/ilike. Keep caller input away from pattern
// operators rather than trying to sanitise it into them.
const refOf = (id: string) => "RR-" + id.replace(/-/g, "").slice(0, 6).toUpperCase();
// Hex only — a reference is UUID hex, so this drops '%', '_', '*' and backslash
// by construction. The RPC repeats the same reduction; neither layer trusts the
// other.
const norm = (ref: string) => ref.trim().replace(/^rr-/i, "").replace(/[^0-9a-f]/gi, "").toLowerCase();

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
  // The reference is always exactly 6 hex characters. Requiring all six rather
  // than a 4-character prefix shrinks the guessable space from 65,536 to
  // 16,777,216, and costs nothing: the customer copies the whole code.
  if (ref.length < 6 || !email) {
    return NextResponse.json(
      { error: "Enter your full booking reference (RR-XXXXXX) and the email you used." },
      { status: 400 },
    );
  }

  const supabase = await getPrivileged();

  const { data, error } = await supabase.rpc("lookup_booking", { p_ref: ref, p_email: email });

  if (error) {
    // Don't report a database fault as "no booking found" — that would tell a
    // customer their real booking does not exist.
    console.error("booking lookup failed", error);
    return NextResponse.json({ error: "Could not check that booking right now. Please try again." }, { status: 503 });
  }

  const b = data as {
    kind: "vehicle" | "place";
    id: string;
    item: string | null;
    start: string | null;
    end: string | null;
    days: number | null;
    total: number | null;
    deposit: number | null;
    depositPaid: boolean;
    status: string | null;
    // M91 — vehicles only. The customer's page needs the deadline to show it
    // beside the pay button, and the note to explain a declined booking.
    paymentDueBy?: string | null;
    unavailableNote?: string | null;
  } | null;

  if (!b) {
    return NextResponse.json({ error: "No booking found for that reference and email." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, booking: { ...b, ref: refOf(b.id) } });
}
