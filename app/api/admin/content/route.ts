import { NextRequest, NextResponse } from 'next/server';
import { getContent, saveContent, type SiteContent } from '@/lib/content';
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
    await saveContent(body);
    // Bust the ISR cache so edits show immediately on the homepage + all
    // /browse category pages (instead of waiting for the 60s revalidation).
    revalidatePath('/');
    revalidatePath('/browse/[category]', 'page');
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to save content' }, { status: 500 });
  }
}
