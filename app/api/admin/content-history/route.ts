import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { guardAdminApi, readJson, failed } from "@/lib/admin/api-guard";
import { audit } from "@/lib/admin/audit";
import {
  saveContent,
  revalidateContentPages,
  sameContentVersion,
  ContentConflictError,
  type SiteContent,
} from "@/lib/content";
import { contentSaveVerdict } from "@/lib/content-guard";
import { NO_ROW_VERSION } from "@/lib/admin/content-version";
import { HISTORY_PAGE_SIZE, changedSections, collectionChanges } from "@/lib/admin/content-history";

// ── CONTENT HISTORY, AND A RESTORE THAT CAN ITSELF BE UNDONE ────────────────
//
// architecture review 2026-09-30, item 6. site_content_history holds a copy of
// the site blob for every day it changed, 90 days back (the reminders cron).
// It is service-role only by design (M22), and no screen read it, so the only
// way back from a bad save was SQL.
//
// A restore replaces the WHOLE site, so it is done in this order and no other:
//
//   1. the page must have seen the row as it is now — the same version check
//      the studio's Save makes, so a restore chosen against a stale list does
//      not wipe an edit made since;
//   2. the CURRENT row is copied into the history first. If that copy fails,
//      nothing is restored: a restore with no way back is the bad save again;
//   3. the snapshot is written through saveContent() with the version it
//      expects, so a save landing in the same second is refused, not lost;
//   4. the audit line, then the same cache busting as a studio save.
//
// The content guard's SHRINK check is deliberately not applied: going back a
// week can legitimately mean fewer places than today, and step 2 means that
// shrink is itself one click from undone. Its STRUCTURAL checks are applied —
// a snapshot that is not a site blob is never written.

type Raw = { data: unknown; updated_at: string | null } | null;

/**
 * The row as stored, NOT through getContentWithStatus(): that merges in the
 * defaults, and a snapshot compared against a merged blob would show sections
 * as "changed" that only the merge filled in.
 */
async function currentRow(admin: SupabaseClient): Promise<{ row: Raw; error: unknown }> {
  const { data, error } = await admin.from("site_content").select("data, updated_at").eq("id", "main").maybeSingle();
  const r = data as { data: unknown; updated_at: unknown } | null;
  return { row: r ? { data: r.data, updated_at: r.updated_at == null ? null : String(r.updated_at) } : null, error };
}

export async function GET(req: NextRequest) {
  const gate = await guardAdminApi(req, "Content history");
  if (gate instanceof NextResponse) return gate;
  const { admin } = gate;

  const pageParam = Number(new URL(req.url).searchParams.get("page") ?? "0");
  const page = Number.isInteger(pageParam) && pageParam >= 0 && pageParam < 1000 ? pageParam : 0;
  const from = page * HISTORY_PAGE_SIZE;

  const { row, error: curErr } = await currentRow(admin);
  if (curErr) return failed(curErr, "Could not read the current content.");

  // One extra row says whether there is a next page without a count query.
  const { data, error } = await admin
    .from("site_content_history")
    .select("id, created_at, data")
    .eq("content_id", "main")
    .order("created_at", { ascending: false })
    .range(from, from + HISTORY_PAGE_SIZE);
  if (error) return failed(error, "Could not read the content history.");

  const list = (data ?? []) as { id: string | number; created_at: string; data: unknown }[];
  const shown = list.slice(0, HISTORY_PAGE_SIZE);
  return NextResponse.json({
    page,
    pageSize: HISTORY_PAGE_SIZE,
    hasMore: list.length > HISTORY_PAGE_SIZE,
    current: { version: row?.updated_at ?? NO_ROW_VERSION },
    // The blobs themselves stay on the server: the desk needs what DIFFERS,
    // and sending ten 150 kB copies to a phone to show ten lines is waste.
    snapshots: shown.map((s) => ({
      id: String(s.id),
      createdAt: s.created_at,
      changed: changedSections(s.data, row?.data),
      counts: collectionChanges(row?.data, s.data),
    })),
  });
}

const restoreSchema = z.object({
  id: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9-]+$/, "That snapshot id is not valid."),
  /** The version the desk loaded, or NO_ROW_VERSION. */
  expectedVersion: z.string().trim().min(1).max(64),
});

export async function POST(req: NextRequest) {
  const gate = await guardAdminApi(req, "Content history");
  if (gate instanceof NextResponse) return gate;
  const { admin } = gate;

  const body = await readJson(req);
  if (body instanceof NextResponse) return body;
  const parsed = restoreSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }
  const { id, expectedVersion } = parsed.data;

  // 1 — the page saw the row as it is now.
  const { row, error: curErr } = await currentRow(admin);
  if (curErr) return failed(curErr, "Could not read the current content, so nothing was restored.");
  const expected = expectedVersion === NO_ROW_VERSION ? null : expectedVersion;
  if (!sameContentVersion(expected, row?.updated_at ?? null)) {
    return NextResponse.json(
      {
        error: "The content changed since this list was loaded — reload it and check the differences again. Nothing was restored.",
        code: "conflict",
      },
      { status: 409 },
    );
  }

  const { data: snap, error: snapErr } = await admin
    .from("site_content_history")
    .select("id, created_at, data")
    .eq("content_id", "main")
    .eq("id", id)
    .maybeSingle();
  if (snapErr) return failed(snapErr, "Could not read that snapshot.");
  if (!snap) return NextResponse.json({ error: "That snapshot no longer exists (they are kept 90 days)." }, { status: 404 });
  const snapshot = snap as { id: string | number; created_at: string; data: unknown };

  // Structure only (current = null): an object with the site's sections.
  const verdict = contentSaveVerdict(snapshot.data, null);
  if (!verdict.ok) {
    return NextResponse.json({ error: `That snapshot cannot be restored: ${verdict.reason}` }, { status: 422 });
  }

  // 2 — the way back, before anything is overwritten.
  let backupId: string | null = null;
  if (row) {
    const { data: backup, error: backErr } = await admin
      .from("site_content_history")
      .insert({ content_id: "main", data: row.data })
      .select("id")
      .single();
    if (backErr) {
      return failed(backErr, "Could not save a copy of the current content first, so nothing was restored.");
    }
    backupId = String((backup as { id: string | number }).id);
  }

  // 3 — the write, conditional on the version checked in step 1.
  let saved: { updatedAt: string };
  try {
    saved = await saveContent(snapshot.data as SiteContent, { expectedUpdatedAt: row?.updated_at ?? null });
  } catch (err) {
    if (err instanceof ContentConflictError) {
      return NextResponse.json(
        {
          error: "Someone saved the content at the same moment, so the restore was refused. The copy made first is kept in the list.",
          code: "conflict",
        },
        { status: 409 },
      );
    }
    return failed(err, "The restore did not complete. The current content is unchanged.");
  }

  // 4 — the trail, then the same cache busting as a studio save.
  const changed = changedSections(snapshot.data, row?.data);
  await audit(admin, {
    action: "content.restore",
    entityType: "site_content",
    entityId: "main",
    diff: { snapshotId: String(snapshot.id), snapshotAt: snapshot.created_at, backupId, changed },
  });
  try {
    revalidateContentPages();
  } catch (err) {
    console.error("content restored but pages were not revalidated", err);
  }

  return NextResponse.json({ ok: true, version: saved.updatedAt, backupId, changed });
}
