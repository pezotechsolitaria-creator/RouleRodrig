import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { guard } from "@/lib/rate-limit";

// Uploads a shop logo or product photo into the public `merchant-media`
// bucket and attaches it to the right row. Runs as the signed-in user (not
// service role) so the storage RLS policies (is_store_staff on the path's
// store_id segment — see 20260730000003_producer_and_storage.sql) are the
// real gate, not application code.
const MAX_BYTES = 6 * 1024 * 1024; // 6 MB
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
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
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json({ error: "Please upload a JPG, PNG or WebP image." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Image too large (max 6 MB)." }, { status: 400 });
  }
  if (!storeId) return NextResponse.json({ error: "Missing store." }, { status: 400 });
  if (target !== "store_logo" && target !== "product_photo") {
    return NextResponse.json({ error: "Invalid upload target." }, { status: 400 });
  }
  if (target === "product_photo" && !productId) {
    return NextResponse.json({ error: "Missing product." }, { status: 400 });
  }

  const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "jpg";
  const folder = target === "store_logo" ? "logo" : "products";
  const path = `${storeId}/${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("merchant-media")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const {
    data: { publicUrl },
  } = supabase.storage.from("merchant-media").getPublicUrl(path);

  if (target === "store_logo") {
    const { error } = await supabase.from("stores").update({ logo_url: publicUrl }).eq("id", storeId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await supabase
      .from("product_media")
      .insert({ product_id: productId, url: publicUrl, kind: "image", position: 0 });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ url: publicUrl });
}
