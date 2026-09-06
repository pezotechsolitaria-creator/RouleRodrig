import { NextRequest, NextResponse } from 'next/server';
import { getContentWithStatus, saveContent } from '@/lib/content';
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

  // Read-modify-WRITE of the whole-site blob, so it reads uncached and refuses
  // on a failed read. getContent() is cached across requests for the public
  // site; deleting one photo from a stale copy and saving it back would revert
  // every other edit made since. And a DB blip returning seed defaults would
  // write an empty site — 404 saves us today only because DEFAULT gallery is
  // empty, which is luck, not a guarantee.
  const { content, loaded } = await getContentWithStatus();
  if (!loaded) {
    return NextResponse.json(
      { error: 'Could not read the current content, so the delete was refused. Please retry in a moment.' },
      { status: 503 },
    );
  }
  const image = content.gallery.find((img) => img.id === id);
  if (!image) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await deleteImageFile(image.src);

  content.gallery = content.gallery.filter((img) => img.id !== id);
  await saveContent(content);
  revalidatePath('/');
  return NextResponse.json({ success: true });
}
