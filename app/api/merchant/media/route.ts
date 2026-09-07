import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { guard } from "@/lib/rate-limit";
import { detectFileType, isUuid } from "@/lib/file-signature";
import { optimiseForWeb } from "@/lib/images/optimise";

// Uploads a shop logo or product photo into the public `merchant-media`
// bucket and attaches it to the right row. Runs as the signed-in user (not
// service role) so the storage RLS policies (is_store_staff on the path's
// store_id segment — see 20260730000003_producer_and_storage.sql) are the
// real gate, not application code.
//
// MAX_BYTES is kept under Vercel's ~4.5MB default serverless function body
// limit (with headroom for multipart boundary/header overhead) — a "6MB"
// limit was previously configured here, which the platform would silently
// reject before this code ever ran for files between ~4.5–6MB.
const MAX_BYTES = 4 * 1024 * 1024; // 4 MB
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
type Target = "store_logo" | "product_photo";

export async function POST(req: NextRequest) {
  const limited = guard(req, "merchant-media", 20, 60_000);
  if (limited) return limited;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const fd = await req.formData();
  const file = fd.get("file") as File | null;
  const storeId = String(fd.get("storeId") ?? "");
  const target = String(fd.get("target") ?? "") as Target;
  const productId = fd.get("productId") ? String(fd.get("productId")) : null;

  if (!file) return NextResponse.json({ error: "No file provided." }, { status: 400 });
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Image too large (max 4 MB)." }, { status: 400 });
  }
  if (!storeId || !isUuid(storeId)) return NextResponse.json({ error: "Missing or invalid store." }, { status: 400 });
  if (target !== "store_logo" && target !== "product_photo") {
    return NextResponse.json({ error: "Invalid upload target." }, { status: 400 });
  }
  if (target === "product_photo" && (!productId || !isUuid(productId))) {
    return NextResponse.json({ error: "Missing or invalid product." }, { status: 400 });
  }

  // Never trust the client-declared file.type — it's just what the multipart
  // part claimed and is trivially spoofed. Read the actual file signature and
  // validate/serve based on that instead.
  const detectedType = await detectFileType(file);
  if (!detectedType || !ALLOWED.has(detectedType)) {
    return NextResponse.json({ error: "Please upload a JPG, PNG or WebP image." }, { status: 400 });
  }

  // Same treatment as the owner's own uploads: a merchant photographing their
  // shop from a phone should not be able to put a 4 MB file on a customer's
  // product page.
  let image;
  try {
    image = await optimiseForWeb(await file.arrayBuffer(), detectedType);
  } catch {
    return NextResponse.json(
      { error: "That image could not be read. Try saving it as a JPG first." },
      { status: 400 },
    );
  }

  const path = `${storeId}/${target === "store_logo" ? "logo" : "products"}/${Date.now()}-${Math.random().toString(36).slice(2)}.${image.ext}`;

  const { error: uploadError } = await supabase.storage
    .from("merchant-media")
    .upload(path, image.body, {
      contentType: image.contentType,
      // A YEAR, not the one-hour default this omitted. These files are
      // immutable — the name carries a timestamp and nothing overwrites one —
      // so every re-download after the first hour was pure waste.
      cacheControl: "31536000",
      upsert: false,
    });
  if (uploadError) {
    console.error("merchant-media upload failed", uploadError);
    return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 500 });
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("merchant-media").getPublicUrl(path);

  if (target === "store_logo") {
    const { error } = await supabase.from("stores").update({ logo_url: publicUrl }).eq("id", storeId);
    if (error) {
      console.error("merchant-media store_logo attach failed", error);
      return NextResponse.json({ error: "Uploaded, but failed to save it to your shop." }, { status: 500 });
    }
  } else {
    // add_product_media() re-verifies productId belongs to storeId (closing
    // the M2-flagged gap: "worth an explicit ownership check once
    // multi-store support ships") AND assigns the gallery position under a
    // row lock — a plain "count existing rows, then insert" here raced under
    // concurrent uploads (verified: two photos uploaded in parallel both
    // landed on position 0, no error, just silently wrong ordering).
    const { error } = await supabase
      .rpc("add_product_media", { p_product_id: productId, p_store_id: storeId, p_url: publicUrl })
      .single();
    if (error) {
      if (error.code === "RR002") return NextResponse.json({ error: error.message }, { status: 400 });
      console.error("merchant-media product_photo attach failed", error);
      return NextResponse.json({ error: "Uploaded, but failed to save it to your product." }, { status: 500 });
    }
  }

  return NextResponse.json({ url: publicUrl });
}
