import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Tests that need a real, pre-confirmed signed-in merchant (onboarding
// success, duplicate-merchant) use the Admin API to create/confirm/delete a
// throwaway user directly — this sidesteps Supabase's email-confirmation
// requirement and per-project email rate limit (hit during manual testing:
// ~3-4 signup emails/hour on this project's plan), which would otherwise
// make these tests flaky or force a real inbox in CI.
//
// Requires SUPABASE_SERVICE_ROLE_KEY, which is intentionally NOT present in
// local .env.local (matches this repo's existing pattern of PayPal creds
// living only in Vercel — see CLAUDE.md "Verify before you push"). Tests
// using this helper skip themselves with a clear reason when it's absent,
// rather than failing or silently no-op'ing.

export function hasServiceRole(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL);
}

function admin(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type TestUser = { id: string; email: string; password: string };

export async function createConfirmedMerchantUser(label: string): Promise<TestUser> {
  const email = `e2e.${label}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@example.test`;
  const password = "TestPass123!";
  const client = admin();
  const { data, error } = await client.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`Failed to create test user: ${error?.message}`);
  return { id: data.user.id, email, password };
}

/** Deletes the auth user and cascades their merchant/store/product rows (FK on delete cascade). */
export async function deleteTestUser(userId: string): Promise<void> {
  const client = admin();
  // merchants.owner_id is ON DELETE RESTRICT — remove any merchant first so
  // user cleanup can't silently leave orphaned test data behind.
  await client.from("merchants").delete().eq("owner_id", userId);
  await client.auth.admin.deleteUser(userId);
}
