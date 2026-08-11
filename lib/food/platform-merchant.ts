import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// ── The Food product boundary, in one function ──────────────────────────────
//
// THE RULE THIS EXISTS TO KEEP: a cooker is never a Roulé Rodrigues user. No
// account, no merchant record, no dashboard, no subscription, no tablet in the
// kitchen. The platform operator owns the catalog and the orders, and rings the
// cooker. A cooker exists in the database only as DATA — a name, a phone, an
// operational note in food_kitchen_ops.
//
// THE PROBLEM IT SOLVES: food is built as "a kitchen IS a store", which is the
// right call because it reuses server-derived pricing, the row-locked stock
// reservation, the cash/bank payment handshake, guest checkout, the pickup code
// and the delivery network instead of duplicating all of it. But that
// architecture drags a chain behind it:
//
//     food_kitchens.store_id → stores.merchant_id (NOT NULL)
//                            → merchants.owner_id (NOT NULL → auth.users)
//
// and the t_merchant_provision_owner trigger then inserts a merchant_staff row
// with role 'owner'. Create a kitchen the obvious way — one merchant per cooker
// — and you have minted a working merchant login with dashboard access as a
// side effect. That is a product requirement arriving through a foreign key.
//
// So EVERY kitchen belongs to ONE permanent, platform-owned merchant. Call this
// before creating a kitchen store and use what it returns. Never create a
// merchant per cooker.
//
// This is M40's Events pattern applied unchanged, deliberately: two features
// with the same shape should not invent two solutions, and the M40 deletion
// guard (a trigger that refuses to delete any merchant with a system_key)
// already protects this row without a line of new SQL.

export const PLATFORM_FOOD_SYSTEM_KEY = "food";

/**
 * The identity that technically owns the platform Food merchant.
 *
 * `.invalid` is reserved by RFC 2606 and can never receive mail — deliberate.
 * This is a service identity, not a person: nobody is given the password, and
 * because the address cannot receive a reset link, nobody can recover one
 * either. It exists solely to satisfy merchants.owner_id NOT NULL.
 */
const SERVICE_IDENTITY_EMAIL = "food.platform@roule-rodrigues.invalid";

export type PlatformFoodMerchant = { merchantId: string; created: boolean };

/**
 * Resolve the platform Food merchant, creating it on first use.
 *
 * Requires a SERVICE-ROLE client: it touches auth.users through the Auth Admin
 * API and writes a merchant row. Callers already hold one (`getPrivileged()`).
 *
 * Idempotent — safe to call on every kitchen creation. The
 * `merchants.system_key` unique constraint is the real guard against two of
 * these existing, so even a concurrent double-bootstrap resolves to one row.
 */
export async function ensurePlatformFoodMerchant(
  admin: SupabaseClient,
): Promise<PlatformFoodMerchant> {
  const existing = await findPlatformFoodMerchant(admin);
  if (existing) return { merchantId: existing, created: false };

  // A password nobody holds. Never printed, stored or returned; the account is
  // unreachable by design and only ever acted on by service_role.
  const password = crypto.randomUUID() + crypto.randomUUID();

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: SERVICE_IDENTITY_EMAIL,
    password,
    email_confirm: true,
    user_metadata: {
      system: true,
      purpose: "Owns the platform Food merchant so cookers never need accounts (M50).",
    },
  });

  let ownerId = created?.user?.id ?? null;

  // Already there from an earlier partial bootstrap: adopt it rather than
  // failing, so a half-finished first run self-heals on the next attempt.
  if (createError && !ownerId) {
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    ownerId = list?.users?.find((u) => u.email === SERVICE_IDENTITY_EMAIL)?.id ?? null;
    if (!ownerId) throw new Error(`Could not create the Food service identity: ${createError.message}`);
  }
  if (!ownerId) throw new Error("Could not create the Food service identity.");

  const { data: merchant, error: merchantError } = await admin
    .from("merchants")
    .insert({
      display_name: "Roulé Rodrigues Kitchen",
      legal_name: "Roulé Rodrigues Kitchen",
      owner_id: ownerId,
      // Approved immediately and permanently: store_is_visible() requires an
      // approved merchant, so a kitchen would otherwise be invisible until
      // somebody "approved" a merchant that is really just infrastructure.
      status: "approved",
      system_key: PLATFORM_FOOD_SYSTEM_KEY,
    })
    .select("id")
    .single();

  if (merchantError) {
    // Lost a race with a concurrent bootstrap — the unique constraint on
    // system_key did its job. Re-read rather than surfacing an error.
    const again = await findPlatformFoodMerchant(admin);
    if (again) return { merchantId: again, created: false };
    throw new Error(`Could not create the platform Food merchant: ${merchantError.message}`);
  }

  return { merchantId: merchant.id as string, created: true };
}

/** The merchant id if it exists yet, else null. Read-only. */
export async function findPlatformFoodMerchant(admin: SupabaseClient): Promise<string | null> {
  const { data, error } = await admin
    .from("merchants")
    .select("id")
    .eq("system_key", PLATFORM_FOOD_SYSTEM_KEY)
    .maybeSingle();

  if (error) {
    console.error("findPlatformFoodMerchant failed", error);
    return null;
  }
  return (data?.id as string | undefined) ?? null;
}
