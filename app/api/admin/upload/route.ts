import { NextRequest, NextResponse } from 'next/server';
import { verifySession, COOKIE_NAME } from '@/lib/auth';
import { getPrivileged } from '@/lib/supabase/admin';
import { detectFileType } from '@/lib/file-signature';
import { optimiseForWeb } from '@/lib/images/optimise';

// Uploads images to the Supabase Storage `uploads` bucket and returns a
// public URL. Uses Supabase (always configured) instead of Vercel Blob.
//
// This route used to accept anything whose CLIENT-DECLARED file.type started
// with "image/" — which "image/svg+xml" does — and applied no size cap, into a
// PUBLIC bucket. It now matches the other three upload routes: magic-byte
// detection (lib/file-signature.ts) and an explicit size limit. The bucket's
// own MIME/size limits are the backstop; this layer exists to fail with a
// readable message instead of a raw storage error.
const MAX_BYTES = 4 * 1024 * 1024; // 4 MB — under Vercel's ~4.5MB body cap
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic']);

export async function POST(req: NextRequest) {
  if (!verifySession(req.cookies.get(COOKIE_NAME)?.value)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Image must be 4 MB or smaller.' }, { status: 413 });
    }

    const detectedType = await detectFileType(file);
    if (!detectedType || !ALLOWED.has(detectedType)) {
      return NextResponse.json(
        { error: 'File must be a JPEG, PNG, WebP or HEIC image.' },
        { status: 400 },
      );
    }

    // Resize and re-encode before it is stored, because what lands here is a
    // camera photo and what leaves is a page on mobile data. Measured on this
    // bucket's own files: 3,122 kB -> 345 kB. It also strips EXIF, which on a
    // PUBLIC bucket means stripping the GPS coordinates the phone wrote in.
    let image;
    try {
      image = await optimiseForWeb(await file.arrayBuffer(), detectedType);
    } catch {
      return NextResponse.json(
        { error: 'That image could not be read. Try saving it as a JPEG first.' },
        { status: 400 },
      );
    }

    // Extension follows what was actually ENCODED, not what was uploaded — a
    // HEIC that came out as WebP must not be stored under a .heic name.
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${image.ext}`;

    const supabase = await getPrivileged();
    const { error } = await supabase.storage
      .from('uploads')
      .upload(filename, image.body, {
        contentType: image.contentType,
        cacheControl: '31536000',
        upsert: false,
      });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data } = supabase.storage.from('uploads').getPublicUrl(filename);
    return NextResponse.json({ path: data.publicUrl });
  } catch {
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
