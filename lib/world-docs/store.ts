import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { freshWorldDoc, DEFAULT_CURATED } from "./defaults";
import type { WorldDoc, WorldDocRecord, WorldId, WorldRevision } from "./types";

// ── Reading a world ─────────────────────────────────────────────────────────
//
// The public path goes through the anon key and the `world_published()` RPC —
// cookie-free on purpose, exactly like lib/content.ts. A cookie-bearing client
// would opt every page that reads a world out of ISR, which on this site means
// turning a cached page into a database round-trip per visitor.
//
// The admin path goes through the service role, because drafts are not
// reachable from the anon key by design (see the M104 migration).

function publicReadClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "";
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Fill in anything a stored document is missing.
 *
 * Documents are saved by an editor months before a field is added to the type,
 * so every read has to assume the stored shape is older than the code. The
 * alternative — trusting the blob — is a page that throws on `doc.hero.ctaLabel`
 * because the row predates the CTA.
 */
export function mergeWorldDoc(
  parsed: Partial<WorldDoc> | null | undefined,
  world: WorldId = "curated",
): WorldDoc {
  const base = freshWorldDoc(world);
  if (!parsed || typeof parsed !== "object") return base;
  return {
    version: 1,
    hero: { ...base.hero, ...(parsed.hero ?? {}) },
    quickActions: {
      enabled: parsed.quickActions?.enabled ?? true,
      items: parsed.quickActions?.items?.length
        ? parsed.quickActions.items
        : base.quickActions.items,
    },
    // An empty label library is a legitimate editorial choice ("no badges"), so
    // only a MISSING one falls back — `?? `, not `||`.
    labels: parsed.labels ?? base.labels,
    // An empty sections array is likewise legitimate: it means the owner turned
    // the page down to its hero. Only a missing key seeds.
    sections: parsed.sections ?? base.sections,
    seo: { ...base.seo, ...(parsed.seo ?? {}) },
  };
}

/**
 * The document the PUBLIC sees for a world, defaults included.
 *
 * Never throws: a database blip serves the seed document rather than a broken
 * page, which is the same trade lib/content.ts makes and for the same reason.
 */
export async function getPublishedWorld(world: WorldId): Promise<WorldDoc> {
  try {
    const supabase = publicReadClient();
    const { data, error } = await supabase.rpc("world_published", { p_world: world });
    if (error) throw error;
    if (data) return mergeWorldDoc(data as Partial<WorldDoc>, world);
  } catch {
    /* fall through to the seed document */
  }
  return freshWorldDoc(world);
}

// ── Admin-side reads and writes ─────────────────────────────────────────────

async function privileged() {
  const { getPrivileged } = await import("@/lib/supabase/admin");
  return getPrivileged();
}

/** Is the service-role key configured at all? Decides which failure to report. */
function hasServiceRoleKey(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

type Row = {
  world: string;
  draft: unknown;
  scheduled: unknown;
  scheduled_at: string | null;
  published: unknown;
  published_at: string | null;
  updated_at: string | null;
};

const EMPTY = (world: WorldId, storageError: string | null): WorldDocRecord => ({
  world,
  published: null,
  draft: null,
  publishedAt: null,
  updatedAt: null,
  scheduledAt: null,
  storageError,
});

/**
 * Everything the editor needs about a world — draft, published, schedule.
 *
 * A release whose time has passed is folded into `published` HERE rather than
 * being left to a cron job. The public read already serves the snapshot once
 * the clock passes it, so folding is bookkeeping, not the release mechanism:
 * it just stops the admin from showing "scheduled for last Tuesday" forever.
 */
export async function getWorldRecord(world: WorldId): Promise<WorldDocRecord> {
  const supabase = await privileged();
  const { data, error } = await supabase
    .from("world_content")
    .select("world, draft, scheduled, scheduled_at, published, published_at, updated_at")
    .eq("world", world)
    .maybeSingle<Row>();

  // Reported, not thrown. The two ways this fails are a machine with no
  // SUPABASE_SERVICE_ROLE_KEY (these tables are service_role-only by design)
  // and Supabase being unreachable — and in both, an editor is far better
  // served by their page shown read-only with the reason than by a 500.
  if (error) {
    const missingKey = !hasServiceRoleKey();
    return EMPTY(
      world,
      missingKey
        ? "Draft storage is unreachable because SUPABASE_SERVICE_ROLE_KEY is not set on this machine. The worlds tables are locked to the service role, so nothing here can be saved until it is."
        : `Draft storage could not be read: ${error.message}`,
    );
  }

  // No row yet: the world is running on the seed document. Report that
  // honestly rather than inventing a row — the editor sees "not yet saved".
  if (!data) return EMPTY(world, null);

  let published = (data.published as Partial<WorldDoc> | null) ?? null;
  let scheduledAt = data.scheduled_at;
  const releaseDue =
    data.scheduled && scheduledAt && Date.parse(scheduledAt) <= Date.now();
  if (releaseDue) {
    published = data.scheduled as Partial<WorldDoc>;
    scheduledAt = null;
    await supabase
      .from("world_content")
      .update({
        published: data.scheduled,
        published_at: data.scheduled_at,
        scheduled: null,
        scheduled_at: null,
      })
      .eq("world", world);
  }

  return {
    world,
    published: published ? mergeWorldDoc(published, world) : null,
    draft: data.draft ? mergeWorldDoc(data.draft as Partial<WorldDoc>, world) : null,
    publishedAt: data.published_at,
    updatedAt: data.updated_at,
    scheduledAt,
    storageError: null,
  };
}

/** The document an editor is working on: their draft, or a copy of what is live. */
export async function getEditableWorld(world: WorldId = "curated"): Promise<{
  doc: WorldDoc;
  record: WorldDocRecord;
}> {
  const record = await getWorldRecord(world);
  const doc = record.draft ?? record.published ?? freshWorldDoc(world);
  return { doc, record };
}

export async function saveDraft(world: WorldId, doc: WorldDoc, by: string): Promise<void> {
  const supabase = await privileged();
  const { error } = await supabase.from("world_content").upsert(
    {
      world,
      draft: doc,
      updated_at: new Date().toISOString(),
      updated_by: by,
    },
    { onConflict: "world" },
  );
  if (error) throw new Error(error.message);
}

/**
 * Make the draft public.
 *
 * The document being REPLACED is snapshotted first, so "publish" is always
 * reversible. Snapshotting the new one instead would archive a version that is
 * already live and lose the only copy of the one it overwrote.
 */
export async function publishWorld(
  world: WorldId,
  by: string,
  label?: string,
): Promise<void> {
  const supabase = await privileged();
  const { data, error: readErr } = await supabase
    .from("world_content")
    .select("draft, published")
    .eq("world", world)
    .maybeSingle<{ draft: unknown; published: unknown }>();
  if (readErr) throw new Error(readErr.message);
  if (!data?.draft) throw new Error("There is no draft to publish.");

  if (data.published) {
    await supabase.from("world_revisions").insert({
      world,
      data: data.published,
      label: label ?? null,
      created_by: by,
    });
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("world_content")
    .update({
      published: data.draft,
      published_at: now,
      published_by: by,
      // Publishing now supersedes any pending release — leaving it armed would
      // silently revert this publish when its clock came round.
      scheduled: null,
      scheduled_at: null,
      updated_at: now,
      updated_by: by,
    })
    .eq("world", world);
  if (error) throw new Error(error.message);

  await trimRevisions(world);
}

/**
 * Arm a release for a future moment.
 *
 * The draft is COPIED into `scheduled`. Editing the draft afterwards therefore
 * changes what the editor is working on, never what is about to go out — which
 * is the difference between a schedule and a time bomb.
 */
export async function scheduleWorld(
  world: WorldId,
  at: Date,
  by: string,
): Promise<void> {
  const supabase = await privileged();
  const { data, error: readErr } = await supabase
    .from("world_content")
    .select("draft")
    .eq("world", world)
    .maybeSingle<{ draft: unknown }>();
  if (readErr) throw new Error(readErr.message);
  if (!data?.draft) throw new Error("There is no draft to schedule.");

  const { error } = await supabase
    .from("world_content")
    .update({
      scheduled: data.draft,
      scheduled_at: at.toISOString(),
      updated_at: new Date().toISOString(),
      updated_by: by,
    })
    .eq("world", world);
  if (error) throw new Error(error.message);
}

export async function cancelSchedule(world: WorldId): Promise<void> {
  const supabase = await privileged();
  const { error } = await supabase
    .from("world_content")
    .update({ scheduled: null, scheduled_at: null })
    .eq("world", world);
  if (error) throw new Error(error.message);
}

/** Throw the draft away and start again from what is live. */
export async function discardDraft(world: WorldId): Promise<void> {
  const supabase = await privileged();
  const { error } = await supabase
    .from("world_content")
    .update({ draft: null, updated_at: new Date().toISOString() })
    .eq("world", world);
  if (error) throw new Error(error.message);
}

export async function listRevisions(world: WorldId, limit = 20): Promise<WorldRevision[]> {
  const supabase = await privileged();
  const { data, error } = await supabase
    .from("world_revisions")
    .select("id, world, label, created_at, created_by")
    .eq("world", world)
    .order("created_at", { ascending: false })
    .limit(limit);
  // An unreadable history is a missing panel, not a broken studio — the same
  // reasoning as getWorldRecord above.
  if (error) return [];
  return (data ?? []).map((r) => ({
    id: r.id as string,
    world: r.world as WorldId,
    label: (r.label as string) ?? null,
    createdAt: r.created_at as string,
    createdBy: (r.created_by as string) ?? null,
  }));
}

/**
 * Put an old version back — as the DRAFT, not straight onto the live site.
 *
 * A rollback is a decision about what visitors see, so it goes through the same
 * publish button as everything else. Restoring silently over the live page
 * would make the one control an editor reaches for in a panic the only one with
 * no preview and no confirmation.
 */
export async function rollbackWorld(
  world: WorldId,
  revisionId: string,
  by: string,
): Promise<WorldDoc> {
  const supabase = await privileged();
  const { data, error } = await supabase
    .from("world_revisions")
    .select("data")
    .eq("id", revisionId)
    .eq("world", world)
    .maybeSingle<{ data: unknown }>();
  if (error) throw new Error(error.message);
  if (!data?.data) throw new Error("That version could not be found.");

  const doc = mergeWorldDoc(data.data as Partial<WorldDoc>, world);
  await saveDraft(world, doc, by);
  return doc;
}

/**
 * Keep the history useful rather than complete.
 *
 * Twenty versions is more than anyone has ever scrolled back through, and each
 * one is a full copy of a page document; an unbounded table here would grow for
 * the rest of the site's life to serve a button nobody presses twice.
 */
async function trimRevisions(world: WorldId, keep = 20): Promise<void> {
  try {
    const supabase = await privileged();
    const { data } = await supabase
      .from("world_revisions")
      .select("id")
      .eq("world", world)
      .order("created_at", { ascending: false })
      .range(keep, keep + 200);
    const ids = (data ?? []).map((r) => r.id as string);
    if (ids.length) await supabase.from("world_revisions").delete().in("id", ids);
  } catch {
    /* trimming is housekeeping — never fail a publish over it */
  }
}

export { DEFAULT_CURATED, freshWorldDoc };
