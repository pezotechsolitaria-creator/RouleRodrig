import { NextRequest, NextResponse } from "next/server";
import { getPrivileged } from "@/lib/supabase/admin";
import { guard } from "@/lib/rate-limit";
import { detectFileType } from "@/lib/file-signature";

// ── Public: upload a single application document to the PRIVATE bucket ────────
// Used by /list-your-scooter for ID / insurance / vehicle photos. Returns only
// the storage path — never a public URL (the bucket is private). Admins view
// these later via short-lived signed URLs.
//
// MAX_BYTES is kept under Vercel's ~4.5MB default serverless function body
// limit (with headroom for multipart overhead) — the previous 6MB limit here
// would have been silently rejected by the platform before this code ran.
const MAX_BYTES = 4 * 1024 * 1024; // 4 MB
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"]);
const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "application/pdf": "pdf",
};

export async function POST(req: NextRequest) {
  const limited = guard(req, "owner-upload", 15, 60_000);
  if (limited) return limited;

  try {
    const fd = await req.formData();
    const file = fd.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "File too large (max 4 MB)." }, { status: 400 });
    }

    // file.type is the client-declared Content-Type of the multipart part —
    // trivially spoofed. Validate and serve based on the real file signature.
    const detectedType = await detectFileType(file);
    if (!detectedType || !ALLOWED.has(detectedType)) {
      return NextResponse.json({ error: "Please upload an image or PDF." }, { status: 400 });
    }

    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${EXT[detectedType]}`;

    const supabase = await getPrivileged();
    const { error } = await supabase.storage
      .from("applications")
      .upload(path, file, { contentType: detectedType, upsert: false });
    if (error) {
      console.error("owner-upload failed", error);
      return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 500 });
    }

    return NextResponse.json({ path });
  } catch {
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
