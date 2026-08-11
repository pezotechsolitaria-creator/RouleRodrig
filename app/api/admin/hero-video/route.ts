import { NextRequest, NextResponse } from "next/server";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import { getPrivileged } from "@/lib/supabase/admin";

// ── Hero video uploads ──────────────────────────────────────────────────────
//
// This route hands out a short-lived SIGNED UPLOAD URL instead of accepting the
// file itself, and that is the whole point of it existing.
//
// Every other upload route in this app takes the bytes through Vercel, which
// caps a serverless request body at roughly 4.5 MB — which is why they all
// declare MAX_BYTES = 4 MB. A hero clip is 5-15 MB even after compression, so
// posting it here could never work; it would fail at the platform before any
// code ran, with an error that says nothing useful. With a signed URL the file
// travels from the browser straight to Supabase Storage and never passes
// through a function at all.
//
// The session check still happens HERE, on the mint. The token is the
// capability: it is scoped to one path in one bucket and expires, so the
// browser can upload exactly one file and nothing else.
const MAX_BYTES = 64 * 1024 * 1024; // must match the bucket's own cap (M60)
const BUCKET = "hero-video";

// Client-declared, so treated as a hint rather than proof — the BUCKET enforces
// the real MIME whitelist server-side (M60), which is what actually stops a
// disguised file. This list exists to fail early with a readable message.
const ALLOWED: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

function authed(req: NextRequest) {
  return verifySession(req.cookies.get(COOKIE_NAME)?.value);
}

export async function POST(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { contentType?: string; size?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const contentType = (body.contentType ?? "").toLowerCase();
  const ext = ALLOWED[contentType];
  if (!ext) {
    return NextResponse.json(
      { error: "Video must be an MP4, WebM or MOV file." },
      { status: 400 },
    );
  }
  const size = Number(body.size ?? 0);
  if (!Number.isFinite(size) || size <= 0) {
    return NextResponse.json({ error: "Invalid file size." }, { status: 400 });
  }
  if (size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Video must be 64 MB or smaller. Trim it or export at a lower bitrate." },
      { status: 413 },
    );
  }

  // The path is generated here, never taken from the client: a caller-supplied
  // name is how you end up with traversal, collisions, or a token scoped to
  // somebody else's object.
  const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const supabase = await getPrivileged();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    console.error("hero-video: could not create a signed upload URL", error);
    return NextResponse.json({ error: "Could not start the upload." }, { status: 500 });
  }

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({
    path,
    token: data.token,
    signedUrl: data.signedUrl,
    // Returned now so the admin can store the final URL without a second call
    // once the upload finishes.
    publicUrl: pub.publicUrl,
  });
}

// Removes a clip from storage. Called when the owner deletes a video, so the
// bucket does not accumulate orphans nobody can see or reach.
export async function DELETE(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const path = req.nextUrl.searchParams.get("path");
  // Anchored, and no slashes or dots-in-sequence: this value ends up in a
  // storage remove() call, so it must not be able to climb out of the bucket
  // root or name an object the admin never uploaded.
  if (!path || !/^[0-9]{10,}-[a-z0-9]+\.(mp4|webm|mov)$/i.test(path)) {
    return NextResponse.json({ error: "Invalid path." }, { status: 400 });
  }

  const supabase = await getPrivileged();
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) {
    // Best-effort: the content row has already dropped the reference by the
    // time this runs, so a storage failure must not block the owner's edit.
    console.error("hero-video: delete failed", error);
    return NextResponse.json({ error: "Could not delete the file." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
