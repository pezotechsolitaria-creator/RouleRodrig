import "server-only";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { hideKey, isHideKind } from "./kinds";

/**
 * The keys (`${kind}:${id}`) a customer has cleared, for filtering a list the
 * server builds with the service role — the activity feed reads bookings and
 * rides that way, filtered by the session's verified email.
 *
 * `userId` must come from auth.getUser(), never from the request: this reads
 * with the service role and trusts it.
 *
 * Returns an empty set when the read fails. A failed read must never HIDE
 * anything; showing a cleared item again is the safe direction.
 */
export async function hiddenKeysFor(userId: string): Promise<Set<string>> {
  const out = new Set<string>();
  if (!userId || !hasServiceRole()) return out;
  try {
    const admin = await getPrivileged();
    const { data, error } = await admin
      .from("customer_hidden_items")
      .select("kind, item_id")
      .eq("user_id", userId)
      .limit(1000);
    if (error) {
      console.error("hiddenKeysFor failed", error);
      return out;
    }
    for (const r of (data ?? []) as { kind: string; item_id: string }[]) {
      if (isHideKind(r.kind)) out.add(hideKey(r.kind, r.item_id));
    }
  } catch (err) {
    console.error("hiddenKeysFor threw", err);
  }
  return out;
}
