import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { guard } from "@/lib/rate-limit";
import { isUuid } from "@/lib/file-signature";

// GET /api/driver/payment-proof/<deliveryId> — a short-lived link to the
// customer's transfer receipt, for the driver who is about to set off on it.
//
// ── WHY THIS EXISTS AT ALL ─────────────────────────────────────────────────
// The gate in advance_delivery() only asks whether a receipt is PRESENT. That
// is enough to protect the customer from a driver leaving before they have
// paid, and it is not enough for the driver, who is being asked to trust a
// boolean about somebody else's money. Being able to look is the difference
// between a rule and a reassurance.
//
// ── WHO MAY LOOK ───────────────────────────────────────────────────────────
// Exactly one person: the driver currently holding the job.
// driver_payment_proof_path() runs as the signed-in user, resolves them through
// current_driver(), and returns null for a delivery that is not theirs — so a
// driver who was reassigned off a job keeps no claim on the customer's bank
// receipt. The bucket itself is private and has no client-readable policy; the
// service role signs, and only after that check has passed.
//
// The URL expires in five minutes, so nothing here becomes a durable link that
// can be forwarded.

const TTL_SECONDS = 300;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = guard(req, "driver-payment-proof", 30, 60_000);
  if (limited) return limited;

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  // As the USER, so current_driver() resolves to them and the ownership check
  // is theirs to pass rather than ours to skip.
  const { data: path, error } = await supabase.rpc("driver_payment_proof_path", {
    p_delivery_id: id,
  });

  if (error) {
    // RR080 is "you are not a driver" — a 404 rather than a 403, so this
    // endpoint cannot be used to enumerate which delivery ids are real.
    if (error.code === "RR080") {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    console.error("driver_payment_proof_path failed", error);
    return NextResponse.json({ error: "Could not open the receipt." }, { status: 500 });
  }
  if (!path) {
    return NextResponse.json({ error: "No receipt has been sent yet." }, { status: 404 });
  }

  if (!hasServiceRole()) {
    console.error("driver payment proof: SUPABASE_SERVICE_ROLE_KEY missing");
    return NextResponse.json({ error: "Unavailable right now." }, { status: 503 });
  }

  // The row stores the path with its bucket prefix (see M155). Signing takes
  // the key WITHOUT it.
  const prefix = "delivery-payments/";
  if (!String(path).startsWith(prefix)) {
    console.error("driver payment proof: unexpected path shape");
    return NextResponse.json({ error: "Could not open the receipt." }, { status: 500 });
  }
  const key = String(path).slice(prefix.length);

  const admin = await getPrivileged();
  const { data: signed, error: signErr } = await admin.storage
    .from("delivery-payments")
    .createSignedUrl(key, TTL_SECONDS);

  if (signErr || !signed) {
    console.error("sign payment proof failed", signErr);
    return NextResponse.json({ error: "Could not open the receipt." }, { status: 500 });
  }

  return NextResponse.json({ url: signed.signedUrl, expiresIn: TTL_SECONDS });
}
