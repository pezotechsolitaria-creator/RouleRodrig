import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// ── The Events product boundary, in one function ────────────────────────────
//
// THE RULE THIS EXISTS TO KEEP: an event organiser is never a Roulé Rodrigues
// user. No account, no merchant record, no dashboard, no subscription. They
// receive one thing — a revocable, event-scoped gate-scanner link — and they
// exist in the database only as event DATA (name, phone, contact).
//
// THE PROBLEM IT SOLVES: ticketing is built as "an event IS a store", which is
// the right call because it reuses the proven inventory locking, create_order
// and the payment handshake instead of duplicating them. But that architecture
// drags a chain behind it:
//
//     events.store_id → stores.merchant_id (NOT NULL)
//                     → merchants.owner_id (NOT NULL → auth.users)
//
// and the t_merchant_provision_owner trigger then inserts a merchant_staff row
// with role 'owner'. Create an event the obvious way — one merchant per
// organiser — and you have minted a working merchant login with dashboard
// access as a side effect. That is a product requirement arriving through a
// foreign key.
//
// So EVERY ticketed event store belongs to ONE permanent, platform-owned
// merchant. Call this before creating an event store and use what it returns.
// Never create a merchant per organiser.
//
// The internal model (event → platform store → variant inventory) and the
// product model (admin manages events, organiser gets a link) are allowed to
// differ. This function is the seam that keeps them from leaking into each
// other.

export const PLATFORM_EVENTS_SYSTEM_KEY = "events";

/**
 * The identity that technically owns the platform Events merchant.
 *
 * `.invalid` is reserved by RFC 2606 and can never receive mail — deliberate.
 * This is a service identity, not a person: nobody is given the password, and
 * because the address cannot receive a reset link, nobody can recover one
 * either. It exists solely to satisfy merchants.owner_id NOT NULL.
 *
 * A real address here would be worse in two ways: password-reset mail would
 * land in a human inbox, and the account would look like something a person is
 * meant to sign into.
 */
const SERVICE_IDENTITY_EMAIL = "events.platform@roule-rodrigues.invalid";

export type PlatformEventsMerchant = { merchantId: string; created: boolean };

/**
 * Resolve the platform Events merchant, creating it on first use.
 *
 * Requires a SERVICE-ROLE client: it touches auth.users through the Auth Admin
 * API and writes a merchant row. Callers already hold one (`getPrivileged()`).
 *
 * Idempotent — safe to call on every event creation. The `merchants.system_key`
 * unique constraint is the real guard against two of these existing, so even a
 * concurrent double-bootstrap resolves to one row.
 */
export async function ensurePlatformEventsMerchant(
  admin: SupabaseClient,
): Promise<PlatformEventsMerchant> {
  const existing = await findPlatformEventsMerchant(admin);
  if (existing) return { merchantId: existing, created: false };

  // A password nobody holds. It is never printed, stored or returned; the
  // account is unreachable by design and only ever acted on by service_role.
  const password = crypto.randomUUID() + crypto.randomUUID();

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: SERVICE_IDENTITY_EMAIL,
    password,
    email_confirm: true,
    user_metadata: {
      system: true,
      purpose: "Owns the platform Events merchant so organisers never need accounts (M40).",
    },
  });

  let ownerId = created?.user?.id ?? null;

  // Already there from an earlier partial bootstrap: adopt it rather than
  // failing, so a half-finished first run self-heals on the next attempt.
  if (createError && !ownerId) {
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    ownerId = list?.users?.find((u) => u.email === SERVICE_IDENTITY_EMAIL)?.id ?? null;
    if (!ownerId) throw new Error(`Could not create the Events service identity: ${createError.message}`);
  }
  if (!ownerId) throw new Error("Could not create the Events service identity.");

  const { data: merchant, error: merchantError } = await admin
    .from("merchants")
    .insert({
      display_name: "Roulé Rodrigues Events",
      legal_name: "Roulé Rodrigues Events",
      owner_id: ownerId,
      // Approved immediately and permanently: store_is_visible() requires an
      // approved merchant, so an event would otherwise be invisible until
      // somebody "approved" a merchant that is really just infrastructure.
      status: "approved",
      system_key: PLATFORM_EVENTS_SYSTEM_KEY,
    })
    .select("id")
    .single();

  if (merchantError) {
    // Lost a race with a concurrent bootstrap — the unique constraint on
    // system_key did its job. Re-read rather than surfacing an error.
    const again = await findPlatformEventsMerchant(admin);
    if (again) return { merchantId: again, created: false };
    throw new Error(`Could not create the platform Events merchant: ${merchantError.message}`);
  }

  return { merchantId: merchant.id as string, created: true };
}

/** The merchant id if it exists yet, else null. Read-only. */
export async function findPlatformEventsMerchant(admin: SupabaseClient): Promise<string | null> {
  const { data, error } = await admin.rpc("platform_events_merchant_id");
  if (error) {
    console.error("platform_events_merchant_id failed", error);
    return null;
  }
  return (data as string | null) ?? null;
}

/**
 * True when this store is platform infrastructure rather than a real seller's
 * shop. Marketplace screens should hide these: an event store is not something
 * the Shops admin should offer to edit, pause or delete.
 */
export function isPlatformEventsStore(store: { system_key?: string | null } | null | undefined): boolean {
  return store?.system_key === PLATFORM_EVENTS_SYSTEM_KEY;
}
