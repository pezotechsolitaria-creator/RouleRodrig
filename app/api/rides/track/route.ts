import { NextRequest, NextResponse } from "next/server";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { guard } from "@/lib/rate-limit";

// ── "WHERE IS MY TAXI?" ─────────────────────────────────────────────────────
//
// So the customer never has to phone the office to ask — which is the other half
// of taking the owner out of the loop.
//
// TWO FACTORS, deliberately. A reference is six hex characters; knowing one must
// not be enough to read a stranger's name, phone number and pickup address. The
// same rule the vehicle and order lookups follow, and the same reason M11 exists:
// the reference plus the phone the booking was made with.
//
// Rate limited hard, because this is the brute-force surface for the reference
// space. One message for "wrong reference" and "wrong phone" together, so it
// cannot be used to confirm that a reference exists.

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const limited = guard(req, "ride-track", 10, 60_000);
  if (limited) return limited;
  if (!hasServiceRole()) {
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  let body: { ref?: string; phone?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const ref = (body.ref ?? "").toString().trim();
  const phone = (body.phone ?? "").toString().trim();
  if (!ref || !phone) {
    return NextResponse.json(
      { ok: false, error: "Enter your reference and the phone number you booked with." },
      { status: 400 },
    );
  }

  const admin = await getPrivileged();
  const { data, error } = await admin.rpc("lookup_ride", { p_ref: ref, p_phone: phone });
  if (error) {
    // A database fault must not be reported as "not found" — that would tell a
    // real customer their taxi has vanished.
    console.error("lookup_ride failed", error);
    return NextResponse.json({ ok: false, error: "Something went wrong. Please try again." }, { status: 500 });
  }

  const found = (data as { ok?: boolean } | null)?.ok === true;
  if (!found) {
    return NextResponse.json({
      ok: false,
      error: "We couldn't find that. Check the reference and the phone number you used.",
    });
  }
  return NextResponse.json(data);
}
