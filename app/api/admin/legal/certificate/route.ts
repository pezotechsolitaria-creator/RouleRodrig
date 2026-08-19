import { NextRequest, NextResponse } from "next/server";
import { getContentWithStatus, saveContent } from "@/lib/content";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { detectFileType } from "@/lib/file-signature";

// ── THE BRN CERTIFICATE (P1 #3) ─────────────────────────────────────────────
//
// A photo of the certificate of incorporation, for the owner's own reference
// and to prove identity when a bank or a supplier asks.
//
// It does NOT go through /api/admin/upload. That route writes to the `uploads`
// bucket, which is PUBLIC — a permanent, guessable, unauthenticated URL. A
// registration certificate carries signatures, a company stamp and the
// registry's seal; publishing one is not a thing to do by accident, and using
// the general-purpose upload route would do it silently.
//
// So this mirrors /api/admin/booking-receipt instead: a private bucket with no
// storage policies (service-role only), and reads handed out as short-lived
// signed URLs. The stored value is a PATH, never a URL.

const BUCKET = "legal-documents";
const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"]);
const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/pdf": "pdf",
};

// Five minutes: long enough to open on a phone, short enough that a URL pasted
// into a chat has stopped working by the time anyone else clicks it.
const TTL_SECONDS = 300;

function isAuthed(req: NextRequest) {
  return verifySession(req.cookies.get(COOKIE_NAME)?.value);
}

function serviceRoleMissing() {
  return NextResponse.json(
    { error: "Admin backend is not configured on this environment (SUPABASE_SERVICE_ROLE_KEY is unset)." },
    { status: 503 },
  );
}

/** Mint a signed URL for the stored certificate. Never returns a public link. */
export async function GET(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasServiceRole()) return serviceRoleMissing();

  const { content } = await getContentWithStatus();
  const path = content.legal?.certificatePath;
  if (!path) return NextResponse.json({ error: "No certificate has been uploaded." }, { status: 404 });

  const supabase = await getPrivileged();
  const { data: signed, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, TTL_SECONDS);
  if (error || !signed?.signedUrl) {
    console.error("sign legal certificate failed", error);
    return NextResponse.json({ error: "Could not open that document." }, { status: 500 });
  }
  return NextResponse.json({ url: signed.signedUrl, expiresIn: TTL_SECONDS });
}

export async function POST(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasServiceRole()) return serviceRoleMissing();

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "That file is too large (max 4 MB)." }, { status: 400 });
  }

  // Never trust the client-declared type — read the real signature and store
  // THAT as the contentType, so a spoofed part cannot make the object come back
  // under a type the uploader chose.
  const detected = await detectFileType(file);
  if (!detected || !ALLOWED.has(detected)) {
    return NextResponse.json({ error: "Upload a JPG, PNG, WebP, HEIC or PDF." }, { status: 400 });
  }

  const { content, loaded } = await getContentWithStatus();
  if (!loaded) {
    return NextResponse.json(
      { error: "Could not read the current content, so the upload was refused. Please retry in a moment." },
      { status: 503 },
    );
  }

  const supabase = await getPrivileged();
  const path = `brn-certificate/${Date.now()}.${EXT[detected]}`;
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: detected, upsert: false });
  if (uploadError) {
    console.error("legal certificate upload failed", uploadError);
    return NextResponse.json({ error: "Could not upload that file." }, { status: 400 });
  }

  const previous = content.legal?.certificatePath;
  await saveContent({ ...content, legal: { ...(content.legal ?? {}), certificatePath: path } });

  // Only after the new path is safely stored. Doing it earlier would leave the
  // owner with no certificate at all if the save failed.
  if (previous && previous !== path) {
    const { error: removeError } = await supabase.storage.from(BUCKET).remove([previous]);
    if (removeError) console.error("could not remove superseded certificate", removeError);
  }

  try {
    const { audit } = await import("@/lib/admin/audit");
    await audit(supabase, {
      action: "legal.certificate.uploaded",
      entityType: "site_content",
      entityId: "main",
      // The path only. The document itself stays in the private bucket.
      diff: { replaced: !!previous },
    });
  } catch (err) {
    console.error("legal certificate audit failed", err);
  }

  return NextResponse.json({ ok: true, certificatePath: path });
}

export async function DELETE(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasServiceRole()) return serviceRoleMissing();

  const { content, loaded } = await getContentWithStatus();
  if (!loaded) {
    return NextResponse.json({ error: "Could not read the current content. Please retry." }, { status: 503 });
  }
  const path = content.legal?.certificatePath;
  if (!path) return NextResponse.json({ ok: true });

  const supabase = await getPrivileged();
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) {
    console.error("legal certificate delete failed", error);
    return NextResponse.json({ error: "Could not remove that document." }, { status: 500 });
  }

  const legal = { ...(content.legal ?? {}) };
  delete legal.certificatePath;
  await saveContent({ ...content, legal });

  return NextResponse.json({ ok: true });
}
