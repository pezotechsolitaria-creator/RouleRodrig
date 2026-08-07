import { NextRequest, NextResponse } from 'next/server';
import { getContent, getContentWithStatus, saveContent, type SiteContent } from '@/lib/content';
import { contentSaveVerdict } from '@/lib/content-guard';
import { verifySession, COOKIE_NAME } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

function isAuthed(req: NextRequest) {
  return verifySession(req.cookies.get(COOKIE_NAME)?.value);
}

export async function GET(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(await getContent());
}

export async function PUT(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = (await req.json()) as SiteContent;

    // This PUT replaces the WHOLE site in one write, so it must never accept a
    // payload that only a failure could produce. See lib/content-guard.ts —
    // the danger is not a hostile admin, it is a Supabase blip making /admin
    // render seed defaults that one click then makes permanent.
    const { content: stored, loaded } = await getContentWithStatus();
    if (!loaded) {
      return NextResponse.json(
        { error: 'Could not read the current content, so the save was refused to avoid overwriting it. Please retry in a moment.' },
        { status: 503 },
      );
    }
    const verdict = contentSaveVerdict(body, stored);
    if (!verdict.ok) {
      console.error('[admin] content save refused —', verdict.reason);
      return NextResponse.json({ error: verdict.reason }, { status: 422 });
    }

    await saveContent(body);
    // Bust the ISR cache so edits show immediately. The homepage and /browse
    // are not the only content-backed routes — /faq, /explore, /map, /more,
    // /trip-planner, the guides and the /fr pages all read getContent() under
    // an hour-long revalidate, so an FAQ edit used to report "Saved!" while the
    // public page served stale copy for up to 60 minutes.
    revalidatePath('/');
    revalidatePath('/browse/[category]', 'page');
    for (const p of ['/faq', '/explore', '/map', '/more', '/trip-planner', '/taxi', '/food', '/guide/rodrigues']) {
      revalidatePath(p);
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to save content' }, { status: 500 });
  }
}
