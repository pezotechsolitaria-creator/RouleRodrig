import { NextRequest, NextResponse } from 'next/server';
import { getContent, saveContent } from '@/lib/content';
import { verifySession, COOKIE_NAME } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { unlink } from 'fs/promises';
import path from 'path';

function isAuthed(req: NextRequest) {
  return verifySession(req.cookies.get(COOKIE_NAME)?.value);
}

export async function DELETE(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const content = getContent();
  const image = content.gallery.find((img) => img.id === id);
  if (!image) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Delete physical file (best-effort)
  if (image.src.startsWith('/uploads/')) {
    try {
      await unlink(path.join(process.cwd(), 'public', image.src));
    } catch {
      /* file may not exist — ignore */
    }
  }

  content.gallery = content.gallery.filter((img) => img.id !== id);
  saveContent(content);
  revalidatePath('/');
  return NextResponse.json({ success: true });
}
