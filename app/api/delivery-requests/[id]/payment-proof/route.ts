import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { guard } from "@/lib/rate-limit";
import { detectFileType } from "@/lib/file-signature";

// POST /api/delivery-requests/<id>/payment-proof — the receipt for a transfer.
//
// ── WHY THIS IS NOT THE PHOTO ROUTE WITH A DIFFERENT BUCKET ───────────────
// /api/delivery-requests/photo takes anybody's picture of a parcel, because at
// that moment the request does not exist yet and there is nothing to prove
// ownership against. Its protections are a rate limit, a size cap and a file
// signature.
//
// This is money. The request exists, it has an owner, and the file is evidence
// that a driver will be asked to set off on. So ownership is checked FIRST —
// through delivery_request_view, which is the same (id, email) credential every
// other guest action here uses and which returns null for "not yours" and "no
// such request" alike. Only then does anything get written.
//
// Without that check the bucket would be writable by anyone who could guess a
// uuid, which for a file whose whole purpose is to be believed is the wrong
// property to have.
//
// ── The path shape is a contract ───────────────────────────────────────────
// attach_delivery_payment_proof() re-validates the path against
//   ^delivery-payments/<uuid>/<name>$
// so a forged one cannot be pointed at another bucket's object. The key inside
// the bucket omits the bucket name; the DB stores it prefixed. Both halves are
// built here, in one place, so they cannot drift.

export const dynamic = "force-dynamic";

const MAX_BYTES = 4 * 1024 * 1024;
// PDF belongs here and does not belong on the photo route: a bank in Mauritius
// emails a transfer confirmation as a PDF, and telling somebody to screenshot
// it first would be asking them to make the evidence worse.
const ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
]);
const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/pdf": "pdf",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const limited = guard(req, "delivery-payment-proof", 8, 60_000);
  if (limited) return limited;

  const { id } = await ctx.params;
  if (!UUID.test(id)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  if (!hasServiceRole()) {
    console.error("payment proof: SUPABASE_SERVICE_ROLE_KEY missing");
    return NextResponse.json(
      { error: "Uploads are unavailable right now." },
      { status: 503 },
    );
  }

  try {
    const fd = await req.formData();
    const file = fd.get("file") as File | null;
    const email = (fd.get("email") as string | null)?.trim().toLowerCase() || null;

    if (!file) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "That file is too large — the limit is 4 MB." },
        { status: 400 },
      );
    }

    // ── Ownership, before a single byte is written ────────────────────────
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const admin = await getPrivileged();

    const { data: view, error: viewErr } = user
      ? await supabase.rpc("delivery_request_view", { p_id: id })
      : await admin.rpc("delivery_request_view", { p_id: id, p_email: email });

    if (viewErr) {
      console.error("payment proof: ownership check failed", viewErr);
      return NextResponse.json(
        { error: "Could not send that. Please try again." },
        { status: 500 },
      );
    }
    // Null covers both "no such request" and "not yours" — deliberately
    // indistinguishable, so this cannot be used to probe which ids are real.
    if (!view) return NextResponse.json({ error: "Not found." }, { status: 404 });

    // file.type is the client-declared part header and is trivially spoofed.
    const detected = await detectFileType(file);
    if (!detected || !ALLOWED.has(detected)) {
      return NextResponse.json(
        { error: "Use a JPG, PNG, WebP or PDF." },
        { status: 400 },
      );
    }

    const name = `${Date.now()}-${Math.random().toString(36).slice(2)}.${EXT[detected]}`;
    const key = `${id}/${name}`;
    const { error } = await admin.storage
      .from("delivery-payments")
      .upload(key, file, { contentType: detected, upsert: false });

    if (error) {
      console.error("payment proof upload failed", error);
      return NextResponse.json(
        { error: "Could not send that. Please try again." },
        { status: 500 },
      );
    }

    // Prefixed, because that is what the row stores and what the RPC validates.
    return NextResponse.json({ path: `delivery-payments/${key}` });
  } catch {
    return NextResponse.json(
      { error: "Could not send that. Please try again." },
      { status: 500 },
    );
  }
}
