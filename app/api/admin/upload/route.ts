import { NextRequest, NextResponse } from 'next/server';
import { verifySession, COOKIE_NAME } from '@/lib/auth';
import { getPrivileged } from '@/lib/supabase/admin';

// Uploads images to the Supabase Storage `uploads` bucket and returns a
// public URL. Uses Supabase (always configured) instead of Vercel Blob.
export async function POST(req: NextRequest) {
  if (!verifySession(req.cookies.get(COOKIE_NAME)?.value)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'File must be an image' }, { status: 400 });
    }

    const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase();
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const supabase = await getPrivileged();
    const { error } = await supabase.storage
      .from('uploads')
      .upload(filename, file, {
        contentType: file.type,
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
