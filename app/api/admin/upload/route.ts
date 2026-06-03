import { NextRequest, NextResponse } from 'next/server';
import { verifySession, COOKIE_NAME } from '@/lib/auth';

const IS_VERCEL = !!process.env.BLOB_READ_WRITE_TOKEN;

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

    if (IS_VERCEL) {
      // Vercel Blob storage
      const { put } = await import('@vercel/blob');
      const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase();
      const filename = `uploads/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const blob = await put(filename, file, { access: 'public' });
      return NextResponse.json({ path: blob.url });
    }

    // Local development — save to public/uploads/
    const { writeFile, mkdir } = await import('fs/promises');
    const { existsSync } = await import('fs');
    const { join } = await import('path');

    const uploadsDir = join(process.cwd(), 'public', 'uploads');
    if (!existsSync(uploadsDir)) await mkdir(uploadsDir, { recursive: true });

    const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase();
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    await writeFile(join(uploadsDir, filename), Buffer.from(await file.arrayBuffer()));
    return NextResponse.json({ path: `/uploads/${filename}` });
  } catch {
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
