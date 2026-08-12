import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// ── One way to record "an admin did this" ──────────────────────────────────
//
// The audit_logs table has existed for months and received almost nothing,
// because every route that wanted to write to it had to hand-roll the insert
// — so most never did. This helper makes the honest path the short path.
//
// TWO RULES:
//  · Best-effort, never blocking. An audit insert failure must not fail the
//    action it describes — a suspended driver who is "un-suspended" by a
//    logging error is a worse outcome than a missing log line.
//  · actor is a LABEL, not an identity. /admin authenticates with one shared
//    password cookie, so "who" can only ever be "the admin session" until real
//    per-person accounts exist. Writing a fake user id here would launder that
//    limitation into the audit trail; naming it keeps the trail honest.

export type AuditEntry = {
  /** verb.noun, e.g. "order.status", "content.save", "kitchen.update" */
  action: string;
  entityType: string;
  entityId?: string | null;
  /** What changed. Keep it small — this is a trail, not a backup. */
  diff?: Record<string, unknown> | null;
};

export async function audit(admin: SupabaseClient, entry: AuditEntry): Promise<void> {
  try {
    const { error } = await admin.from("audit_logs").insert({
      actor_id: null,
      actor_role: "admin-session",
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId ?? null,
      diff: entry.diff ?? null,
    });
    if (error) console.error("audit write failed", entry.action, error);
  } catch (err) {
    console.error("audit write threw", entry.action, err);
  }
}
