import { NextRequest, NextResponse } from "next/server";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { guard } from "@/lib/rate-limit";
import { detectFileType } from "@/lib/file-signature";
import { makeViewable } from "@/lib/images/optimise";

// POST /api/delivery-requests/photo — a picture of the thing being moved.
//
// ── WHY THIS MATTERS MORE THAN IT LOOKS ────────────────────────────────────
// The 2022 census (Vol. VI Table E2a) records that 44% of Rodriguans aged 60+
// cannot read or write — 64% at 75+, and 68% of women over 75. For close to
// half the people this surface was rebuilt for, no font size and no plain
// English reaches them at all.
//
// A photo does. "What are we collecting?" is a writing task; holding up a phone
// is not. So the photo is a FIRST-CLASS input beside the description rather
// than an attachment, and delivery_requests.photo_url — a column that has
// existed unused since the table was created — finally carries something.
//
// ── Private bucket, on purpose ─────────────────────────────────────────────
// A photo of a parcel is often a photo of somebody's doorway, their kitchen
// table, or a document. It goes to a PRIVATE bucket and this route returns only
// the storage PATH; the customer's and the driver's own endpoints sign it for a
// few minutes when they need to show it. An unguessable name in a public bucket
// would have been less work and is not the same thing.
//
// No session is required: the request itself does not exist yet when the photo
// is taken, so there is nothing to prove ownership against. The protections are
// the rate limit, the 4 MB cap, and the file-signature check below — the same
// three /api/owner-upload has always relied on.

export const dynamic = "force-dynamic";

const MAX_BYTES = 4 * 1024 * 1024;
// No SVG, deliberately, everywhere in this codebase: it is a script-execution
// shape wearing an image extension.
// image/avif: newer Android cameras and share sheets produce it. The
// signature sniffer returned null for those, so a photo just taken was
// refused as "not a photo" — and only when it was SMALL, because a large
// one is re-encoded to JPEG by the client shrinker before it arrives.
const ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/avif",
]);
const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/avif": "avif",
};

export async function POST(req: NextRequest) {
  const limited = guard(req, "delivery-photo", 12, 60_000);
  if (limited) return limited;

  if (!hasServiceRole()) {
    console.error("delivery photo: SUPABASE_SERVICE_ROLE_KEY missing");
    return NextResponse.json({ error: "Photos are unavailable right now." }, { status: 503 });
  }

  try {
    const fd = await req.formData();
    const file = fd.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No photo provided." }, { status: 400 });
    if (file.size > MAX_BYTES) {
      // Said in the words somebody holding a phone would use.
      return NextResponse.json(
        { error: "That photo is too big. Try taking it again." },
        { status: 400 },
      );
    }

    // file.type is the client-declared Content-Type of the multipart part and is
    // trivially spoofed. The real signature decides.
    const detected = await detectFileType(file);
    if (!detected || !ALLOWED.has(detected)) {
      return NextResponse.json({ error: "That file is not a photo." }, { status: 400 });
    }


    // ── HEIC BECOMES SOMETHING THE DRIVER CAN OPEN ────────────────────────
    // An iPhone HEIC is commonly 1–2 MB, so it clears the size cap and the
    // client shrinker leaves it alone — nothing to shrink. Stored as .heic it
    // is unreadable to every browser but Safari, which on the Android phone at
    // the customer's door is a blank tab. Pixels are kept; only the container
    // changes. AVIF is left alone — every current browser renders it.
    const out = await makeViewable(file, detected);
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${out.ext}`;
    const supabase = await getPrivileged();
    const { error } = await supabase.storage
      .from("delivery-photos")
      .upload(path, out.body, { contentType: out.contentType, upsert: false });

    if (error) {
      console.error("delivery photo upload failed", error);
      return NextResponse.json({ error: "Could not save the photo." }, { status: 500 });
    }

    // The PATH only. The bucket is private and nothing here is displayable.
    return NextResponse.json({ path });
  } catch {
    return NextResponse.json({ error: "Could not save the photo." }, { status: 500 });
  }
}
