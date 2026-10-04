import { NextRequest, NextResponse } from 'next/server';
import {
  getContentWithStatus,
  saveContent,
  revalidateContentPages,
  sameContentVersion,
  ContentConflictError,
  CONTENT_CONFLICT_MESSAGE,
  type SiteContent,
} from '@/lib/content';
import { contentSaveVerdict } from '@/lib/content-guard';
import { CONTENT_BASE_HEADER, NO_ROW_VERSION } from '@/lib/admin/content-version';
import { verifySession, COOKIE_NAME } from '@/lib/auth';

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
  const { content, updatedAt } = await getContentWithStatus();
  // The version rides in a header so the body stays the bare blob every
  // existing reader of this endpoint expects.
  return NextResponse.json(content, { headers: { [CONTENT_BASE_HEADER]: updatedAt ?? NO_ROW_VERSION } });
}

export async function PUT(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = (await req.json()) as SiteContent;

    // This PUT replaces the WHOLE site in one write, so it must never accept a
    // payload that only a failure could produce. See lib/content-guard.ts —
    // the danger is not a hostile admin, it is a Supabase blip making /admin
    // render seed defaults that one click then makes permanent.
    const { content: stored, loaded, updatedAt } = await getContentWithStatus();
    if (!loaded) {
      return NextResponse.json(
        { error: 'Could not read the current content, so the save was refused to avoid overwriting it. Please retry in a moment.' },
        { status: 503 },
      );
    }

    // ── WHICH VERSION WAS THIS EDITED FROM? (architecture review 2026-09-30,
    // item 4) ───────────────────────────────────────────────────────────────
    // Four routes write this row, and the studio sends all of it back. Without
    // the version it loaded, a tab opened before a BRN was saved in
    // /admin/legal puts the old legal block back — silently, since the guard
    // below only counts collections. A request with no version at all comes
    // from a studio page loaded before this check shipped, which is exactly
    // the stale tab this exists to stop, so it is asked to reload rather than
    // trusted.
    const base = req.headers.get(CONTENT_BASE_HEADER);
    if (!base) {
      return NextResponse.json(
        { error: 'This studio page is out of date — reload it before saving. Nothing was changed.', code: 'no-version' },
        { status: 428 },
      );
    }
    const expected = base === NO_ROW_VERSION ? null : base;
    if (!sameContentVersion(expected, updatedAt)) {
      // "No row when I loaded" while a row exists is almost always a page that
      // opened during a database blip and is showing the seed defaults — the
      // exact save lib/content-guard.ts was first written to stop. Same
      // refusal, truer sentence.
      const error =
        expected === null
          ? 'This page opened without the live content (the database could not be reached) — reload before saving.'
          : CONTENT_CONFLICT_MESSAGE;
      return NextResponse.json({ error, code: 'conflict', currentVersion: updatedAt }, { status: 409 });
    }

    const verdict = contentSaveVerdict(body, stored);
    if (!verdict.ok) {
      console.error('[admin] content save refused —', verdict.reason);
      return NextResponse.json({ error: verdict.reason, code: 'guard' }, { status: 422 });
    }

    // The server's own read is passed on, not the header: the two name the same
    // instant (checked above), and the database's spelling is the one its
    // equality filter is sure to match.
    let saved: { updatedAt: string };
    try {
      saved = await saveContent(body, { expectedUpdatedAt: updatedAt });
    } catch (err) {
      // Lost the race between the check above and the write — someone saved
      // in the same second. The conditional write refused it; say so.
      if (err instanceof ContentConflictError) {
        return NextResponse.json({ error: CONTENT_CONFLICT_MESSAGE, code: 'conflict' }, { status: 409 });
      }
      throw err;
    }

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
    // Bust the ISR cache so edits show immediately — every content-backed
    // path, listed once in lib/content.ts so the history restore uses the same
    // list.
    revalidateContentPages();
    return NextResponse.json({ success: true, updatedAt: saved.updatedAt });
  } catch (err) {
    // The studio now prints this sentence instead of "Error", so it carries
    // the database's own reason when there is one.
    const detail = err instanceof Error && err.message ? ` (${err.message})` : '';
    console.error('content save failed', err);
    return NextResponse.json({ error: `Failed to save content${detail}.` }, { status: 500 });
  }
}
