import { NextRequest, NextResponse } from 'next/server';
import { getContentWithStatus, saveContent, sameContentVersion, ContentConflictError } from '@/lib/content';
import { CONTENT_BASE_HEADER, CONTENT_CONFLICT_MESSAGE, NO_ROW_VERSION } from '@/lib/admin/content-version';
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

  // ── ON THE STUDIO'S VERSION, LIKE ITS SAVE (architecture review 2026-09-30,
  // content-studio save safety, item 4) ───────────────────────────────────
  // This route is called from inside the content studio and writes the row
  // the studio's Save writes. It used to write unconditionally and keep the
  // new updated_at to itself, so the studio's base version went stale on its
  // OWN write: the next Save or photo upload in that tab was refused as
  // "Someone saved in another tab", every time, and the only way out — a
  // reload — threw away every unsaved edit. So the delete carries the studio's
  // version, refuses when the row really moved, writes conditionally, and
  // hands the new version back for the studio to adopt.
  const base = req.headers.get(CONTENT_BASE_HEADER);
  if (!base) {
    return NextResponse.json(
      { error: 'This studio page is out of date — reload it before deleting photos. Nothing was changed.', code: 'no-version' },
      { status: 428 },
    );
  }

  // Read-modify-WRITE of the whole-site blob, so it reads uncached and refuses
  // on a failed read. getContent() is cached across requests for the public
  // site; deleting one photo from a stale copy and saving it back would revert
  // every other edit made since. And a DB blip returning seed defaults would
  // write an empty site — 404 saves us today only because DEFAULT gallery is
  // empty, which is luck, not a guarantee.
  const { content, loaded, updatedAt } = await getContentWithStatus();
  if (!loaded) {
    return NextResponse.json(
      { error: 'Could not read the current content, so the delete was refused. Please retry in a moment.' },
      { status: 503 },
    );
  }
  const expected = base === NO_ROW_VERSION ? null : base;
  if (!sameContentVersion(expected, updatedAt)) {
    // Same two sentences as the studio's own PUT: "no row when I loaded" while
    // a row exists is a page that opened on the seed defaults during a blip.
    const error =
      expected === null
        ? 'This page opened without the live content (the database could not be reached) — reload before deleting photos.'
        : CONTENT_CONFLICT_MESSAGE;
    return NextResponse.json({ error, code: 'conflict', currentVersion: updatedAt }, { status: 409 });
  }

  // Checked AFTER the version: on the studio's own version, a photo missing
  // from the row can only be one this tab added and never saved (an upload
  // whose save was refused). The studio drops it from the screen on this code.
  const image = content.gallery.find((img) => img.id === id);
  if (!image) {
    return NextResponse.json({ error: 'That photo is not in the saved gallery.', code: 'not-saved' }, { status: 404 });
  }

  content.gallery = content.gallery.filter((img) => img.id !== id);
  let saved: { updatedAt: string };
  try {
    saved = await saveContent(content, { expectedUpdatedAt: updatedAt });
  } catch (err) {
    // Lost a same-second race with another writer: the conditional write
    // matched nothing, so nothing was changed and the file is still in use.
    if (err instanceof ContentConflictError) {
      return NextResponse.json({ error: CONTENT_CONFLICT_MESSAGE, code: 'conflict' }, { status: 409 });
    }
    const detail = err instanceof Error && err.message ? ` (${err.message})` : '';
    console.error('gallery delete failed', err);
    return NextResponse.json({ error: `The photo was not deleted${detail}.` }, { status: 500 });
  }

  // The file goes only once the row no longer points at it. It used to go
  // first, so a refused or failed write left the site showing a broken photo.
  await deleteImageFile(image.src);
  revalidatePath('/');
  return NextResponse.json({ success: true, updatedAt: saved.updatedAt });
}
