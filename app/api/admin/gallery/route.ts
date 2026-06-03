import { NextRequest, NextResponse } from 'next/server';
import { getContent, saveContent } from '@/lib/content';
import { verifySession, COOKIE_NAME } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

function isAuthed(req: NextRequest) {
  return verifySession(req.cookies.get(COOKIE_NAME)?.value);
}

async function deleteImageFile(src: string) {
  if (src.startsWith('http')) {
    // Vercel Blob — delete by URL
    try {
      const { del } = await import('@vercel/blob');
      await del(src);
    } catch { /* ignore */ }
  } else if (src.startsWith('/uploads/')) {
    // Local development — delete from disk
    try {
      const { unlink } = await import('fs/promises');
      const { join } = await import('path');
      await unlink(join(process.cwd(), 'public', src));
    } catch { /* file may not exist */ }
  }
}

export async function DELETE(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const content = await getContent();
  const image = content.gallery.find((img) => img.id === id);
  if (!image) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await deleteImageFile(image.src);

  content.gallery = content.gallery.filter((img) => img.id !== id);
  await saveContent(content);
  revalidatePath('/');
  return NextResponse.json({ success: true });
}
