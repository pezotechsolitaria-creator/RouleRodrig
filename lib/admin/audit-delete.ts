import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { audit } from "@/lib/admin/audit";

// ── A delete leaves a line in the trail (architecture review 2026-09-30,
//    item 3) ──────────────────────────────────────────────────────────────────
//
// The admin DELETE handlers for contact submissions, the waitlist, reviews,
// driver reviews, owner applications and Ti Roulé questions removed rows and
// wrote nothing, so once a row was gone nothing said it had existed, what it
// was, or when it went. Each handler now deletes with `.select()` — PostgREST
// hands back exactly the rows it removed, in the same statement — and records
// their key fields here.
//
// KEY fields, not the row: this is a trail, not a backup (lib/admin/audit.ts).
// A message body, a review's text or a storage path stays out.

/** The named fields of a row, skipping any the row does not have. */
export function keyFields(
  row: Record<string, unknown> | null | undefined,
  keys: readonly string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!row) return out;
  for (const k of keys) if (k in row) out[k] = row[k];
  return out;
}

/**
 * One audit row per row the delete actually removed. Nothing is written when
 * nothing was removed: a delete of an id that was already gone deleted nothing.
 * Best-effort, like audit() itself — the rows are already gone either way.
 */
export async function auditDeletedRows(
  admin: SupabaseClient,
  entry: { action: string; entityType: string; rows: unknown; keys: readonly string[] },
): Promise<void> {
  const rows = Array.isArray(entry.rows) ? (entry.rows as Record<string, unknown>[]) : [];
  for (const row of rows) {
    await audit(admin, {
      action: entry.action,
      entityType: entry.entityType,
      entityId: row.id != null ? String(row.id) : null,
      diff: keyFields(row, entry.keys),
    });
  }
}
