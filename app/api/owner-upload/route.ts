import { NextRequest, NextResponse } from "next/server";
import { getPrivileged } from "@/lib/supabase/admin";
import { guard } from "@/lib/rate-limit";

// ── Public: upload a single application document to the PRIVATE bucket ────────
// Used by /list-your-scooter for ID / insurance / vehicle photos. Returns only
// the storage path — never a public URL (the bucket is private). Admins view
// these later via short-lived signed URLs.
const MAX_BYTES = 6 * 1024 * 1024; // 6 MB
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"];

export async function POST(req: NextRequest) {
  const limited = guard(req, "owner-upload", 15, 60_000);
  if (limited) return limited;

  try {
    const fd = await req.formData();
    const file = fd.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
    if (!ALLOWED.includes(file.type)) {
      return NextResponse.json({ error: "Please upload an image or PDF." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "File too large (max 6 MB)." }, { status: 400 });
    }

    const ext = (file.name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "bin";
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const supabase = await getPrivileged();
    const { error } = await supabase.storage
      .from("applications")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ path });
  } catch {
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
