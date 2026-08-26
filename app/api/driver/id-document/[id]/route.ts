import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { guard } from "@/lib/rate-limit";
import { isUuid } from "@/lib/file-signature";

// GET /api/driver/id-document/<deliveryId> — the customer's ID, for the driver
// standing at their door on a cash job.
//
// ── WHO, AND FOR HOW LONG ─────────────────────────────────────────────────
// driver_identity_document_path() (M158) is deliberately narrower than its
// payment-proof equivalent. It returns null unless ALL of these hold:
//
//   the caller resolves to a driver through current_driver(),
//   that driver is the one CURRENTLY holding the delivery,
//   the delivery has not yet been delivered, cancelled or failed,
//   the document has not been purged.
//
// The third clause is the one that matters. A payment receipt stays useful
// afterwards — it is evidence about money. An identity document exists for a
// single moment: checking that the person at the door is the person who
// ordered. After that moment nobody has a reason to look at it, so nobody can.
//
// The URL is signed for TWO minutes rather than the five a receipt gets. It is
// meant to be opened where the customer is standing, not saved.

const TTL_SECONDS = 120;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = guard(req, "driver-id-document", 20, 60_000);
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
  const { data: path, error } = await supabase.rpc("driver_identity_document_path", {
    p_delivery_id: id,
  });

  if (error) {
    // RR080 is "you are not a driver" — 404 rather than 403, so this cannot be
    // used to enumerate which delivery ids are real.
    if (error.code === "RR080") {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    console.error("driver_identity_document_path failed", error);
    return NextResponse.json({ error: "Could not open it." }, { status: 500 });
  }
  if (!path) {
    return NextResponse.json(
      { error: "No ID is available for this delivery." },
      { status: 404 },
    );
  }

  if (!hasServiceRole()) {
    console.error("driver id document: SUPABASE_SERVICE_ROLE_KEY missing");
    return NextResponse.json({ error: "Unavailable right now." }, { status: 503 });
  }

  const prefix = "delivery-identity/";
  if (!String(path).startsWith(prefix)) {
    console.error("driver id document: unexpected path shape");
    return NextResponse.json({ error: "Could not open it." }, { status: 500 });
  }

  const admin = await getPrivileged();
  const { data: signed, error: signErr } = await admin.storage
    .from("delivery-identity")
    .createSignedUrl(String(path).slice(prefix.length), TTL_SECONDS);

  if (signErr || !signed) {
    console.error("sign id document failed", signErr);
    return NextResponse.json({ error: "Could not open it." }, { status: 500 });
  }

  return NextResponse.json({ url: signed.signedUrl, expiresIn: TTL_SECONDS });
}
