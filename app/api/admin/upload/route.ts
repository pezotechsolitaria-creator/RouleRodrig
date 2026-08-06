import { NextRequest, NextResponse } from 'next/server';
import { verifySession, COOKIE_NAME } from '@/lib/auth';
import { getPrivileged } from '@/lib/supabase/admin';
import { detectFileType } from '@/lib/file-signature';

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
const EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic',
};

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

    // Derive the extension from the detected type, never from the filename.
    const ext = EXT[detectedType];
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const supabase = await getPrivileged();
    const { error } = await supabase.storage
      .from('uploads')
      .upload(filename, file, {
        contentType: detectedType,
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
