import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { guard } from "@/lib/rate-limit";
import { detectFileType, isUuid } from "@/lib/file-signature";

// Under Vercel's ~4.5MB serverless body limit, with headroom for multipart
// overhead — same reasoning as the merchant media route.
const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf",
};

const NOT_FOUND_CODE = "RR003";
const ILLEGAL_STATE_CODE = "RR004";
const VALIDATION_CODE = "RR005";

// Uploads proof of a bank transfer and reports the payment.
//
// Runs as the SIGNED-IN USER, not the service role, so the private
// order-receipts bucket's storage RLS (which re-derives ownership from the
// orders table) is the real gate rather than application code. The object path
// is always `<order_id>/…` — the customer never supplies it, so it cannot be
// pointed at another order, and submit_payment_receipt() re-checks the prefix
// anyway.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = guard(req, "order-receipt", 10, 60_000);
  if (limited) return limited;

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const fd = await req.formData();
  const file = fd.get("file") as File | null;

  let receiptPath: string | null = null;
  if (file) {
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Receipt too large (max 4 MB)." }, { status: 400 });
    }
    // Never trust the client-declared type — read the real file signature, and
    // use THAT as the stored contentType too, so a spoofed part can't cause the
    // object to be served back under an attacker-chosen type.
    const detected = await detectFileType(file);
    if (!detected || !ALLOWED.has(detected)) {
      return NextResponse.json({ error: "Upload a JPG, PNG, WebP or PDF." }, { status: 400 });
    }

    const path = `${id}/receipt-${Date.now()}.${EXT[detected]}`;
    const { error: uploadError } = await supabase.storage
      .from("order-receipts")
      .upload(path, file, { contentType: detected, upsert: false });

    if (uploadError) {
      console.error("receipt upload failed", uploadError);
      return NextResponse.json({ error: "Could not upload the receipt." }, { status: 400 });
    }
    receiptPath = path;
  }

  const { data, error } = await supabase
    .rpc("submit_payment_receipt", { p_order_id: id, p_receipt_path: receiptPath })
    .single();

  if (error) {
    if (error.code === NOT_FOUND_CODE) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error.code === ILLEGAL_STATE_CODE) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error.code === VALIDATION_CODE) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("submit_payment_receipt failed", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }

  return NextResponse.json(data);
}
