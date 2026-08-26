import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { guard } from "@/lib/rate-limit";
import { detectFileType } from "@/lib/file-signature";

// POST /api/delivery-requests/<id>/id-document — the customer's ID, for a job
// they are settling in cash.
//
// ── THIS IS THE MOST SENSITIVE THING THIS CODEBASE HANDLES ────────────────
// It is a national identity document, and under the Mauritius Data Protection
// Act 2017 it is personal data of the kind that carries real obligations on the
// controller — a lawful basis, a retention policy, a breach procedure. The
// owner asked for it twice, having read the argument against; that is their
// call to make and it is made. What is left is to handle it properly.
//
// Every guard the payment-proof route has, and four more:
//
//   IMAGES ONLY. No PDF. A PDF is a container that can carry anything, and an
//   identity card is a photograph. Narrowing the accepted shape narrows what
//   can be smuggled through the field.
//
//   ITS OWN BUCKET, private, separate from the payment receipts. Different
//   sensitivity, different retention, and a bucket is the unit both are set on.
//
//   READABLE ONLY WHILE THE JOB IS LIVE. driver_identity_document_path()
//   returns null once the delivery is delivered, cancelled or failed — the
//   document exists to be checked at the door, and after the door there is no
//   longer anyone with a reason to look.
//
//   IT EXPIRES. delivery_settings.id_document_retention_days (30 by default)
//   and a nightly purge that deletes the object and nulls the path. Keeping a
//   scan of somebody's ID for ever is the failure mode this feature has, and
//   the only real mitigation is for it not to be there.
//
// Ownership is proved BEFORE a byte is written, through delivery_request_view,
// the same (id, email) credential every other guest action here uses.

export const dynamic = "force-dynamic";

const MAX_BYTES = 4 * 1024 * 1024;
// No PDF, and never SVG — a script-execution shape wearing an image extension.
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/heic"]);
const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const limited = guard(req, "delivery-id-document", 6, 60_000);
  if (limited) return limited;

  const { id } = await ctx.params;
  if (!UUID.test(id)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  if (!hasServiceRole()) {
    console.error("id document: SUPABASE_SERVICE_ROLE_KEY missing");
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
        { error: "That photo is too large — the limit is 4 MB." },
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
      console.error("id document: ownership check failed", viewErr);
      return NextResponse.json(
        { error: "Could not send that. Please try again." },
        { status: 500 },
      );
    }
    // Null covers "no such request" and "not yours" alike, so this cannot be
    // used to probe which ids are real.
    if (!view) return NextResponse.json({ error: "Not found." }, { status: 404 });

    const detected = await detectFileType(file);
    if (!detected || !ALLOWED.has(detected)) {
      return NextResponse.json(
        { error: "Send a photo of your ID — a JPG, PNG or WebP." },
        { status: 400 },
      );
    }

    const name = `${Date.now()}-${Math.random().toString(36).slice(2)}.${EXT[detected]}`;
    const key = `${id}/${name}`;
    const { error } = await admin.storage
      .from("delivery-identity")
      .upload(key, file, { contentType: detected, upsert: false });

    if (error) {
      console.error("id document upload failed", error);
      return NextResponse.json(
        { error: "Could not send that. Please try again." },
        { status: 500 },
      );
    }

    // Prefixed, because that is what the row stores and what the RPC validates.
    return NextResponse.json({ path: `delivery-identity/${key}` });
  } catch {
    return NextResponse.json(
      { error: "Could not send that. Please try again." },
      { status: 500 },
    );
  }
}
