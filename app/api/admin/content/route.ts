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
  // The EDITOR reads uncached, deliberately. getContent() is cached across
  // requests for the public site, which is where the 35 GB/month of egress was
  // going; loading this screen from that cache would let the owner edit a stale
  // copy and save it back over newer content. The public site can be a minute
  // behind. The thing being edited cannot.
  return NextResponse.json((await getContentWithStatus()).content);
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

    // The audit line for the platform's most consequential write: this PUT
    // replaces the entire public site in one blob. Which top-level areas moved
    // is enough for a trail; storing the blob itself would turn the log into a
    // second, uncontrolled backup of the site.
    try {
      const { getPrivileged, hasServiceRole } = await import("@/lib/supabase/admin");
      const { audit } = await import("@/lib/admin/audit");
      if (hasServiceRole()) {
        const changed = Object.keys(body).filter(
          (k) => JSON.stringify((body as unknown as Record<string, unknown>)[k]) !==
                 JSON.stringify((stored as unknown as Record<string, unknown>)[k]),
        );
        await audit(await getPrivileged(), {
          action: "content.save",
          entityType: "site_content",
          entityId: "main",
          diff: { changed },
        });
      }
    } catch (err) {
      console.error("content save audit failed", err);
    }
    // Bust the ISR cache so edits show immediately. The homepage and /browse
    // are not the only content-backed routes — /faq, /explore, /map, /more,
    // /trip-planner, the guides and the /fr pages all read getContent() under
    // an hour-long revalidate, so an FAQ edit used to report "Saved!" while the
    // public page served stale copy for up to 60 minutes.
    revalidatePath('/');
    revalidatePath('/browse/[category]', 'page');
    // A massage added in admin is served from a 5-minute ISR cache at
    // /experiences/<type>. Without this the owner saves, looks, sees nothing,
    // and concludes the feature is broken.
    revalidatePath('/experiences/[type]', 'page');
    for (const p of ['/faq', '/explore', '/map', '/more', '/trip-planner', '/taxi', '/food', '/guide/rodrigues']) {
      revalidatePath(p);
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to save content' }, { status: 500 });
  }
}
